import type * as JsonCode from '@/middle/ir/json-code.ts'
import { type StructurizeContext, StructurizerError } from './types.ts'

export type BlockId = number

export const EXIT: BlockId = -1

const ENTRY_ID: BlockId = 0

const DEBUG_PROBE_KEYS: ReadonlySet<string> = new Set(['runtime.debug.steps.check'])

function isDebugProbe(stmt: JsonCode.Statement): boolean {
  return stmt.kind === 'eval' && stmt.expr.kind === 'syscall' && DEBUG_PROBE_KEYS.has(stmt.expr.key)
}

export type Terminator =
  | { readonly kind: 'goto'; readonly to: BlockId }
  | { readonly kind: 'branch'; readonly cond: string; readonly then: BlockId; readonly else: BlockId }
  | { readonly kind: 'exit' }

export interface Block {
  readonly id: BlockId
  readonly body: readonly string[]
  readonly term: Terminator
}

export interface Cfg {
  readonly entry: BlockId
  readonly blocks: readonly Block[]
  readonly byId: ReadonlyMap<BlockId, Block>
  readonly succ: ReadonlyMap<BlockId, readonly BlockId[]>
  readonly pred: ReadonlyMap<BlockId, readonly BlockId[]>
}

export function successorsOf(block: Block): readonly BlockId[] {
  const t = block.term
  switch (t.kind) {
    case 'goto':
      return [t.to]
    case 'branch':
      return [t.then, t.else]
    case 'exit':
      return [EXIT]
  }
}

export function predecessorsOf(cfg: Cfg, id: BlockId): readonly BlockId[] {
  return cfg.pred.get(id) ?? []
}

export function reachableFrom(cfg: Cfg, from: BlockId): Set<BlockId> {
  const seen = new Set<BlockId>([from])
  const stack: BlockId[] = [from]
  while (stack.length > 0) {
    const b = stack.pop() as BlockId
    for (const s of cfg.succ.get(b) ?? []) {
      if (!seen.has(s)) {
        seen.add(s)
        stack.push(s)
      }
    }
  }
  return seen
}

export function makeCfg(blocks: readonly Block[]): Cfg {
  const byId = new Map(blocks.map((b) => [b.id, b] as const))
  const succ = new Map<BlockId, readonly BlockId[]>(
    blocks.map((b) => [b.id, successorsOf(b)] as const),
  )
  succ.set(EXIT, [])

  const pred = new Map<BlockId, BlockId[]>()
  for (const b of blocks) {
    for (const next of successorsOf(b)) {
      const list = pred.get(next)
      if (list === undefined) {
        pred.set(next, [b.id])
      } else list.push(b.id)
    }
  }

  return { entry: blocks[0].id, blocks, byId, succ, pred }
}

export function dropUnreachable(cfg: Cfg): Cfg {
  const reach = reachableFrom(cfg, cfg.entry)
  const kept = cfg.blocks.filter((b) => reach.has(b.id))
  return kept.length === cfg.blocks.length ? cfg : makeCfg(kept)
}

interface Lowered {
  readonly line: string | undefined
  readonly term: Terminator | undefined
}

const EXIT_TERM: Terminator = { kind: 'exit' }

function lowerStatement(stmt: JsonCode.Statement, ctx: StructurizeContext): Lowered {
  switch (stmt.kind) {
    case 'eval':
      return { line: ctx.compileStatement(stmt), term: undefined }
    case 'return':
    case 'longJump':
      return { line: ctx.compileStatement(stmt), term: EXIT_TERM }
    case 'jump':
      return { line: undefined, term: { kind: 'goto', to: stmt.labelId } }
    case 'jumpIf':
      return {
        line: undefined,
        term: {
          kind: 'branch',
          cond: ctx.compileExpr(stmt.condition),
          then: stmt.then,
          else: stmt.else,
        },
      }
    case 'label':
      return { line: undefined, term: undefined }
  }
}

function splitBlocks(body: readonly JsonCode.Statement[], ctx: StructurizeContext): Block[] {
  const blocks: Block[] = []
  const seenLabels = new Set<BlockId>()

  let labelId: BlockId | undefined
  let lines: string[] = []
  let probes = 0
  let term: Terminator | undefined

  const isEmptyStartSegment = (): boolean => labelId === undefined && lines.length === 0 && term === undefined

  const close = (nextLabel: BlockId | undefined): void => {
    if (isEmptyStartSegment()) {
      if (nextLabel !== undefined) {
        labelId = nextLabel
      }
      return
    }
    if (term === undefined) {
      if (nextLabel === undefined) {
        throw new StructurizerError(
          'fall-off-end',
          `block ${labelId ?? ENTRY_ID} runs off the end of the function without a terminator`,
        )
      }
      term = { kind: 'goto', to: nextLabel }
    }
    const body = term.kind === 'goto' && probes === lines.length ? [] : lines
    blocks.push({ id: labelId ?? ENTRY_ID, body, term })
    labelId = undefined
    lines = []
    probes = 0
    term = undefined
  }

  for (const stmt of body) {
    if (stmt.kind === 'label') {
      close(stmt.labelId)
      if (stmt.labelId === ENTRY_ID) {
        throw new StructurizerError('reserved-label-id', 'labelId 0 is reserved for the entry block')
      }
      if (seenLabels.has(stmt.labelId)) {
        throw new StructurizerError('duplicate-label', `labelId ${stmt.labelId} appears twice`)
      }
      seenLabels.add(stmt.labelId)
      labelId = stmt.labelId
      continue
    }

    if (term !== undefined) {
      continue
    }

    const lowered = lowerStatement(stmt, ctx)
    if (lowered.line !== undefined) {
      lines.push(lowered.line)
      if (isDebugProbe(stmt)) {
        probes += 1
      }
    }
    if (lowered.term !== undefined) {
      term = lowered.term
    }
  }
  close(undefined)

  return blocks
}

function assertTargetsExist(cfg: Cfg): void {
  for (const b of cfg.blocks) {
    for (const to of successorsOf(b)) {
      if (to !== EXIT && !cfg.byId.has(to)) {
        throw new StructurizerError('unknown-label', `block ${b.id} jumps to unknown label ${to}`)
      }
    }
  }
}

export function buildCfg(fn: JsonCode.Function, ctx: StructurizeContext): Cfg {
  const cfg = makeCfg(splitBlocks(fn.body, ctx))
  assertTargetsExist(cfg)
  return dropUnreachable(cfg)
}
