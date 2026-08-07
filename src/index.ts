// pascal-ts 顶层 API
//
// 本文件是项目的对外入口，导出所有公开 API。
// 内部实现见各子目录的 index.ts。

// ==========================================================================
// 词法分析
// ==========================================================================

export { lex, tokenize, createOffsetToPosition } from './lexer/lexer'
export type { Token, Position, LexerInput } from './ast/types'

// ==========================================================================
// 语法分析
// ==========================================================================

export { parseProgram } from './parser/declarations'
export { parseExpression, parseIdentifier, parseExpressionList } from './parser/expressions'
export { parseStatement, parseCompoundStatement } from './parser/statements'
export { parseType, parseVariableDeclaration } from './parser/types'
export * from './parser/helpers'

// ==========================================================================
// AST
// ==========================================================================

export type * from './ast/types'
export { nodeToCode } from './ast/printer'

// ==========================================================================
// 编译与执行（IL 管线）
// ==========================================================================

export { transform, run, executeCompiled } from '@/compiler/transform'
export type { TransformOptions, RunOptions } from '@/compiler/transform'
export type { RunState, RunError } from './runtime/run-state'
export type { IlPlugin } from '@/compiler/plugin'

// ==========================================================================
// 便捷函数
// ==========================================================================

import { lex } from './lexer/lexer'
import { parseProgram } from './parser/declarations'
import { ParserInput, ParseResult, ProgramNode } from './ast/types'

/**
 * 将 Pascal 源码解析为 AST。
 *
 * @param source - Pascal 源码字符串
 * @returns ParseResult<ProgramNode> - 解析结果，成功时包含 AST 节点
 */
export function parse(source: string): ParseResult<ProgramNode> {
  const tokens = lex(source)
  const input: ParserInput = { tokens, position: 0 }
  return parseProgram(input)
}
