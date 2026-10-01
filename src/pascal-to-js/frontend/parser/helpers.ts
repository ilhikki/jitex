import { AstNode, SourceLocation } from '@/frontend/node.ts'
import { Position, Token } from '@/frontend/token.ts'
import { ParseResult, ParserInput } from '@/frontend/types.ts'

export function peek(input: ParserInput): Token {
  return input.tokens[input.position]
}

export function withLoc<T extends AstNode>(
  node: T,
  start: Position,
  end: Position,
): T & { loc: SourceLocation } {
  return { ...node, loc: { start, end } }
}
function isPosition(x: Token | Position): x is Position {
  return typeof (x as Position).line === 'number'
}

export function loc<T extends AstNode>(
  node: T,
  startOrToken: Token | Position,
  endOrToken?: Token | Position,
): T & { loc: SourceLocation } {
  const startPos = isPosition(startOrToken) ? startOrToken : startOrToken.start
  if (endOrToken === undefined) {
    const token = startOrToken as Token
    return { ...node, loc: { start: token.start, end: token.end } }
  }
  const endPos = isPosition(endOrToken) ? endOrToken : endOrToken.end
  return { ...node, loc: { start: startPos, end: endPos } }
}

export function ok<T>(newPosition: number, astNode: T): ParseResult<T> {
  return { success: true, newPosition, astNode }
}

export function fail<T>(error: string, position: number): ParseResult<T> {
  return { success: false, error, position }
}

export function expectType(input: ParserInput, type: string): ParseResult<Token> {
  const token = peek(input)
  if (token.type !== type) {
    return fail(
      `Expected ${type} but got ${token.type} (${token.content}) at line ${token.start.line}:${token.start.column}`,
      input.position,
    )
  }
  return ok(input.position + 1, token)
}

export function expectKeyword(input: ParserInput, kw: string): ParseResult<Token> {
  const token = peek(input)
  if (token.type !== kw) {
    return fail(
      `Expected keyword ${kw} but got ${token.type} (${token.content}) at line ${token.start.line}:${token.start.column}`,
      input.position,
    )
  }
  return ok(input.position + 1, token)
}

export function parseList<T>(
  input: ParserInput,
  parseItem: (input: ParserInput) => ParseResult<T>,
  separator: string,
): ParseResult<T[]> {
  const first = parseItem(input)
  if (!first.success) {
    return fail(first.error, first.position)
  }

  const items: T[] = [first.astNode]
  let pos = first.newPosition

  while (true) {
    if (input.tokens[pos]?.type !== separator) {
      break
    }
    pos++
    const r = parseItem({ tokens: input.tokens, position: pos })
    if (!r.success) {
      return fail(r.error, r.position)
    }
    items.push(r.astNode)
    pos = r.newPosition
  }

  return ok(pos, items)
}
