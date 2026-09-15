/*
 * 控制流结构化：把 JsonCode 的扁平 CFG（label / jump / jumpIf）还原成
 * while / if / break / continue。
 *
 * 约定：
 *   - IR 自身契约被违反时抛 StructurizerError（未定义行为快速失败）。
 *   - 合法但无法结构化的 CFG 返回 { kind: 'unstructured' }，不抛。
 *   - 不使用 null；缺失一律用 undefined。
 *
 * 边界：
 *   - 块末尾无终结符 ⇒ 落到下一个块（switch 穿透语义）。
 *   - 函数最后一段无终结符 ⇒ 未定义，抛 fall-off-end。
 */

import * as JsonCode from '@/middle/ir/json-code.ts'

// ---------- 公开类型 ----------

export type UnstructuredReason =
  /** 本函数被某个（后代的）longJump 命中，必须保留状态机 */
  | 'long-jump-target'
  /** 不可约 CFG，且待复制区域的语句数超过阈值 */
  | 'irreducible-too-large'
  /** 不可约 CFG，node splitting 迭代到上限仍不可约 */
  | 'irreducible-after-split'
  /** 可约 CFG，但发射过程中发现无法用结构化语句表达 */
  | 'unstructured-cfg'

export type SNode =
  | { readonly kind: 'stmt'; readonly code: string }
  | { readonly kind: 'if'; readonly cond: string; readonly then: readonly SNode[]; readonly else: readonly SNode[] }
  | { readonly kind: 'while'; readonly sourceId: BlockId; readonly cond: string; readonly body: readonly SNode[] }
  | { readonly kind: 'loop'; readonly sourceId: BlockId; readonly body: readonly SNode[] }
  | { readonly kind: 'labeled'; readonly name: string; readonly body: SNode }
  | { readonly kind: 'break'; readonly label: string | undefined }
  | { readonly kind: 'continue'; readonly label: string | undefined }

export type StructurizeResult =
  | { readonly kind: 'structured'; readonly body: readonly SNode[] }
  | { readonly kind: 'unstructured'; readonly reason: UnstructuredReason }

export interface StructurizeContext {
  /** 被任意后代函数的 longJump 命中的 functionId 集合 */
  readonly longJumpTargets: ReadonlySet<number>
  readonly compileExpr: (expr: JsonCode.Expr) => string
  readonly compileStatement: (stmt: JsonCode.Statement) => string
}

export type StructurizerErrorCode =
  | 'fall-off-end'
  | 'unknown-label'
  | 'duplicate-label'
  | 'reserved-label-id'

