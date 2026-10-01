import { type Block, type BlockId, type Cfg, makeCfg, type Terminator } from './cfg.ts'
import { analyze, type Dominators, type MultiEntryScc } from './analysis.ts'

const MAX_DUPLICATED_STATEMENTS = 20
const MAX_ROUNDS = 8

export type NormalizeResult =
  | { readonly kind: 'ok'; readonly cfg: Cfg }
  | { readonly kind: 'irreducible' }

function countStatements(blocks: readonly Block[]): number {
  let total = 0
  for (const b of blocks) {
    total += b.body.length + 1
  }
  return total
}

function remapTerm(term: Terminator, copies: ReadonlyMap<BlockId, BlockId>): Terminator {
  switch (term.kind) {
    case 'goto': {
      const to = copies.get(term.to)
      return to === undefined ? term : { kind: 'goto', to }
    }
    case 'branch': {
      const then = copies.get(term.then) ?? term.then
      const elseId = copies.get(term.else) ?? term.else
      if (then === term.then && elseId === term.else) {
        return term
      }
      return { kind: 'branch', cond: term.cond, then, else: elseId }
    }
    case 'exit':
      return term
  }
}

function redirectTo(term: Terminator, target: BlockId, copyOf: BlockId): Terminator {
  switch (term.kind) {
    case 'goto':
      return term.to === target ? { kind: 'goto', to: copyOf } : term
    case 'branch': {
      const then = term.then === target ? copyOf : term.then
      const elseId = term.else === target ? copyOf : term.else
      if (then === term.then && elseId === term.else) {
        return term
      }
      return { kind: 'branch', cond: term.cond, then, else: elseId }
    }
    case 'exit':
      return term
  }
}

function duplicateBlocks(
  cfg: Cfg,
  region: readonly Block[],
  target: BlockId,
  redirectFrom: ReadonlySet<BlockId>,
): Cfg {
  let nextId = cfg.blocks.reduce((max, b) => Math.max(max, b.id), 0) + 1
  const copies = new Map<BlockId, BlockId>()
  for (const b of region) {
    copies.set(b.id, nextId)
    nextId += 1
  }
  const copyOf = copies.get(target) as BlockId

  const rewritten = cfg.blocks.map((b) =>
    redirectFrom.has(b.id) ? { id: b.id, body: b.body, term: redirectTo(b.term, target, copyOf) } : b
  )
  const duplicated = region.map((b) => ({
    id: copies.get(b.id) as BlockId,
    body: b.body,
    term: remapTerm(b.term, copies),
  }))

  return makeCfg([...rewritten, ...duplicated])
}

function dominatedInside(
  cfg: Cfg,
  dom: Dominators,
  scc: MultiEntryScc,
  entry: BlockId,
): Block[] {
  return cfg.blocks.filter((b) => scc.nodes.has(b.id) && dom.dominates(entry, b.id))
}

export function normalize(cfg: Cfg): NormalizeResult {
  let cur = cfg

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { dom, multiEntrySccs } = analyze(cur)
    const scc = multiEntrySccs[0]
    if (scc === undefined) {
      return { kind: 'ok', cfg: cur }
    }

    const bySize = scc.entries
      .map((entry) => ({ entry, region: dominatedInside(cur, dom, scc, entry) }))
      .sort((a, b) => b.region.length - a.region.length)
    const victim = bySize[1]
    if (victim === undefined) {
      return { kind: 'irreducible' }
    }
    if (countStatements(victim.region) > MAX_DUPLICATED_STATEMENTS) {
      return { kind: 'irreducible' }
    }

    const outside = new Set(cur.blocks.filter((b) => !scc.nodes.has(b.id)).map((b) => b.id))
    cur = duplicateBlocks(cur, victim.region, victim.entry, outside)
  }

  return { kind: 'irreducible' }
}
