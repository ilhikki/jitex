export { lex, tokenize, createOffsetToPosition } from './lexer/lexer'
export type { Token, Position, LexerInput } from './ast/types'
export type * from './ast/types'
export { parseProgram } from './parser/declarations'
export { parseExpression, parseIdentifier, parseExpressionList } from './parser/expressions'
export { parseStatement, parseCompoundStatement } from './parser/statements'
export { parseType, parseVariableDeclaration } from './parser/types'
export * from './parser/helpers'
export { nodeToCode } from './ast/printer'

// JS 编译器公开 API
export { runJS, compileToJS } from './js-compiler'
export type { RunState, RunError, JSRunOptions, JSDebugOptions } from './js-compiler'

import { lex } from './lexer/lexer'
import { parseProgram } from './parser/declarations'
import { ParserInput, ParseResult, ProgramNode } from './ast/types'

export function parse(source: string): ParseResult<ProgramNode> {
  const tokens = lex(source)
  const input: ParserInput = { tokens, position: 0 }
  return parseProgram(input)
}
