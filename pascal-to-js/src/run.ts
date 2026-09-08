import { ParseResult, ParserInput } from '@/parsing/types.ts'
import { ProgramNode } from './parsing/node.ts'
import { lex } from '@/parsing/lexer/lexer.ts'
import { parseProgram } from '@/parsing/parser/declarations.ts'
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
