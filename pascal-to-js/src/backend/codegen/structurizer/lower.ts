/*
 * Pass 6：把规划结果落成语法树。
 *
 * 这里没有任何判断——每条边该 fall 还是 break/continue 已经在 routes 里定好了，
 * 本模块只负责按盒的 items 顺序输出、按 routes 查表渲染跳转。
 */

import { type Block, type BlockId, type Cfg } from './cfg.ts'
import { type Box, edgeKey, type JumpKind, type Plan } from './plan.ts'
import type { SNode } from './types.ts'

function jumpNodes(kind: JumpKind): SNode[] {
  switch (kind.kind) {
    case 'fall':
      return []
    case 'break':
      return [{ kind: 'break', label: kind.label }]
    case 'continue':
      return [{ kind: 'continue', label: kind.label }]
  }
}

function routeOf(plan: Plan, from: BlockId, to: BlockId): JumpKind {
  return plan.routes.get(edgeKey(from, to)) as JumpKind
}

function blockNodes(cfg: Cfg, plan: Plan, id: BlockId): SNode[] {
  const block = cfg.byId.get(id) as Block
  const literal: SNode[] = block.body.map((code) => ({ kind: 'stmt', code }))
  const term = block.term

  switch (term.kind) {
    case 'exit':
      // return / longJump 已经渲染进 body 了
      return literal
    case 'goto':
      return [...literal, ...jumpNodes(routeOf(plan, id, term.to))]
    case 'branch':
      return [
        ...literal,
        {
          kind: 'if',
          cond: term.cond,
          then: jumpNodes(routeOf(plan, id, term.then)),
          else: jumpNodes(routeOf(plan, id, term.else)),
        },
      ]
  }
}

function boxNodes(cfg: Cfg, plan: Plan, boxId: number): SNode[] {
  const box = plan.boxes.get(boxId) as Box
  const body: SNode[] = []
  for (const item of box.items) {
    body.push(...(item.kind === 'block' ? blockNodes(cfg, plan, item.id) : boxNodes(cfg, plan, item.id)))
  }
  if (box.kind === 'loop') {
    return [{ kind: 'loop', label: box.label, body }]
  }
  if (box.kind === 'guard') {
    return [{ kind: 'guard', label: box.label, body }]
  }
  return body
}

export function lower(cfg: Cfg, plan: Plan): SNode[] {
  return boxNodes(cfg, plan, plan.root)
}
