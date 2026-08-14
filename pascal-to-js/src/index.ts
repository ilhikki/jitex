// pascal-ts 顶层 API
//
// 本文件是项目的对外入口，导出所有公开 API。
// 内部实现见各子目录的 index.ts。

// ==========================================================================
// 词法分析
// ==========================================================================

export { createOffsetToPosition, lex, tokenize } from './lexer/lexer'
export type { LexerInput, Position, Token } from './ast/types'

// ==========================================================================
// 语法分析
// ==========================================================================

export { parseProgram } from './parser/declarations'
export { parseExpression, parseExpressionList, parseIdentifier } from './parser/expressions'
export { parseCompoundStatement, parseStatement } from './parser/statements'
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

export { executeCompiled, run, transform } from '@/compiler/transform'
export type { RunOptions, TransformOptions } from '@/compiler/transform'
export type { RunError, RunState } from './runtime/run-state'
export type { IlPlugin } from '@/compiler/plugin'

// ==========================================================================
// 便捷函数
// ==========================================================================

import { lex } from '@/lexer'
import { parseProgram } from '@/parser'
import { ParseResult, ParserInput, ProgramNode } from './ast/types'

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
