/*
 * Pass 5：结构规划--决定每个块在输出里的位置，以及每条边用什么表达。
 *
 * 输出的语法是一棵树（嵌套语句），而 CFG 是一张图。把图放进树只有三种手段：
 * 顺序（fall）、跳出（break）、跳回（continue）。本模块把每条边归到其中之一；
 * 归不掉的边，就把"它跨过的那一段"提升成一个 guard 盒，让它变成一次 break。
 *
 * 盒树的形状只由 items 决定：谁是谁的父盒、离开一个盒之后落到哪里，都从 items 现算
 * （见 layoutOf）。分类用的落点和 emit 出来的落点因此不可能不一致。
 *
 * 三个子遍，交替跑到不动点：
 *   5a layout -- 建盒树（循环盒由自然循环而来），把块和子盒排进各自的盒
 *   5b routes -- 逐边归类
 *   5c lift   -- 对归不了的边提升 guard 盒，回到 5b
 */

import { type BlockId, type Cfg, EXIT, successorsOf } from './cfg.ts'
import type { Analysis } from './analysis.ts'

/** 盒里的一项：一块代码，或一个嵌套盒 */
export type Item =
  | { readonly kind: 'block'; readonly id: BlockId }
  | { readonly kind: 'box'; readonly id: number }

export type JumpKind =
  | { readonly kind: 'fall' }
  | { readonly kind: 'break'; readonly label: string }
  | { readonly kind: 'continue'; readonly label: string }

/** 盒的恒等字段：内容（items / slotOf）由 rewrap 从 items 现算，不单独维护 */
interface BoxSeed {
  readonly id: number
  /** root 不产生语句；loop 产生 `L: while(true){}`；guard 产生 `L: {}` */
  readonly kind: 'root' | 'loop' | 'guard'
  readonly label: string
  /** 从盒外只能从这里进入 */
  readonly entry: BlockId
}

export interface Box extends BoxSeed {
  /** 本盒的内容，已按输出顺序排好 */
  readonly items: readonly Item[]
  /** 块 → 它在 items 中的下标（用于 fall 判定） */
  readonly slotOf: ReadonlyMap<BlockId, number>
}

export interface Layout {
  readonly root: number
  readonly boxes: ReadonlyMap<number, Box>
  readonly boxOf: ReadonlyMap<BlockId, number>
  /** 父盒；盒树的形状完全由 items 决定，不另存 */
  parentOf(boxId: number): number | undefined
  /**
   * 离开某个盒之后控制流落到哪个块--也就是 `break` 的落点。
   *
   * 由 items 唯一决定：紧跟该盒的那一项的入口；该盒是父盒最后一项时顺延为父盒的落点；
   * root 的落点是 EXIT。落点不能再有第二个来源，否则 break 会跳到别的地方。
   */
  continuationOf(boxId: number): BlockId
}

export interface Plan extends Layout {
  readonly routes: ReadonlyMap<string, JumpKind>
}

export type PlanResult =
  | { readonly kind: 'ok'; readonly plan: Plan }
  | { readonly kind: 'unrepresentable' }

/** 迭代轮数上限：每轮至少提升一个 guard 盒 */
const MAX_ROUNDS = 256

export function edgeKey(from: BlockId, to: BlockId): string {
  return `${from}:${to}`
}

/** 从某盒自己开始，向上直到 root 的盒链 */
export function boxAncestors(layout: Layout, boxId: number): Box[] {
  const chain: Box[] = []
  let current: number | undefined = boxId
  while (current !== undefined) {
    chain.push(layout.boxes.get(current) as Box)
    current = layout.parentOf(current)
  }
  return chain
}

/** 一项的入口：块就是它自己，子盒则是盒的入口 */
function entryOfItem(boxes: ReadonlyMap<number, Box>, item: Item): BlockId {
  return item.kind === 'block' ? item.id : (boxes.get(item.id) as Box).entry
}

