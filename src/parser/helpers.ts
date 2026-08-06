import { AstNode, ParseResult, ParserInput, Position, SourceLocation, Token } from '@/ast/types'

// ============================================================================
// Parser helpers — pure functions operating on {tokens, position}
// ============================================================================

export function peek(input: ParserInput): Token {
  return input.tokens[input.position]
}

// 给 AST 节点添加源码位置（基础函数：传入起止 Position）
export function withLoc<T extends AstNode>(
  node: T,
  start: Position,
  end: Position
): T & { loc: SourceLocation } {
  return { ...node, loc: { start, end } }
}

// loc: 统一的节点构造辅助函数，减少 `withLoc(node, token.start, token.end)` 这类重复。
// 支持三种调用形式：
//   loc(node, token)                       // 单个 token 的范围
//   loc(node, startToken, endToken)        // 跨多个 token 的范围
//   loc(node, startPos, endPos)            // 已有 Position 的范围（等价于 withLoc）
function isPosition(x: Token | Position): x is Position {
  return typeof (x as Position).line === 'number'
}

export function loc<T extends AstNode>(
  node: T,
  startOrToken: Token | Position,
  endOrToken?: Token | Position
): T & { loc: SourceLocation } {
  const startPos = isPosition(startOrToken) ? startOrToken : startOrToken.start
  if (endOrToken === undefined) {
    // 单 token 模式：start 与 end 来自同一个 token
    const token = startOrToken as Token
    return { ...node, loc: { start: token.start, end: token.end } }
  }
  const endPos = isPosition(endOrToken) ? endOrToken : endOrToken.end
  return { ...node, loc: { start: startPos, end: endPos } }
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
