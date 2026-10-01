import { type BlockId, type Cfg, EXIT, successorsOf } from './cfg.ts'
import type { Analysis } from './analysis.ts'

export type Item =
  | { readonly kind: 'block'; readonly id: BlockId }
  | { readonly kind: 'box'; readonly id: number }

export type JumpKind =
  | { readonly kind: 'fall' }
  | { readonly kind: 'break'; readonly label: string }
  | { readonly kind: 'continue'; readonly label: string }

interface BoxSeed {
  readonly id: number
  readonly kind: 'root' | 'loop' | 'guard'
  readonly label: string
  readonly entry: BlockId
}

export interface Box extends BoxSeed {
  readonly items: readonly Item[]
  readonly slotOf: ReadonlyMap<BlockId, number>
}

export interface Layout {
  readonly root: number
  readonly boxes: ReadonlyMap<number, Box>
  readonly boxOf: ReadonlyMap<BlockId, number>
  parentOf(boxId: number): number | undefined
  continuationOf(boxId: number): BlockId
}

export interface Plan extends Layout {
  readonly routes: ReadonlyMap<string, JumpKind>
}

export type PlanResult =
  | { readonly kind: 'ok'; readonly plan: Plan }
  | { readonly kind: 'unrepresentable' }

const MAX_ROUNDS = 256

export function edgeKey(from: BlockId, to: BlockId): string {
  return `${from}:${to}`
}

export function boxAncestors(layout: Layout, boxId: number): Box[] {
  const chain: Box[] = []
  let current: number | undefined = boxId
  while (current !== undefined) {
    chain.push(layout.boxes.get(current) as Box)
    current = layout.parentOf(current)
  }
  return chain
}

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

interface MutableBox {
  readonly id: number
  readonly kind: 'root' | 'loop' | 'guard'
  readonly label: string
  readonly parent: number | undefined
  readonly entry: BlockId
  owner: BlockId[]
  children: number[]
}

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

  for (const b of cfg.blocks) {
    const owner = loopOwner.get(b.id) ?? root.id
    boxOf.set(b.id, owner)
    ;(boxes.get(owner) as MutableBox).owner.push(b.id)
  }

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
      }
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

interface Span {
  readonly host: Box
  readonly start: number
  readonly end: number
}

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

function liftToGuard(layout: Layout, from: BlockId, to: BlockId): Layout | undefined {
  const span = spanFor(layout, from, to)
  return span === undefined ? undefined : wrapInGuard(layout, span.host, span.start, span.end)
}

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