function slotIndexes(items: readonly Item[]): ReadonlyMap<BlockId, number> {
  const map = new Map<BlockId, number>()
  items.forEach((item, index) => {
    if (item.kind === 'block') {
      map.set(item.id, index)
    }
  })
  return map
}

function rewrap(seed: BoxSeed, items: readonly Item[]): Box {
  return {
    id: seed.id,
    kind: seed.kind,
    label: seed.label,
    entry: seed.entry,
    items,
    slotOf: slotIndexes(items),
  }
}

/**
 * 组装 Layout：父子关系和落点全部从 items 推出来。
 *
 * 这是盒树唯一的成形处--buildLayout 和 liftToGuard 都只交出 items，
 * 别处不许再单独维护一份"谁是谁的父盒""出口在哪"。
 */
function layoutOf(
  root: number,
  boxes: ReadonlyMap<number, Box>,
  boxOf: ReadonlyMap<BlockId, number>,
): Layout {
  const parent = new Map<number, number>()
  const following = new Map<number, Item>()
  for (const box of boxes.values()) {
    box.items.forEach((item, index) => {
      if (item.kind !== 'box') {
        return
      }
      parent.set(item.id, box.id)
      const next = box.items[index + 1]
      if (next !== undefined) {
        following.set(item.id, next)
      }
    })
  }

  const cache = new Map<number, BlockId>()
  const continuationOf = (boxId: number): BlockId => {
    const cached = cache.get(boxId)
    if (cached !== undefined) {
      return cached
    }
    const next = following.get(boxId)
    const parentId = parent.get(boxId)
    const value = next !== undefined
      ? entryOfItem(boxes, next)
      : parentId === undefined
      ? EXIT
      : continuationOf(parentId)
    cache.set(boxId, value)
    return value
  }

  return { root, boxes, boxOf, parentOf: (boxId) => parent.get(boxId), continuationOf }
}

// ---------- 5a：盒树 ----------

interface MutableBox {
  readonly id: number
  readonly kind: 'root' | 'loop' | 'guard'
  readonly label: string
  readonly parent: number | undefined
  readonly entry: BlockId
  owner: BlockId[]
  children: number[]
}

/**
 * item 顺序：CFG 的逆后序（RPO）。
 *
 * 可约图删掉回边就是 DAG，而 DFS 的逆后序恰好保证"非回边的目标一定排在源头后面"--
 * 也就是排完之后**没有"往前跳不回去"的边**：唯一向后的是回边，而回边的头一定支配尾，
 * 正好落成 continue。前序做不到这一点（汇合点会被塞进某条分支的子树里）。
 */
function globalOrder(cfg: Cfg): Map<BlockId, number> {
  const post: BlockId[] = []
  const seen = new Set<BlockId>()
  const visit = (b: BlockId): void => {
    seen.add(b)
    for (const next of cfg.succ.get(b) ?? []) {
      if (next !== EXIT && !seen.has(next)) {
        visit(next)
      }
    }
    post.push(b)
  }
  visit(cfg.entry)

  const order = new Map<BlockId, number>()
  let rank = 0
  for (let i = post.length - 1; i >= 0; i--) {
    order.set(post[i], rank++)
  }
  return order
}

