/*
 * Pass 3：把 CFG 变成四个只读查询对象。
 *
 * 这一层不产生任何输出，只回答"谁支配谁""谁和谁在一个循环里""哪条边回边"。
 * 正支配和后支配共用同一份实现（后支配 = 在反向图上跑一遍），
 * 调用方拿到的都是不依赖方向的查询接口。
 */

import { type BlockId, type Cfg, EXIT, reachableFrom, successorsOf } from './cfg.ts'

/** 支配关系的只读查询。反向后即为"后支配"。 */
export interface Dominators {
  readonly root: BlockId
  /** a 支配 b（a === b 时为真） */
  dominates(a: BlockId, b: BlockId): boolean
  /** 直接支配者；root 没有 */
  immediateOf(id: BlockId): BlockId | undefined
  /** 最近公共支配者（两个块都在 root 之下时必有解） */
  commonAncestor(a: BlockId, b: BlockId): BlockId
  /** 从 a 到祖先的链（含 a，不含 stop 及更上） */
  chainTo(id: BlockId, stop: BlockId): BlockId[]
}

export interface Loop {
  readonly header: BlockId
  readonly body: ReadonlySet<BlockId>
  /** 循环体内节点所有通向循环外的边的目标 */
  readonly exits: ReadonlySet<BlockId>
}

/** 入口不唯一的强连通分量--不可约的本体 */
export interface MultiEntryScc {
  readonly nodes: ReadonlySet<BlockId>
  readonly entries: readonly BlockId[]
}

export interface Analysis {
  readonly dom: Dominators
  readonly pdom: Dominators
  readonly loops: ReadonlyMap<BlockId, Loop>
  readonly multiEntrySccs: readonly MultiEntryScc[]
}

// ---------- 支配树 ----------

function reversePostOrder(root: BlockId, succOf: (id: BlockId) => readonly BlockId[]): BlockId[] {
  const post: BlockId[] = []
  const seen = new Set<BlockId>()
  const visit = (b: BlockId): void => {
    seen.add(b)
    for (const s of succOf(b)) {
      if (!seen.has(s)) {
        visit(s)
      }
    }
    post.push(b)
  }
  visit(root)
  return post.reverse()
}

function immediateDominators(
  root: BlockId,
  succOf: (id: BlockId) => readonly BlockId[],
  predOf: (id: BlockId) => readonly BlockId[],
): Map<BlockId, BlockId> {
  const order = reversePostOrder(root, succOf)
  const rank = new Map(order.map((id, i) => [id, i] as const))
  const idom = new Map<BlockId, BlockId>([[root, root]])

  const intersect = (a: BlockId, b: BlockId): BlockId => {
    let x = a
    let y = b
    while (x !== y) {
      while ((rank.get(x) as number) > (rank.get(y) as number)) {
        x = idom.get(x) as BlockId
      }
      while ((rank.get(y) as number) > (rank.get(x) as number)) {
        y = idom.get(y) as BlockId
      }
    }
    return x
  }

  let changed = true
  while (changed) {
    changed = false
    for (const b of order) {
      if (b === root) {
        continue
      }
      let next: BlockId | undefined
      for (const p of predOf(b)) {
        if (!idom.has(p)) {
          continue
        }
        next = next === undefined ? p : intersect(p, next)
      }
      if (next === undefined || idom.get(b) === next) {
        continue
      }
      idom.set(b, next)
      changed = true
    }
  }
  return idom
}

export function dominatorsOf(
  root: BlockId,
  succOf: (id: BlockId) => readonly BlockId[],
  predOf: (id: BlockId) => readonly BlockId[],
): Dominators {
  const idom = immediateDominators(root, succOf, predOf)

  const depthCache = new Map<BlockId, number>()
  const depthOf = (id: BlockId): number => {
    const cached = depthCache.get(id)
    if (cached !== undefined) {
      return cached
    }
    const parent = idom.get(id)
    const value = parent === undefined || parent === id ? 0 : depthOf(parent) + 1
    depthCache.set(id, value)
    return value
  }

  return {
    root,
    dominates: (a, b) => {
      let x: BlockId | undefined = b
      while (x !== undefined) {
        if (x === a) {
          return true
        }
        const parent = idom.get(x)
        x = parent === x ? undefined : parent
      }
      return false
    },
    immediateOf: (id) => {
      const parent = idom.get(id)
      return parent === undefined || parent === id ? undefined : parent
    },
    commonAncestor: (a, b) => {
      let x = a
      let y = b
      // 深度相等只说明两者互不为祖先，必须同时上移，否则原地打转
      while (x !== y) {
        const dx = depthOf(x)
        const dy = depthOf(y)
        if (dx >= dy) {
          x = idom.get(x) as BlockId
        }
        if (dy >= dx) {
          y = idom.get(y) as BlockId
        }
      }
      return x
    },
    chainTo: (id, stop) => {
      const chain: BlockId[] = []
      let x: BlockId | undefined = id
      while (x !== undefined && x !== stop) {
        chain.push(x)
        const parent = idom.get(x)
        x = parent === x ? undefined : parent
      }
      return chain
    },
  }
}

