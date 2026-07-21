import { AstNode, ParseResult, ParserInput, Position, SourceLocation, Token } from '../ast/types'

// ============================================================================
// Parser helpers — pure functions operating on {tokens, position}
// ============================================================================

export function peek(input: ParserInput): Token {
  return input.tokens[input.position]
}

// 给 AST 节点添加源码位置
export function withLoc<T extends AstNode>(
  node: T,
  start: Position,
  end: Position
): T & { loc: SourceLocation } {
  return { ...node, loc: { start, end } }
}

// 从 Token 提取位置范围（单个 token 的 start/end）
export function tokenLoc(token: Token): SourceLocation {
  return { start: token.start, end: token.end }
}

// 从两个 token 位置构造范围（用于跨多个 token 的节点）
export function rangeLoc(startToken: Token, endToken: Token): SourceLocation {
  return { start: startToken.start, end: endToken.end }
}

// --- Success / Failure constructors ---

export function ok<T>(newPosition: number, astNode: T): ParseResult<T> {
  return { success: true, newPosition, astNode }
}

export function fail<T>(error: string, position: number): ParseResult<T> {
  return { success: false, error, position }
}

// --- Token consumers ---

export function expectType(input: ParserInput, type: string): ParseResult<Token> {
  const token = peek(input)
  if (token.type !== type) {
    return fail(
      `Expected ${type} but got ${token.type} (${token.content}) at line ${token.start.line}:${token.start.column}`,
      input.position
    )
  }
  return ok(input.position + 1, token)
}

export function expectKeyword(input: ParserInput, kw: string): ParseResult<Token> {
  const token = peek(input)
  if (token.type !== kw) {
    return fail(
      `Expected keyword ${kw} but got ${token.type} (${token.content}) at line ${token.start.line}:${token.start.column}`,
      input.position
    )
  }
  return ok(input.position + 1, token)
}

// --- List parsers ---

export function parseList<T>(
  input: ParserInput,
  parseItem: (input: ParserInput) => ParseResult<T>,
  separator: string
): ParseResult<T[]> {
  const first = parseItem(input)
  if (!first.success) {
    return fail(first.error, first.position)
  }

  const items: T[] = [first.astNode]
  let pos = first.newPosition

  while (true) {
    if (input.tokens[pos]?.type !== separator) break
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