function buildLayout(cfg: Cfg, analysis: Analysis): Layout {
  const boxes = new Map<number, MutableBox>()
  const boxOf = new Map<BlockId, number>()
  let nextBoxId = 0

  const addBox = (box: MutableBox): MutableBox => {
    boxes.set(box.id, box)
    if (box.parent !== undefined) {
      ;(boxes.get(box.parent) as MutableBox).children.push(box.id)
    }
    return box
  }

  const root = addBox({
    id: nextBoxId++,
    kind: 'root',
    label: '',
    parent: undefined,
    entry: cfg.entry,
    owner: [],
    children: [],
  })

  // 循环盒：由外向内建，保证建子盒时父盒已经在
  const headers = [...analysis.loops.keys()].sort(
    (a, b) =>
      (analysis.loops.get(b) as { body: ReadonlySet<BlockId> }).body.size -
      (analysis.loops.get(a) as { body: ReadonlySet<BlockId> }).body.size,
  )
  const loopOwner = new Map<BlockId, number>()
  for (const header of headers) {
    const loop = analysis.loops.get(header) as { body: ReadonlySet<BlockId> }
    const inherited = [...loop.body].map((b) => loopOwner.get(b)).find((id) => id !== undefined)
    const box = addBox({
      id: nextBoxId,
      kind: 'loop',
      label: `L${nextBoxId}`,
      parent: inherited ?? root.id,
      entry: header,
      owner: [],
      children: [],
    })
    nextBoxId += 1
    for (const member of loop.body) {
      loopOwner.set(member, box.id)
    }
  }

  // 归属：每个块落到包含它的最内层盒
  for (const b of cfg.blocks) {
    const owner = loopOwner.get(b.id) ?? root.id
    boxOf.set(b.id, owner)
    ;(boxes.get(owner) as MutableBox).owner.push(b.id)
  }

  // 排序：本盒直接拥有的块 + 子盒，一起按全局前序排。
  // 顺序决定落点，也就是决定哪些边能走 break--见 layoutOf。
  const order = globalOrder(cfg)
  const entryOf = (item: Item): BlockId => item.kind === 'block' ? item.id : (boxes.get(item.id) as MutableBox).entry

  const frozen = new Map<number, Box>()
  for (const box of boxes.values()) {
    const items: Item[] = [
      ...box.owner.map((id): Item => ({ kind: 'block', id })),
      ...box.children.map((id): Item => ({ kind: 'box', id })),
    ]
    items.sort((a, b) => (order.get(entryOf(a)) as number) - (order.get(entryOf(b)) as number))
    frozen.set(box.id, rewrap(box, items))
  }

  return layoutOf(root.id, frozen, boxOf)
}

// ---------- 5b：跳转归类 ----------

function classify(layout: Layout, from: BlockId, to: BlockId): JumpKind | undefined {
  if (to === EXIT) {
    return undefined
  }

  const owner = layout.boxOf.get(from)
  if (owner === undefined) {
    return undefined
  }
  const box = layout.boxes.get(owner) as Box

  const slot = box.slotOf.get(from)
  const next = slot === undefined ? undefined : box.items[slot + 1]
  if (next !== undefined && entryOfItem(layout.boxes, next) === to) {
    return { kind: 'fall' }
  }

  for (const ancestor of boxAncestors(layout, owner)) {
    if (ancestor.kind === 'loop' && ancestor.entry === to) {
      return { kind: 'continue', label: ancestor.label }
    }
  }

  for (const ancestor of boxAncestors(layout, owner)) {
    if (layout.continuationOf(ancestor.id) === to) {
      return { kind: 'break', label: ancestor.label }
    }
  }
  return undefined
}

function routeJumps(cfg: Cfg, layout: Layout): Map<string, JumpKind> | undefined {
  const routes = new Map<string, JumpKind>()
  for (const block of cfg.blocks) {
    for (const to of successorsOf(block)) {
      if (to === EXIT) {
        continue
      } // exit 终结符没有后继位置，不需要归类
      const kind = classify(layout, block.id, to)
      if (kind === undefined) {
        return undefined
      }
      routes.set(edgeKey(block.id, to), kind)
    }
  }
  return routes
}

function findUnroutable(cfg: Cfg, layout: Layout): { from: BlockId; to: BlockId } | undefined {
  for (const block of cfg.blocks) {
    for (const to of successorsOf(block)) {
      if (to !== EXIT && classify(layout, block.id, to) === undefined) {
        return { from: block.id, to }
      }
    }
  }
  return undefined
}