// ---------- 自然循环 ----------

function backEdgeLatches(cfg: Cfg, dom: Dominators): Map<BlockId, BlockId[]> {
  const latches = new Map<BlockId, BlockId[]>()
  for (const b of cfg.blocks) {
    for (const next of successorsOf(b)) {
      if (next === EXIT || !dom.dominates(next, b.id)) {
        continue
      }
      const list = latches.get(next)
      if (list === undefined) {
        latches.set(next, [b.id])
      } else list.push(b.id)
    }
  }
  return latches
}

function loopBody(cfg: Cfg, header: BlockId, latches: readonly BlockId[]): Set<BlockId> {
  const body = new Set<BlockId>([header])
  const work = [...latches]
  while (work.length > 0) {
    const node = work.pop() as BlockId
    if (body.has(node)) {
      continue
    }
    body.add(node)
    for (const p of cfg.pred.get(node) ?? []) {
      if (p !== EXIT) {
        work.push(p)
      }
    }
  }
  return body
}

function exitsOf(cfg: Cfg, body: ReadonlySet<BlockId>): Set<BlockId> {
  const exits = new Set<BlockId>()
  for (const node of body) {
    for (const next of cfg.succ.get(node) ?? []) {
      if (!body.has(next)) {
        exits.add(next)
      }
    }
  }
  return exits
}

function computeLoops(cfg: Cfg, dom: Dominators): Map<BlockId, Loop> {
  const loops = new Map<BlockId, Loop>()
  for (const [header, latches] of backEdgeLatches(cfg, dom)) {
    const body = loopBody(cfg, header, latches)
    loops.set(header, { header, body, exits: exitsOf(cfg, body) })
  }
  return loops
}

// ---------- 强连通分量 ----------

function stronglyConnected(cfg: Cfg): Set<BlockId>[] {
  const reach = new Map<BlockId, Set<BlockId>>()
  for (const b of cfg.blocks) {
    reach.set(b.id, reachableFrom(cfg, b.id))
  }

  const assigned = new Set<BlockId>()
  const components: Set<BlockId>[] = []
  for (const b of cfg.blocks) {
    if (assigned.has(b.id)) {
      continue
    }
    const forward = reach.get(b.id) as Set<BlockId>
    const nodes = cfg.blocks
      .map((x) => x.id)
      .filter((x) => forward.has(x) && (reach.get(x) as Set<BlockId>).has(b.id))
    for (const n of nodes) {
      assigned.add(n)
    }
    components.push(new Set(nodes))
  }
  return components
}

function entryTargetsOf(cfg: Cfg, nodes: ReadonlySet<BlockId>): BlockId[] {
  const entries = new Set<BlockId>()
  for (const n of nodes) {
    for (const p of cfg.pred.get(n) ?? []) {
      if (!nodes.has(p)) {
        entries.add(n)
      }
    }
  }
  if (nodes.has(cfg.entry)) {
    entries.add(cfg.entry)
  }
  return [...entries]
}

// ---------- 入口 ----------

export function analyze(cfg: Cfg): Analysis {
  const dom = dominatorsOf(
    cfg.entry,
    (id) => cfg.succ.get(id) ?? [],
    (id) => cfg.pred.get(id) ?? [],
  )

  const unreachable = cfg.blocks.filter((b) => !reachableFrom(cfg, b.id).has(EXIT)).map((b) => b.id)
  const pdom = dominatorsOf(
    EXIT,
    (id) => (id === EXIT ? [...(cfg.pred.get(EXIT) ?? []), ...unreachable] : (cfg.pred.get(id) ?? [])),
    (id) => (id === EXIT ? [] : (cfg.succ.get(id) ?? [])),
  )

  const multiEntrySccs = stronglyConnected(cfg)
    .map((nodes) => ({ nodes, entries: entryTargetsOf(cfg, nodes) }))
    .filter((scc) => scc.entries.length > 1)

  return { dom, pdom, loops: computeLoops(cfg, dom), multiEntrySccs }
}
