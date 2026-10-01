import { type Block, type BlockId, type Cfg, makeCfg, type Terminator } from './cfg.ts'

function isEmptyGoto(block: Block): boolean {
  return block.body.length === 0 && block.term.kind === 'goto'
}

function chainEnd(
  cfg: Cfg,
  from: BlockId,
  memo: Map<BlockId, BlockId | undefined>,
): BlockId | undefined {
  const path: BlockId[] = []
  const onPath = new Set<BlockId>()
  let current = from

  const settle = (value: BlockId | undefined): BlockId | undefined => {
    for (const id of path) {
      memo.set(id, value)
    }
    return value
  }

  for (;;) {
    if (memo.has(current)) {
      return settle(memo.get(current))
    }

    const block = cfg.byId.get(current)
    if (block === undefined || !isEmptyGoto(block)) {
      return settle(current)
    }

    if (onPath.has(current)) {
      return settle(undefined)
    }

    path.push(current)
    onPath.add(current)
    current = (block.term as { kind: 'goto'; to: BlockId }).to
  }
}

function thread(term: Terminator, redirect: ReadonlyMap<BlockId, BlockId>): Terminator {
  const at = (to: BlockId): BlockId => redirect.get(to) ?? to
  switch (term.kind) {
    case 'goto': {
      const to = at(term.to)
      return to === term.to ? term : { kind: 'goto', to }
    }
    case 'branch': {
      const then = at(term.then)
      const elseId = at(term.else)
      if (then === term.then && elseId === term.else) {
        return term
      }
      return { kind: 'branch', cond: term.cond, then, else: elseId }
    }
    case 'exit':
      return term
  }
}

export function simplify(cfg: Cfg): Cfg {
  const memo = new Map<BlockId, BlockId | undefined>()
  const redirect = new Map<BlockId, BlockId>()

  for (const block of cfg.blocks) {
    if (block.id === cfg.entry || !isEmptyGoto(block)) {
      continue
    }
    const end = chainEnd(cfg, block.id, memo)
    if (end !== undefined) {
      redirect.set(block.id, end)
    }
  }

  if (redirect.size === 0) {
    return cfg
  }

  const kept = cfg.blocks
    .filter((block) => !redirect.has(block.id))
    .map((block) => ({ id: block.id, body: block.body, term: thread(block.term, redirect) }))

  return makeCfg(kept)
}