// ---------- 5c：提升 guard 盒 ----------

/**
 * blockId 落在 box 的哪一项里。box 就是 blockId 所在盒时返回块自身那一项。
 */
function itemIndexContaining(layout: Layout, box: Box, blockId: BlockId): number | undefined {
  let current = layout.boxOf.get(blockId)
  let child = current
  while (current !== undefined && current !== box.id) {
    child = current
    current = layout.parentOf(current)
  }
  if (current === undefined || child === undefined) {
    return undefined
  }
  if (child === box.id) {
    return box.slotOf.get(blockId)
  }
  return box.items.findIndex((item) => item.kind === 'box' && item.id === child)
}

/** 一次包裹：宿主盒 + 要圈起来的 items 区间 [start, end) */
interface Span {
  readonly host: Box
  readonly start: number
  readonly end: number
}

/**
 * from → to 这条边需要的包裹区间。在**最近的那个**能把 to 摆成直接项的祖先盒里算--
 * from 可能埋在子盒里，而 to 未必和它同盒。
 */
function spanFor(layout: Layout, from: BlockId, to: BlockId): Span | undefined {
  let host = layout.boxOf.get(from)
  while (host !== undefined) {
    const box = layout.boxes.get(host) as Box
    const end = box.items.findIndex((item) => entryOfItem(layout.boxes, item) === to)
    if (end >= 0) {
      const start = itemIndexContaining(layout, box, from)
      return start === undefined || start >= end ? undefined : { host: box, start, end }
    }
    host = layout.parentOf(host)
  }
  return undefined
}

/**
 * 把 from 和 to 之间那一段包成一个 guard 盒：from 留在盒内，to 变成盒的落点，
 * 于是这条边从"够不着"变成一次 break。
 *
 * 落点不需要写下来--guard 插到 to 前面，`continuationOf(guard)` 自然就是 to。
 * 被圈进来那一段里的嵌套盒也不必重新认父：父子关系同样由 items 算。
 */
function liftToGuard(layout: Layout, from: BlockId, to: BlockId): Layout | undefined {
  const span = spanFor(layout, from, to)
  return span === undefined ? undefined : wrapInGuard(layout, span.host, span.start, span.end)
}

/** 把 box.items[start, end) 圈进一个新 guard，插回原位 */
function wrapInGuard(layout: Layout, box: Box, start: number, end: number): Layout {
  const lifted = box.items.slice(start, end)
  const boxes = new Map(layout.boxes)
  const guardId = Math.max(...boxes.keys()) + 1
  boxes.set(guardId, {
    id: guardId,
    kind: 'guard',
    label: `G${guardId}`,
    entry: entryOfItem(layout.boxes, lifted[0]),
    items: lifted,
    slotOf: slotIndexes(lifted),
  })

  boxes.set(
    box.id,
    rewrap(box, [
      ...box.items.slice(0, start),
      { kind: 'box', id: guardId },
      ...box.items.slice(end),
    ]),
  )

  const boxOf = new Map(layout.boxOf)
  for (const item of lifted) {
    if (item.kind === 'block') {
      boxOf.set(item.id, guardId)
    }
  }

  return layoutOf(layout.root, boxes, boxOf)
}

// ---------- 入口 ----------

export function plan(cfg: Cfg, analysis: Analysis): PlanResult {
  let layout = buildLayout(cfg, analysis)

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const routes = routeJumps(cfg, layout)
    if (routes !== undefined) {
      return { kind: 'ok', plan: { ...layout, routes } }
    }

    const stuck = findUnroutable(cfg, layout)
    if (stuck === undefined) {
      return { kind: 'unrepresentable' }
    }
    const lifted = liftToGuard(layout, stuck.from, stuck.to)
    if (lifted === undefined) {
      return { kind: 'unrepresentable' }
    }
    layout = lifted
  }

  return { kind: 'unrepresentable' }
}
