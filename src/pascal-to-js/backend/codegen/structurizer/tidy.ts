/*
 * Pass 7：整形--把结构上多余的写法去掉，只做等价改写。
 *
 *   1. 尾位置上的 break / continue 是多余的：落到底和显式跳出到达同一处。
 *      尾位置会穿过 if 的两支、以及嵌套盒的末尾继续传递。
 *   2. `if (cond) {} else { X }` 等价于 `if (!(cond)) { X }`。
 *
 * 这两条都只依赖结构，不需要回看 CFG，所以放在 lower 与 print 之间：
 * lower 负责落成树，print 只管排版，中间的等价化简归这里。
 */

import type { SNode } from './types.ts'

type JumpKind = 'break' | 'continue'

/** 盒子节点：包裹之外不加语义，尾位置可以穿过去 */
function isBox(node: SNode): node is Extract<SNode, { kind: 'loop' | 'guard' }> {
  return node.kind === 'loop' || node.kind === 'guard'
}

/** 把 body 尾位置上多余的 `kind label` 去掉 */
function stripTail(body: readonly SNode[], kind: JumpKind, label: string): readonly SNode[] {
  if (body.length === 0) {
    return body
  }
  const index = body.length - 1
  const last = body[index]

  // 本级就是那条跳转
  if (last.kind === kind && last.label === label) {
    return body.slice(0, index)
  }

  // 尾位置穿过 if 的两支
  if (last.kind === 'if') {
    const then = stripTail(last.then, kind, label)
    const otherwise = stripTail(last.else, kind, label)
    if (then === last.then && otherwise === last.else) {
      return body
    }
    return [...body.slice(0, index), { ...last, then, else: otherwise }]
  }

  // 尾位置穿过嵌套盒的末尾：落出盒尾等于落出外层 body 的尾部
  if (isBox(last)) {
    const inner = stripTail(last.body, kind, label)
    if (inner === last.body) {
      return body
    }
    return [...body.slice(0, index), { ...last, body: inner }]
  }

  return body
}

function tidy(node: SNode): SNode {
  switch (node.kind) {
    case 'if': {
      const then = tidyNodes(node.then)
      const otherwise = tidyNodes(node.else)
      // 空 then + 非空 else：反过来写，条件取反
      if (then.length === 0 && otherwise.length > 0) {
        return { kind: 'if', cond: `!(${node.cond})`, then: otherwise, else: [] }
      }
      return { ...node, then, else: otherwise }
    }
    case 'loop':
      return { kind: 'loop', label: node.label, body: tidyNodes(stripTail(node.body, 'continue', node.label)) }
    case 'guard':
      return { kind: 'guard', label: node.label, body: tidyNodes(stripTail(node.body, 'break', node.label)) }
    default:
      return node
  }
}

function tidyNodes(nodes: readonly SNode[]): SNode[] {
  return nodes.map(tidy)
}

export function tidyTree(nodes: readonly SNode[]): SNode[] {
  return tidyNodes(nodes)
}
