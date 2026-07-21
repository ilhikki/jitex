import { lex, tokenize, createOffsetToPosition } from './lexer/lexer'
import type { Token, Position, LexerInput, ParseResult, ParserInput, ProgramNode } from './ast/types'
import { parseProgram } from './parser/declarations'
import { parseExpression, parseIdentifier, parseExpressionList } from './parser/expressions'
import { parseStatement, parseCompoundStatement } from './parser/statements'
import { parseType, parseVariableDeclaration } from './parser/types'
import { runJS, compileToJS } from './compiler/run-js'
import type { RunState, RunError, JSRunOptions, JSDebugOptions } from './compiler/run-js'
import { Compiler as CompilerClass } from './compiler/compiler'
import { buildTypeTable } from './compiler/type-table-builder'
import type { TypeDef, TypeTable, PascalValue, RuntimeCtx, SysCallHandler } from './types/types'
import { createTypeTable } from './types/types'
import { STRING_TYPE } from './types/plugins/string.plugin'
import { nodeToCode } from './ast/printer'

export const Lexer = {
  lex,
  tokenize,
  createOffsetToPosition,
}

export { lex, tokenize, createOffsetToPosition }

export type { Token, Position, LexerInput }

export const Parser = {
  parseProgram,
  parseExpression,
  parseIdentifier,
  parseExpressionList,
  parseStatement,
  parseCompoundStatement,
  parseType,
  parseVariableDeclaration,
}

export { parseProgram }

export type { ParseResult, ParserInput }

export const Compiler = {
  compileToJS,
  Compiler: CompilerClass,
  buildTypeTable,
}

export const Runtime = {
  runJS,
}

export type { RunState, RunError, JSRunOptions, JSDebugOptions }

export const Types = {
  createTypeTable,
  STRING_TYPE,
}

export type { TypeDef, TypeTable, PascalValue, RuntimeCtx, SysCallHandler }

export * as AST from './ast/types'

export type * from './ast/types'

export { nodeToCode }

export function parse(source: string): ParseResult<ProgramNode> {
  const tokens = lex(source)
  const input: ParserInput = { tokens, position: 0 }
  return parseProgram(input)
}

export { runJS, compileToJS }