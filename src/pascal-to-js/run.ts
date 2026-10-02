import { ParseResult, ParserInput } from '@/frontend/types.ts'
import { ProgramNode } from '@/frontend/node.ts'
import { lex } from '@/frontend/lexer/lexer.ts'
import { parseProgram } from '@/frontend/parser/declarations.ts'

import { analyzeProgram } from '@/middle/analysis/analysis.ts'
import { loweringProgram } from '@/middle/lowering/lowering.ts'
import type { SyscallRewriter, SyscallRewriteTable } from '@/middle/rewrite/rewrite.ts'
import { composeMapping, mergeRewriteTables, rewrite } from '@/middle/rewrite/rewrite.ts'
import { buildExtraCallableRewriters, buildPascalRewriteTable } from '@/middle/rewrite/pascal-rewriters.ts'
import { toJs } from '@/backend/codegen/json-code-compiler.ts'
import { PascalSemanticCompiler } from '@/backend/codegen/semantic-compiler.ts'
import { ExtraCallable } from '@/middle/analysis/analysis-type.ts'

/**
 * Parses Pascal source text into a program AST.
 *
 * @param source - Pascal source code to parse.
 * @returns The parse result, holding the AST on success or an error on failure.
 */
export function parse(source: string): ParseResult<ProgramNode> {
  const tokens = lex(source)
  const input: ParserInput = { tokens, position: 0 }
  return parseProgram(input)
}

/**
 * Options controlling {@link transform}.
 */
export interface TransformOptions {
  /** User-provided callables exposed to the Pascal program. */
  extraCallables?: Record<string, ExtraCallable>

  /** Rewrite rules for syscalls, keyed by syscall name. */
  syscallRewriters?: SyscallRewriteTable

  /** Fallback rewriter applied to syscalls without a matching rule. */
  defaultRewriter?: SyscallRewriter

  /** Enables debug names and diagnostics in the generated code. */
  debug?: boolean
}

function parseSource(source: string): ProgramNode {
  const tokens = lex(source)
  const input = { tokens, position: 0 }
  const result = parseProgram(input)
  if (!result.success) {
    throw new Error(`Parse error: ${result.error}`)
  }
  return result.astNode as ProgramNode
}

/**
 * Compiles Pascal source text into a JavaScript module.
 *
 * @param source - Pascal source code to compile.
 * @param options - Compilation options.
 * @returns JavaScript source whose default export is the program entry point.
 */
export function transform(source: string, options: TransformOptions = {}): string {
  const ast = parseSource(source)

  const debug = options.debug ?? false
  const analysis = analyzeProgram(ast, options.extraCallables, debug)

  const jsonCode = loweringProgram(ast, analysis)

  const table = mergeRewriteTables(
    mergeRewriteTables(buildPascalRewriteTable(debug), buildExtraCallableRewriters(options.extraCallables)),
    options.syscallRewriters,
  )
  const ir = rewrite(jsonCode, composeMapping(table, options.defaultRewriter))

  const semantic = new PascalSemanticCompiler()
  const { code: jsBody, mainName } = toJs(ir, {
    semantic,
    debugNames: analysis.debugNames(),
    debug,
  })

  return `${jsBody}\nexport default ${mainName};`
}
