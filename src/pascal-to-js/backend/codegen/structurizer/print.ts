import type { SNode } from './types.ts'

const INDENT = '  '

function indentLines(text: string, indent: string): string {
  return text
    .split('\n')
    .map((line) => indent + line)
    .join('\n')
}

function braced(header: string, body: readonly SNode[], indent: string): string {
  const inner = emitSNode(body, indent + INDENT)
  if (inner.length === 0) {
    return `${indent}${header} {}`
  }
  return `${indent}${header} {\n${inner}\n${indent}}`
}

function printIf(node: Extract<SNode, { kind: 'if' }>, indent: string): string {
  const head = braced(`if (${node.cond})`, node.then, indent)
  if (node.else.length === 0) {
    return head
  }
  const tail = braced('else', node.else, indent)
  return `${head} ${tail.slice(indent.length)}`
}

type Printer<K extends SNode['kind']> = (node: Extract<SNode, { kind: K }>, indent: string) => string

const PRINTERS: { readonly [K in SNode['kind']]: Printer<K> } = {
  stmt: (node, indent) => indentLines(node.code, indent),
  break: (node, indent) => `${indent}break${node.label === undefined ? '' : ` ${node.label}`};`,
  continue: (node, indent) => `${indent}continue${node.label === undefined ? '' : ` ${node.label}`};`,
  if: printIf,
  loop: (node, indent) => braced(`${node.label}: while (true)`, node.body, indent),
  guard: (node, indent) => braced(`${node.label}:`, node.body, indent),
}

function printNode(node: SNode, indent: string): string {
  const printer = PRINTERS[node.kind] as (node: SNode, indent: string) => string
  return printer(node, indent)
}

export function emitSNode(nodes: readonly SNode[], indent: string): string {
  return nodes.map((node) => printNode(node, indent)).join('\n')
}
