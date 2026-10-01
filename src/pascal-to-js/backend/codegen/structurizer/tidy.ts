import type { SNode } from './types.ts'

type JumpKind = 'break' | 'continue'

function isBox(node: SNode): node is Extract<SNode, { kind: 'loop' | 'guard' }> {
  return node.kind === 'loop' || node.kind === 'guard'
}

function stripTail(body: readonly SNode[], kind: JumpKind, label: string): readonly SNode[] {
  if (body.length === 0) {
    return body
  }
  const index = body.length - 1
  const last = body[index]

  if (last.kind === kind && last.label === label) {
    return body.slice(0, index)
  }

  if (last.kind === 'if') {
    const then = stripTail(last.then, kind, label)
    const otherwise = stripTail(last.else, kind, label)
    if (then === last.then && otherwise === last.else) {
      return body
    }
    return [...body.slice(0, index), { ...last, then, else: otherwise }]
  }

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
