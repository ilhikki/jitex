import { ParseResult, ParserInput } from '@/frontend/types.ts'
import { ProgramNode } from '@/frontend/node.ts'
import { lex } from '@/frontend/lexer/lexer.ts'
import { parseProgram } from '@/frontend/parser/declarations.ts'

import { analyzeProgram } from '@/middle/analysis/analysis.ts'
import { compileProgram } from '@/middle/lowering/compiler.ts'
import { toJs } from '@/backend/codegen/json-code-compiler.ts'
import type { RunError, RunState } from '@/backend/runtime/run-state.ts'

import type { RuntimeContext, RuntimeOptions } from '@/backend/runtime/runtime-type.ts'
import type { ExtraCallable } from '@/middle/analysis/analysis.ts'
import { PascalSemanticCompiler } from '@/backend/runtime/sys/pascal-semantic-compiler.ts'
import { createDispatcher, createRuntimeContext, toRunState } from '@/backend/runtime/runtime.ts'
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

export interface TransformOptions {
  /** 非标特性扩展（传递给 analysis 做语义检查） */
  extensions?: string[]
  /** 额外 callable 注入（编译期声明非标过程/函数，AGENTS.md 原则 A.7：注入优先） */
  extraCallables?: Record<string, ExtraCallable>
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

export function transform(source: string, options: TransformOptions = {}): string {
  const ast = parseSource(source)

  const analysis = analyzeProgram(ast, options.extensions, options.extraCallables)

  const jsonCode = compileProgram(ast, analysis)

  const semantic = new PascalSemanticCompiler()
  const { code: jsBody, mainName } = toJs(jsonCode, {
    semantic,
    debugNames: analysis.debugNames(),
  })

  return `${jsBody}\nexport default ${mainName};`
}

export function executeCompiled(
  code: string,
  __sys: (key: string, args: unknown[]) => unknown,
): void {
  // 提取导出的函数名
  const exportMatch = code.match(/export\s+default\s+(\w+);/)
  if (!exportMatch) {
    throw new Error('executeCompiled: no export found in code')
  }
  const mainName = exportMatch[1]

  // 移除 export 语句，添加 return
  const execCode = code.replace(/export.*$/, `return ${mainName};`)
  const factory = new Function(execCode)
  const mainFn = factory()
  mainFn(__sys)
}

export interface RunOptions extends TransformOptions, RuntimeOptions {}

function reportErrorAsState(e: unknown, ctx: RuntimeContext) {
  const err = e as { message?: string; stack?: string } | null | undefined
  // 编译或执行出错：保留已产生的输出，并完整保存错误堆栈到 stackTrace
  const stackLines: string[] = err?.stack ? String(err.stack).split('\n').slice(0, 40) : []
  // 同时把错误信息追加到 debugLog，便于 e2e 报告统一查看
  ctx.debugLog.push(`[run] error: ${err?.message || String(e)}`)
  for (const line of stackLines) {
    ctx.debugLog.push(`  ${line}`)
  }
  const error: RunError = {
    message: err?.message || String(e),
    stackTrace: stackLines,
  }
  return toRunState(ctx, 'error', error)
}

function getRunTimeContextFromOptions(options: RuntimeOptions) {
  const ctx = createRuntimeContext({
    files: options.files,
    programFileUrls: options.programFileUrls,
    maxSteps: options.maxSteps,
    extensions: options.extensions,
  })
  return ctx
}

export function runJs(source: string, options: RuntimeOptions): RunState {
  const ctx = getRunTimeContextFromOptions(options)
  try {
    ctx.jsCode = source
    // __sys dispatcher
    const dispatcher = createDispatcher(options.extraSyscalls ?? {})
    const __sys = (key: string, args: unknown[]): unknown => {
      return dispatcher(ctx, key, args)
    }

    // 执行（ES module 代码）
    executeCompiled(source, __sys)

    return toRunState(ctx, 'terminated')
  } catch (e: unknown) {
    return reportErrorAsState(e, ctx)
  }
}

export function run(source: string, options: RunOptions = {}): RunState {
  let jsCode
  try {
    jsCode = transform(source, {
      extensions: options.extensions,
      extraCallables: options.extraCallables,
    })
  } catch (e: unknown) {
    const ctx = getRunTimeContextFromOptions(options)
    return reportErrorAsState(e, ctx)
  }
  return runJs(jsCode, options)
}
