/*
 * Pass 2：CFG 化简--跳转穿线（空块消除）。
 *
 * 目标语言里没有 goto，任何"跳转"最终都要落成 fall / break / continue 之一。
 * 而 fall 是免费的：只要目标块紧跟在后面。空块（没有语句、只含一条 goto）会把这条
 * 免费的路撑断--a → 空块 → b 记成两次跳转，其实等价于 a → b 一次。
 *
 * 所以这里做的是标准的跳转穿线：把每个空块的入边直接改指到它链上的第一个实体块，
 * 然后删掉这些空块。做完之后"跳转链"不再存在，每条边都直连两个有内容的块。
 *
 * 成环的空块链（例如 `L: goto L`）整条保留：它是无语句死循环，
 * 既没有终点可以穿线，也不该被删掉。
 */

import { type Block, type BlockId, type Cfg, makeCfg, type Terminator } from './cfg.ts'

function isEmptyGoto(block: Block): boolean {
  return block.body.length === 0 && block.term.kind === 'goto'
}

/**
 * 沿空块链走到第一个实体块。
 *
 * memo 同时充当访问标记：值为 undefined 表示"这条链成环，整条都保留"。
 */
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

/** 把终结符上的目标改指到穿线终点 */
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
  // 可消空块 → 链终点。终点本身一定不是空块，所以这里只可能走一跳。
  const redirect = new Map<BlockId, BlockId>()

  for (const block of cfg.blocks) {
    // 入口块永远保留：它的 id 由 makeCfg 从 blocks[0] 取
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
