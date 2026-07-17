import { Token, ParserInput, ParseResult, AstNode, Position, SourceLocation } from '../ast/types'

// ============================================================================
// Parser helpers — pure functions operating on {tokens, position}
// ============================================================================

export function peek(input: ParserInput): Token {
  return input.tokens[input.position]
}

export function peekAt(input: ParserInput, offset: number): Token {
  const idx = input.position + offset
  if (idx >= input.tokens.length) return input.tokens[input.tokens.length - 1]
  return input.tokens[idx]
}

export function isType(input: ParserInput, type: string): boolean {
  return peek(input).type === type
}

export function isKeyword(input: ParserInput, kw: string): boolean {
  return peek(input).type === kw
}

export function atEnd(input: ParserInput): boolean {
  return peek(input).type === 'EOF'
}

export function tokenContent(input: ParserInput): string {
  return peek(input).content
}

export function tokenPosition(input: ParserInput): Position {
  return peek(input).start
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

export function consume(input: ParserInput): ParseResult<Token> {
  const token = peek(input)
  if (token.type === 'EOF') {
    return fail('Unexpected end of input', input.position)
  }
  return ok(input.position + 1, token)
}

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

// --- Optional consumers (return null if not matched, advance if matched) ---

export function matchType(input: ParserInput, type: string): Token | null {
  if (peek(input).type === type) {
    return input.tokens[input.position++]
  }
  return null
}

export function matchKeyword(input: ParserInput, kw: string): Token | null {
  if (peek(input).type === kw) {
    return input.tokens[input.position++]
  }
  return null
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
