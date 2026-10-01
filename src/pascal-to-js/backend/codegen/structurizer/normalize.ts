/*
 * Pass 4：只做一件事--把不可约 CFG 修成可约。
 *
 * 不可约（某个强连通分量有多个入口）是唯一必须靠"复制代码"解决的问题：
 * 目标语言里没有任何语法能从一个结构跳进另一个结构的中间。
 *
 * 复制在这里是安全的：JsonCode 的变量全部是函数级的，
 * 复制语句不会复制状态。除此之外本模块不做任何别的图变换。
 */

import { type Block, type BlockId, type Cfg, makeCfg, type Terminator } from './cfg.ts'
import { analyze, type Dominators, type MultiEntryScc } from './analysis.ts'

/** 单次复制允许的语句条数上限（终结符按一条计） */
const MAX_DUPLICATED_STATEMENTS = 20
/** 迭代轮数上限 */
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

/** 副本内部的边互相指向副本；通向区域外的边保持指向原件 */
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

/** 把指向 target 的边改指副本 */
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

/** 分量内被 entry 支配的节点--复制它们就能让 entry 成为私有的 */
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

    // 保留支配范围最大的入口（复制量最小），其余入口各自获得一份私有副本
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
