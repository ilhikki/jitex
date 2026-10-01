/*
 * Pass 1：语句序列 → CFG。
 *
 * 这一层承担三件事，做完之后后续 pass 就再也不用接触 JsonCode：
 *   1. 以 label 为界切块；
 *   2. 把 7 种 Statement 压成 3 种终结符（goto / branch / exit），
 *      其余语句全部渲染成文本塞进 body；
 *   3. 契约校验（未定义行为一次性抛干净）。
 */

import type * as JsonCode from '@/middle/ir/json-code.ts'
import { type StructurizeContext, StructurizerError } from './types.ts'

export type BlockId = number

/** 虚拟出口：所有 exit 终结符的后继 */
export const EXIT: BlockId = -1

/** 入口块在没有 label 时使用的 id（JsonCode 约定 labelId > 0） */
const ENTRY_ID: BlockId = 0

/**
 * 调试探针：lowering 决策 13 在每次 goto 前插入的 steps.check（见
 * middle/lowering/statements.ts）。它只服务于 maxSteps 兜底，不参与 Pascal 语义，
 * 所以"块里只剩它"等于块是空的--否则每个 goto 都会独占一个基本块，跳转穿线失效。
 */
const DEBUG_PROBE_KEYS: ReadonlySet<string> = new Set(['runtime.debug.steps.check'])

function isDebugProbe(stmt: JsonCode.Statement): boolean {
  return stmt.kind === 'eval' && stmt.expr.kind === 'syscall' && DEBUG_PROBE_KEYS.has(stmt.expr.key)
}

/**
 * 归一化后的终结符。整个子系统只认这三种：
 * 控制流类语句到这里就被压扁，之后所有 pass 面对的都是同一种形状。
 */
export type Terminator =
  | { readonly kind: 'goto'; readonly to: BlockId }
  | { readonly kind: 'branch'; readonly cond: string; readonly then: BlockId; readonly else: BlockId }
  | { readonly kind: 'exit' }

export interface Block {
  readonly id: BlockId
  /** 已渲染成 JS 文本的普通语句，按源码顺序 */
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
      // 切块阶段已经消费掉，这里只是为了穷尽
      return { line: undefined, term: undefined }
  }
}

// ---------- 切块 ----------

function splitBlocks(body: readonly JsonCode.Statement[], ctx: StructurizeContext): Block[] {
  const blocks: Block[] = []
  const seenLabels = new Set<BlockId>()

  let labelId: BlockId | undefined
  let lines: string[] = []
  /** lines 里有多少条来自调试探针--用于判断"这个块其实什么都没有" */
  let probes = 0
  let term: Terminator | undefined

  const isEmptyStartSegment = (): boolean => labelId === undefined && lines.length === 0 && term === undefined

  /** 收尾当前段。nextLabel 是紧随其后的 label（用于补 fallthrough）。 */
  const close = (nextLabel: BlockId | undefined): void => {
    if (isEmptyStartSegment()) {
      // body 以 label 开头：让那个 label 直接充当入口块的 id，不另起空块
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

    // 终结符之后的语句不可达（例如被 goto 跳过），结构化输出里没有东西能到达它们
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

/** 入口：JsonCode 的函数体 → 已剪枝的 CFG */
export function buildCfg(fn: JsonCode.Function, ctx: StructurizeContext): Cfg {
  const cfg = makeCfg(splitBlocks(fn.body, ctx))
  assertTargetsExist(cfg)
  return dropUnreachable(cfg)
}
