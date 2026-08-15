// pascal-ts 顶层 API
//
// 本文件是项目的对外入口，导出所有公开 API。
// 内部实现见各子目录的 index.ts。

// ==========================================================================
// 词法分析
// ==========================================================================

export { createOffsetToPosition, lex, tokenize } from './lexer/lexer.ts'
export type { LexerInput, Position, Token } from './ast/types.ts'

// ==========================================================================
// 语法分析
// ==========================================================================

export { parseProgram } from './parser/declarations.ts'
export { parseExpression, parseExpressionList, parseIdentifier } from './parser/expressions.ts'
export { parseCompoundStatement, parseStatement } from './parser/statements.ts'
export { parseType, parseVariableDeclaration } from './parser/types.ts'
export * from './parser/helpers.ts'

// ==========================================================================
// AST
// ==========================================================================

export type * from './ast/types.ts'
export { nodeToCode } from './ast/printer.ts'

// ==========================================================================
// 编译与执行（IL 管线）
// ==========================================================================

export { executeCompiled, run, runJs, transform } from './compiler/transform.ts'
export type { RunOptions, TransformOptions } from './compiler/transform.ts'
export type { RunError, RunState } from './runtime/run-state.ts'
export type { IlPlugin } from './compiler/plugin.ts'

// ==========================================================================
// 便捷函数
// ==========================================================================

import { lex } from './lexer/index.ts'
import { parseProgram } from './parser/index.ts'
import { ParseResult, ParserInput, ProgramNode } from './ast/types.ts'

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