export class StructurizerError extends Error {
  constructor(
    readonly code: StructurizerErrorCode,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`)
    this.name = 'StructurizerError'
  }
}

/** 发射过程中发现无法结构化时抛出，由 structurize 转成 unstructured 结果 */
class StructurizeFailure extends Error {
  constructor(readonly detail: string) {
    super(detail)
    this.name = 'StructurizeFailure'
  }
}

// ---------- 阈值 ----------

/** 待分裂区域包含的 JsonCode 语句条数上限（终结符按 1 条计） */
const MAX_SPLIT_REGION_BLOCKS = 20
/** node splitting 迭代轮数上限 */
const MAX_SPLIT_ROUNDS = 8

// ---------- CFG ----------

export type BlockId = number

/** 虚拟出口：所有 return / longJump 的后继 */
const EXIT: BlockId = -1

type Terminator =
  | { readonly kind: 'jump'; readonly to: BlockId }
  | { readonly kind: 'jumpIf'; readonly cond: JsonCode.Expr; readonly then: BlockId; readonly else: BlockId }
  | { readonly kind: 'return'; readonly src: JsonCode.Return }
  | { readonly kind: 'longJump'; readonly src: JsonCode.LongJump }

interface Block {
  readonly id: BlockId
  readonly stmts: readonly JsonCode.Statement[]
  readonly term: Terminator
}

interface Cfg {
  readonly entry: BlockId
  readonly blocks: readonly Block[]
  readonly byId: ReadonlyMap<BlockId, Block>
  readonly succ: ReadonlyMap<BlockId, readonly BlockId[]>
  readonly pred: ReadonlyMap<BlockId, readonly BlockId[]>
}

function successorsOf(b: Block): readonly BlockId[] {
  const t = b.term
  switch (t.kind) {
    case 'jump':
      return [t.to]
    case 'jumpIf':
      return [t.then, t.else]
    case 'return':
    case 'longJump':
      return [EXIT]
  }
}

function makeCfg(blocks: readonly Block[]): Cfg {
  const byId = new Map<BlockId, Block>()
  for (const b of blocks) byId.set(b.id, b)

  const succ = new Map<BlockId, readonly BlockId[]>()
  for (const b of blocks) succ.set(b.id, successorsOf(b))
  succ.set(EXIT, [])

  const pred = new Map<BlockId, BlockId[]>()
  for (const b of blocks) {
    for (const s of successorsOf(b)) {
      const list = pred.get(s)
      if (list === undefined) pred.set(s, [b.id])
      else list.push(b.id)
    }
  }

  return { entry: blocks[0].id, blocks, byId, succ, pred }
}

// ---------- 切块 ----------

function buildCfg(body: readonly JsonCode.Statement[]): Cfg {
  const blocks: Block[] = []
  const seen = new Set<number>()

  let labelId: number | undefined = undefined
  let stmts: JsonCode.Statement[] = []
  let term: Terminator | undefined = undefined

  const flush = (next: number | undefined): void => {
    if (labelId === undefined && stmts.length === 0 && term === undefined) {
      // 起始空段：把紧随其后的 label 直接用作本块的 id，避免多出一个空入口块
      if (next === undefined) return
      labelId = next
      return
    }
    if (term === undefined) {
      if (next === undefined) {
        throw new StructurizerError(
          'fall-off-end',
          `block ${labelId} falls off the end of the function without a terminator`,
        )
      }
      // 块末尾无终结符 ⇒ 落到下一个块
      term = { kind: 'jump', to: next }
    }
    blocks.push({ id: labelId === undefined ? 0 : labelId, stmts, term })
    labelId = undefined
    stmts = []
    term = undefined
  }

  for (const stmt of body) {
    if (stmt.kind === 'label') {
      flush(stmt.labelId)
      if (stmt.labelId === 0) {
        throw new StructurizerError('reserved-label-id', 'labelId 0 is reserved for the entry block')
      }
      if (seen.has(stmt.labelId)) {
        throw new StructurizerError('duplicate-label', `labelId ${stmt.labelId} appears twice`)
      }
      seen.add(stmt.labelId)
      labelId = stmt.labelId
      continue
    }

    if (term !== undefined) {
      // 终结符之后的语句不可达（例如被 goto 跳过），结构化代码里没有"跳转"能到达它们，直接忽略
      continue
    }

    switch (stmt.kind) {
      case 'jump':
        term = { kind: 'jump', to: stmt.labelId }
        break
      case 'jumpIf':
        term = { kind: 'jumpIf', cond: stmt.condition, then: stmt.then, else: stmt.else }
        break
      case 'return':
        term = { kind: 'return', src: stmt }
        break
      case 'longJump':
        term = { kind: 'longJump', src: stmt }
        break
      case 'assign':
      case 'eval':
        stmts.push(stmt)
        break
    }
  }
  flush(undefined)

  const ids = new Set(blocks.map((b) => b.id))
  for (const b of blocks) {
    const t = b.term
    if (t.kind === 'jump' && !ids.has(t.to)) {
      throw new StructurizerError('unknown-label', `jump to label ${t.to} from block ${b.id}`)
    }
    if (t.kind === 'jumpIf') {
      if (!ids.has(t.then)) throw new StructurizerError('unknown-label', `jumpIf then ${t.then} from block ${b.id}`)
      if (!ids.has(t.else)) throw new StructurizerError('unknown-label', `jumpIf else ${t.else} from block ${b.id}`)
    }
  }

  return makeCfg(blocks)
}

function dropUnreachable(cfg: Cfg): Cfg {
  const reach = new Set<BlockId>([cfg.entry])
  const stack: BlockId[] = [cfg.entry]
  while (stack.length > 0) {
    const b = stack.pop() as BlockId
    for (const s of cfg.succ.get(b) ?? []) {
      if (!reach.has(s)) {
        reach.add(s)
        stack.push(s)
      }
    }
  }
  const kept = cfg.blocks.filter((b) => reach.has(b.id))
  if (kept.length === cfg.blocks.length) return cfg
  return makeCfg(kept)
}

// ---------- 支配 / 后支配 ----------

function computeIdom(
  root: BlockId,
  succOf: (id: BlockId) => readonly BlockId[],
  predOf: (id: BlockId) => readonly BlockId[],
): ReadonlyMap<BlockId, BlockId> {
  const post: BlockId[] = []
  const seen = new Set<BlockId>()
  const dfs = (b: BlockId): void => {
    seen.add(b)
    for (const s of succOf(b)) {
      if (!seen.has(s)) dfs(s)
    }
    post.push(b)
  }
  dfs(root)

  const rpo = post.reverse()
  const order = new Map<BlockId, number>()
  rpo.forEach((b, i) => order.set(b, i))

  const idom = new Map<BlockId, BlockId>()
  idom.set(root, root)

  const intersect = (a: BlockId, b: BlockId): BlockId => {
    let x = a
    let y = b
    while (x !== y) {
      while ((order.get(x) as number) > (order.get(y) as number)) x = idom.get(x) as BlockId
      while ((order.get(y) as number) > (order.get(x) as number)) y = idom.get(y) as BlockId
    }
    return x
  }

  let changed = true
  while (changed) {
    changed = false
    for (const b of rpo) {
      if (b === root) continue
      let next: BlockId | undefined = undefined
      for (const p of predOf(b)) {
        if (!idom.has(p)) continue
        next = next === undefined ? p : intersect(p, next)
      }
      if (next === undefined) continue
      if (idom.get(b) !== next) {
        idom.set(b, next)
        changed = true
      }
    }
  }

  return idom
}

function dominates(idom: ReadonlyMap<BlockId, BlockId>, a: BlockId, b: BlockId): boolean {
  let x = b
  for (;;) {
    if (x === a) return true
    const p = idom.get(x)
    if (p === undefined || p === x) return false
    x = p
  }
}

function computePdom(cfg: Cfg): ReadonlyMap<BlockId, BlockId> {
  // 无法到达 EXIT 的块（纯死循环）加虚拟边到 EXIT，保证 EXIT 反向可达全部节点
  const canReachExit = new Set<BlockId>([EXIT])
  const stack: BlockId[] = [EXIT]
  while (stack.length > 0) {
    const b = stack.pop() as BlockId
    for (const p of cfg.pred.get(b) ?? []) {
      if (!canReachExit.has(p)) {
        canReachExit.add(p)
        stack.push(p)
      }
    }
  }
  const extra = cfg.blocks.filter((b) => !canReachExit.has(b.id)).map((b) => b.id)

  const revSucc = (id: BlockId): readonly BlockId[] =>
    id === EXIT ? [...(cfg.pred.get(EXIT) ?? []), ...extra] : (cfg.pred.get(id) ?? [])
  const revPred = (id: BlockId): readonly BlockId[] => (id === EXIT ? [] : (cfg.succ.get(id) ?? []))

  return computeIdom(EXIT, revSucc, revPred)
}

function lcaPdom(ipdom: ReadonlyMap<BlockId, BlockId>, a: BlockId, b: BlockId): BlockId {
  const ancestors = new Set<BlockId>()
  let x: BlockId | undefined = a
  while (x !== undefined && !ancestors.has(x)) {
    ancestors.add(x)
    x = ipdom.get(x)
  }
  let y: BlockId | undefined = b
  while (y !== undefined) {
    if (ancestors.has(y)) return y
    y = ipdom.get(y)
  }
  return EXIT
}

// ---------- 可约性 / node splitting ----------

interface SccInfo {
  readonly nodes: readonly BlockId[]
  /** 从分量外进入本分量的边的目标集合（分量含入口块时也算入口）。多于一个 ⇒ 不可约 */
  readonly entries: readonly BlockId[]
}

function reachableSet(cfg: Cfg, from: BlockId): Set<BlockId> {
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

function analyzeSccs(cfg: Cfg): SccInfo[] {
  const reach = new Map<BlockId, Set<BlockId>>()
  for (const b of cfg.blocks) reach.set(b.id, reachableSet(cfg, b.id))

  const assigned = new Set<BlockId>()
  const out: SccInfo[] = []
  for (const b of cfg.blocks) {
    if (assigned.has(b.id)) continue
    const forward = reach.get(b.id) as Set<BlockId>
    const nodes = cfg.blocks
      .map((x) => x.id)
      .filter((x) => forward.has(x) && (reach.get(x) as Set<BlockId>).has(b.id))
    for (const n of nodes) assigned.add(n)

    const nodeSet = new Set(nodes)
    const entries = new Set<BlockId>()
    for (const n of nodes) {
      for (const p of cfg.pred.get(n) ?? []) {
        if (!nodeSet.has(p)) entries.add(n)
      }
    }
    if (nodeSet.has(cfg.entry)) entries.add(cfg.entry)
    out.push({ nodes, entries: [...entries] })
  }
  return out
}

function isIrreducible(cfg: Cfg): boolean {
  return analyzeSccs(cfg).some((s) => s.entries.length > 1)
}

/** 强连通分量内被 v 支配的节点（= node splitting 需要复制的节点） */
function dominatedInScc(
  cfg: Cfg,
  idom: ReadonlyMap<BlockId, BlockId>,
  scc: SccInfo,
  v: BlockId,
): Block[] {
  const nodes = new Set(scc.nodes)
  return cfg.blocks.filter((b) => nodes.has(b.id) && dominates(idom, v, b.id))
}

function countStatements(blocks: readonly Block[]): number {
  let n = 0
  for (const b of blocks) n += b.stmts.length + 1
  return n
}

function remapTerm(term: Terminator, copies: ReadonlyMap<BlockId, BlockId>): Terminator {
  switch (term.kind) {
    case 'jump': {
      const to = copies.get(term.to)
      return to === undefined ? term : { kind: 'jump', to }
    }
    case 'jumpIf': {
      const then = copies.get(term.then) ?? term.then
      const elseId = copies.get(term.else) ?? term.else
      if (then === term.then && elseId === term.else) return term
      return { kind: 'jumpIf', cond: term.cond, then, else: elseId }
    }
    case 'return':
    case 'longJump':
      return term
  }
}

function redirectTerm(term: Terminator, target: BlockId, copies: ReadonlyMap<BlockId, BlockId>): Terminator {
  const c = copies.get(target) as BlockId
  switch (term.kind) {
    case 'jump':
      return term.to === target ? { kind: 'jump', to: c } : term
    case 'jumpIf': {
      const then = term.then === target ? c : term.then
      const elseId = term.else === target ? c : term.else
      if (then === term.then && elseId === term.else) return term
      return { kind: 'jumpIf', cond: term.cond, then, else: elseId }
    }
    case 'return':
    case 'longJump':
      return term
  }
}

type SplitResult =
  | { readonly kind: 'ok'; readonly cfg: Cfg }
  | { readonly kind: 'gave-up'; readonly reason: 'irreducible-too-large' | 'irreducible-after-split' }

/**
 * 把不可约 CFG 拆成可约：对每个多入口的强连通分量，保留一个入口，
 * 其余入口各自复制一份"它在该分量内支配的节点"，并把外部入边改指副本。
 */
function trySplit(cfg: Cfg, idom: ReadonlyMap<BlockId, BlockId>): SplitResult {
  let cur = cfg
  let curIdom = idom
  let nextId = cur.blocks.reduce((m, b) => Math.max(m, b.id), 0) + 1

  for (let round = 0; round < MAX_SPLIT_ROUNDS; round++) {
    const bad = analyzeSccs(cur).filter((s) => s.entries.length > 1)
    if (bad.length === 0) return { kind: 'ok', cfg: cur }

    const scc = bad[0]
    const nodeSet = new Set(scc.nodes)

    // 保留支配子树最大的入口，复制成本最低
    let keep = scc.entries[0]
    let keepSize = -1
    for (const v of scc.entries) {
      const size = dominatedInScc(cur, curIdom, scc, v).length
      if (size > keepSize) {
        keep = v
        keepSize = size
      }
    }

    const target = scc.entries.find((v) => v !== keep) as BlockId
    const region = dominatedInScc(cur, curIdom, scc, target)
    if (countStatements(region) > MAX_SPLIT_REGION_BLOCKS) {
      return { kind: 'gave-up', reason: 'irreducible-too-large' }
    }

    const copies = new Map<BlockId, BlockId>()
    for (const b of region) {
      copies.set(b.id, nextId)
      nextId += 1
    }

    const next: Block[] = cur.blocks.map((b) => {
      if (nodeSet.has(b.id)) return b
      return { id: b.id, stmts: b.stmts, term: redirectTerm(b.term, target, copies) }
    })
    for (const b of region) {
      next.push({
        id: copies.get(b.id) as BlockId,
        stmts: b.stmts,
        term: remapTerm(b.term, copies),
      })
    }

    cur = makeCfg(next)
    curIdom = computeIdom(
      cur.entry,
      (id) => cur.succ.get(id) ?? [],
      (id) => cur.pred.get(id) ?? [],
    )
  }

  return { kind: 'gave-up', reason: 'irreducible-after-split' }
}

// ---------- 自然循环 ----------

interface Loop {
  readonly header: BlockId
  readonly body: ReadonlySet<BlockId>
  /** 循环内节点所有通向循环外的边所指向的目标 */
  readonly exits: ReadonlySet<BlockId>
}

function findLoops(cfg: Cfg, idom: ReadonlyMap<BlockId, BlockId>): ReadonlyMap<BlockId, Loop> {
  const latches = new Map<BlockId, BlockId[]>()
  for (const b of cfg.blocks) {
    for (const s of cfg.succ.get(b.id) ?? []) {
      if (s === EXIT) continue
      if (!dominates(idom, s, b.id)) continue
      const list = latches.get(s)
      if (list === undefined) latches.set(s, [b.id])
      else list.push(b.id)
    }
  }

  const loops = new Map<BlockId, Loop>()
  for (const [header, latchList] of latches) {
    const body = new Set<BlockId>([header])
    const work: BlockId[] = [...latchList]
    while (work.length > 0) {
      const n = work.pop() as BlockId
      if (body.has(n)) continue
      body.add(n)
      for (const p of cfg.pred.get(n) ?? []) {
        if (p !== EXIT) work.push(p)
      }
    }
    const exits = new Set<BlockId>()
    for (const n of body) {
      for (const s of cfg.succ.get(n) ?? []) {
        if (!body.has(s)) exits.add(s)
      }
    }
    loops.set(header, { header, body, exits })
  }
  return loops
}

// ---------- 发射 ----------

interface EmitState {
  readonly cfg: Cfg
  readonly ipdom: ReadonlyMap<BlockId, BlockId>
  readonly loops: ReadonlyMap<BlockId, Loop>
  /** 多出口循环 → 各出口汇聚到的位置（用于把出口分支的代码内联后再 break） */
  readonly loopJoins: Map<Loop, BlockId>
  readonly ctx: StructurizeContext
  readonly visited: Set<BlockId>
  readonly needLabel: Set<BlockId>
}

/** 找出把 y 当作出口的循环。从最外层开始找：y 同时是多层循环的出口时，一次跳出最外层。 */
function loopExitLevel(loopStack: readonly Loop[], y: BlockId): number | undefined {
  for (let i = 0; i < loopStack.length; i++) {
    if (loopStack[i].exits.has(y)) return i
  }
  return undefined
}

function loopHeaderLevel(loopStack: readonly Loop[], y: BlockId): number | undefined {
  for (let i = loopStack.length - 1; i >= 0; i--) {
    if (loopStack[i].header === y) return i
  }
  return undefined
}

/** 跳出第 level 层循环。多出口循环先把该出口分支的代码内联进来，再 break 到循环之后。 */
function breakExit(state: EmitState, y: BlockId, level: number, loopStack: readonly Loop[]): SNode[] {
  const loop = loopStack[level]
  const label = level === loopStack.length - 1 ? undefined : `__b${loop.header}`
  if (label !== undefined) state.needLabel.add(loop.header)
  const join = state.loopJoins.get(loop)
  if (join === undefined) return [{ kind: 'break', label }]
  return [...emit(state, y, join, loopStack), { kind: 'break', label }]
}

function continueNode(state: EmitState, level: number, loopStack: readonly Loop[]): SNode {
  if (level === loopStack.length - 1) return { kind: 'continue', label: undefined }
  const header = loopStack[level].header
  state.needLabel.add(header)
  return { kind: 'continue', label: `__b${header}` }
}

/** 发射一个跳转目标；结果可能是空、break、continue，或继续顺序展开的代码 */
function emitTarget(state: EmitState, y: BlockId, exit: BlockId, loopStack: readonly Loop[]): SNode[] {
  if (y === exit || y === EXIT) return []

  const exitLevel = loopExitLevel(loopStack, y)
  if (exitLevel !== undefined) return breakExit(state, y, exitLevel, loopStack)

  const headerLevel = loopHeaderLevel(loopStack, y)
  if (headerLevel !== undefined) return [continueNode(state, headerLevel, loopStack)]

  if (state.visited.has(y)) throw new StructurizeFailure(`jump to already emitted block ${y}`)
  return emit(state, y, exit, loopStack)
}

/** 循环出口中真正落在当前区域内、需要继续顺序展开的目标（排除 EXIT 与外层循环的转移目标） */
function loopContinuations(loop: Loop, loopStack: readonly Loop[]): BlockId[] {
  const out: BlockId[] = []
  for (const x of loop.exits) {
    if (x === EXIT) continue
    if (loopHeaderLevel(loopStack, x) !== undefined) continue
    if (loopExitLevel(loopStack, x) !== undefined) continue
    out.push(x)
  }
  return out
}

function emit(state: EmitState, b: BlockId, exit: BlockId, loopStack: readonly Loop[]): SNode[] {
  if (b === exit || b === EXIT) return []
  if (state.visited.has(b)) throw new StructurizeFailure(`block ${b} emitted twice`)

  const block = state.cfg.byId.get(b)
  if (block === undefined) throw new StructurizeFailure(`no block ${b}`)

  state.visited.add(b)

  const loop = state.loops.get(b)
  if (loop !== undefined && !loopStack.includes(loop)) {
    const after = loopContinuations(loop, loopStack)
    if (after.length > 1) {
      // 多个出口：各出口分支内联自己的代码后 break，统一汇合到 join 之后继续
      let join = after[0]
      for (const x of after) join = lcaPdom(state.ipdom, join, x)
      state.loopJoins.set(loop, join)
      return [emitLoop(state, block, loop, loopStack), ...emitTarget(state, join, exit, loopStack)]
    }
    const nodes: SNode[] = [emitLoop(state, block, loop, loopStack)]
    if (after.length === 1) nodes.push(...emitTarget(state, after[0], exit, loopStack))
    return nodes
  }

  const out: SNode[] = block.stmts.map((s) => ({ kind: 'stmt', code: state.ctx.compileStatement(s) }))
  return out.concat(emitTerm(state, block, exit, loopStack))
}

function emitLoop(state: EmitState, block: Block, loop: Loop, loopStack: readonly Loop[]): SNode {
  const inner = [...loopStack, loop]
  const t = block.term

  // 前测循环：header 无语句，且两支一跳向内、一跳向外
  if (block.stmts.length === 0 && t.kind === 'jumpIf') {
    const thenIn = loop.body.has(t.then)
    const elseIn = loop.body.has(t.else)
    if (thenIn !== elseIn) {
      const c = state.ctx.compileExpr(t.cond)
      const inBranch = thenIn ? t.then : t.else
      return {
        kind: 'while',
        sourceId: block.id,
        cond: thenIn ? c : `!(${c})`,
        body: emit(state, inBranch, loop.header, inner),
      }
    }
  }

  const pre: SNode[] = block.stmts.map((s) => ({ kind: 'stmt', code: state.ctx.compileStatement(s) }))
  return { kind: 'loop', sourceId: block.id, body: pre.concat(emitTerm(state, block, loop.header, inner)) }
}

function emitTerm(state: EmitState, block: Block, exit: BlockId, loopStack: readonly Loop[]): SNode[] {
  const t = block.term
  switch (t.kind) {
    case 'jump':
      return emitTarget(state, t.to, exit, loopStack)
    case 'jumpIf':
      return emitJumpIf(state, t.cond, t.then, t.else, exit, loopStack)
    case 'return':
    case 'longJump':
      return [{ kind: 'stmt', code: state.ctx.compileStatement(t.src) }]
  }
}

function emitJumpIf(
  state: EmitState,
  cond: JsonCode.Expr,
  then: BlockId,
  elseId: BlockId,
  exit: BlockId,
  loopStack: readonly Loop[],
): SNode[] {
  const c = state.ctx.compileExpr(cond)
  const thenExits = then === exit || then === EXIT
  const elseExits = elseId === exit || elseId === EXIT

  if (thenExits && elseExits) return []
  if (elseExits) return [{ kind: 'if', cond: c, then: emitTarget(state, then, exit, loopStack), else: [] }]
  if (thenExits) return [{ kind: 'if', cond: `!(${c})`, then: emitTarget(state, elseId, exit, loopStack), else: [] }]

  const thenBreak = loopExitLevel(loopStack, then)
  const elseBreak = loopExitLevel(loopStack, elseId)
  if (thenBreak !== undefined && elseBreak === undefined) {
    return [
      { kind: 'if', cond: c, then: breakExit(state, then, thenBreak, loopStack), else: [] },
      ...emitTarget(state, elseId, exit, loopStack),
    ]
  }
  if (elseBreak !== undefined && thenBreak === undefined) {
    return [
      { kind: 'if', cond: `!(${c})`, then: breakExit(state, elseId, elseBreak, loopStack), else: [] },
      ...emitTarget(state, then, exit, loopStack),
    ]
  }
  if (thenBreak !== undefined && elseBreak !== undefined) {
    throw new StructurizeFailure('jumpIf: both branches leave the loop')
  }

  const j = lcaPdom(state.ipdom, then, elseId)
  if (j === then) {
    return [
      { kind: 'if', cond: `!(${c})`, then: emitTarget(state, elseId, j, loopStack), else: [] },
      ...emitTarget(state, j, exit, loopStack),
    ]
  }
  if (j === elseId) {
    return [
      { kind: 'if', cond: c, then: emitTarget(state, then, j, loopStack), else: [] },
      ...emitTarget(state, j, exit, loopStack),
    ]
  }
  return [
    {
      kind: 'if',
      cond: c,
      then: emitTarget(state, then, j, loopStack),
      else: emitTarget(state, elseId, j, loopStack),
    },
    ...emitTarget(state, j, exit, loopStack),
  ]
}

function relabel(node: SNode, need: ReadonlySet<BlockId>): SNode {
  switch (node.kind) {
    case 'if':
      return {
        kind: 'if',
        cond: node.cond,
        then: node.then.map((x) => relabel(x, need)),
        else: node.else.map((x) => relabel(x, need)),
      }
    case 'while': {
      const w: SNode = {
        kind: 'while',
        sourceId: node.sourceId,
        cond: node.cond,
        body: node.body.map((x) => relabel(x, need)),
      }
      return need.has(node.sourceId) ? { kind: 'labeled', name: `__b${node.sourceId}`, body: w } : w
    }
    case 'loop': {
      const l: SNode = { kind: 'loop', sourceId: node.sourceId, body: node.body.map((x) => relabel(x, need)) }
      return need.has(node.sourceId) ? { kind: 'labeled', name: `__b${node.sourceId}`, body: l } : l
    }
    case 'labeled':
      return { kind: 'labeled', name: node.name, body: relabel(node.body, need) }
    case 'stmt':
    case 'break':
    case 'continue':
      return node
  }
}

// ---------- 入口 ----------

function collectReferencedLabels(body: readonly JsonCode.Statement[]): Set<number> {
  const out = new Set<number>()
  for (const stmt of body) {
    if (stmt.kind === 'jump') out.add(stmt.labelId)
    else if (stmt.kind === 'jumpIf') {
      out.add(stmt.then)
      out.add(stmt.else)
    }
  }
  return out
}

export function structurize(fn: JsonCode.Function, ctx: StructurizeContext): StructurizeResult {
  if (ctx.longJumpTargets.has(fn.id)) return { kind: 'unstructured', reason: 'long-jump-target' }

  // 没有任何被引用的 label ⇒ 纯线性代码，label 无运行时效果，直接顺序发射
  if (collectReferencedLabels(fn.body).size === 0) {
    const body = fn.body
      .filter((s) => s.kind !== 'label')
      .map((s): SNode => ({ kind: 'stmt', code: ctx.compileStatement(s) }))
    return { kind: 'structured', body }
  }

  let cfg = dropUnreachable(buildCfg(fn.body))
  let idom = computeIdom(
    cfg.entry,
    (id) => cfg.succ.get(id) ?? [],
    (id) => cfg.pred.get(id) ?? [],
  )

  if (isIrreducible(cfg)) {
    const split = trySplit(cfg, idom)
    if (split.kind === 'gave-up') return { kind: 'unstructured', reason: split.reason }
    cfg = split.cfg
    idom = computeIdom(
      cfg.entry,
      (id) => cfg.succ.get(id) ?? [],
      (id) => cfg.pred.get(id) ?? [],
    )
  }

  const ipdom = computePdom(cfg)
  const loops = findLoops(cfg, idom)
  const state: EmitState = {
    cfg,
    ipdom,
    loops,
    loopJoins: new Map(),
    ctx,
    visited: new Set(),
    needLabel: new Set(),
  }

  try {
    const body = emit(state, cfg.entry, EXIT, [])
    return { kind: 'structured', body: body.map((x) => relabel(x, state.needLabel)) }
  } catch (e) {
    if (e instanceof StructurizeFailure) return { kind: 'unstructured', reason: 'unstructured-cfg' }
    throw e
  }
}

// ---------- 打印 ----------

function indentCode(code: string, indent: string): string {
  return code
    .split('\n')
    .map((x) => indent + x)
    .join('\n')
}

function emitNodes(nodes: readonly SNode[], indent: string): string {
  return nodes.map((x) => emitNode(x, indent)).join('\n')
}

function emitBlock(header: string, body: readonly SNode[], indent: string): string {
  const inner = emitNodes(body, indent + '  ')
  return inner.length === 0 ? `${indent}${header} {}` : `${indent}${header} {\n${inner}\n${indent}}`
}

function emitNode(node: SNode, indent: string): string {
  switch (node.kind) {
    case 'stmt':
      return indentCode(node.code, indent)
    case 'break':
      return node.label === undefined ? `${indent}break;` : `${indent}break ${node.label};`
    case 'continue':
      return node.label === undefined ? `${indent}continue;` : `${indent}continue ${node.label};`
    case 'if': {
      if (node.else.length === 0) return emitBlock(`if (${node.cond})`, node.then, indent)
      const thenText = emitBlock(`if (${node.cond})`, node.then, indent)
      const elseText = emitBlock('else', node.else, indent)
      return `${thenText} ${elseText}`
    }
    case 'while':
      return emitBlock(`while (${node.cond})`, node.body, indent)
    case 'loop':
      return emitBlock('while (true)', node.body, indent)
    case 'labeled': {
      const inner = emitNode(node.body, indent)
      return `${indent}${node.name}: ${inner.slice(indent.length)}`
    }
  }
}

export function emitSNode(nodes: readonly SNode[], indent: string): string {
  return emitNodes(nodes, indent)
}
