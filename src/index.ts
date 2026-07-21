// pascal-ts 顶层 API
//
// 本文件是项目的对外入口，导出所有公开 API：
// - 词法分析：lex / tokenize
// - 语法分析：parse / parseProgram / parseExpression / ...
// - 执行/编译：runJS / compileToJS
//
// 详细的 JS 编译器 API 见 src/js-compiler/index.ts
// AST 节点类型见 src/ast/types.ts

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

/**
 * 将 Pascal 源码解析为 AST。
 *
 * @param source - Pascal 源码字符串
 * @returns ParseResult&lt;ProgramNode&gt; - 解析结果，成功时包含 AST 节点
 *
 * @example
 * ```ts
 * import { parse } from 'pascal-ts'
 * const result = parse('program hello; begin writeln(42); end.')
 * if (result.success) console.log(result.astNode)
 * ```
 */
export function parse(source: string): ParseResult<ProgramNode> {
  const tokens = lex(source)
  const input: ParserInput = { tokens, position: 0 }
  return parseProgram(input)
}
