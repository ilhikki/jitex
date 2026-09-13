import { ParseResult, ParserInput } from '@/frontend/types.ts'
import { ProgramNode } from '@/frontend/node.ts'
import { lex } from '@/frontend/lexer/lexer.ts'
import { parseProgram } from '@/frontend/parser/declarations.ts'

import { analyzeProgram } from '@/middle/analysis/analysis.ts'
import { loweringProgram } from '@/middle/lowering/lowering.ts'
import type { SyscallRewriter, SyscallRewriteTable } from '@/middle/rewrite/rewrite.ts'
import { composeMapping, mergeRewriteTables, rewrite } from '@/middle/rewrite/rewrite.ts'
import { buildPascalRewriteTable } from '@/middle/rewrite/pascal-rewriters.ts'
import { toJs } from '@/backend/codegen/json-code-compiler.ts'
import type { RunError, RunState } from '@/backend/runtime/run-state.ts'

import { RuntimeContext, RuntimeOptions, Syscall } from '@/backend/runtime/runtime-type.ts'
import { PascalSemanticCompiler } from '@/backend/runtime/sys/pascal-semantic-compiler.ts'
import { createDispatcher, createRuntimeContext, toRunState } from '@/backend/runtime/runtime.ts'
import { ExtraCallable } from '@/middle/analysis/analysis-type.ts'

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
  /**
   * 用户自定义 syscall 重写表。
   * 与内部 buildPascalRewriteTable() 合并，同 key 覆盖内部表。
   * 某 key 设为 undefined 可禁用内部对该 key 的重写。
   * 详见 src/middle/rewrite/rewrite.ts。
   */
  syscallRewriters?: SyscallRewriteTable
  /**
   * 默认回退重写函数：未命中重写表时调用。
   * 不传则使用 id 函数（原样返回 syscall）。
   */
  defaultRewriter?: SyscallRewriter
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

  const jsonCode = loweringProgram(ast, analysis)

  // IR 重写：合并内部 pascal 表与用户表，合成单一映射后执行后序 DFS 替换
  const table = mergeRewriteTables(buildPascalRewriteTable(), options.syscallRewriters)
  const ir = rewrite(jsonCode, composeMapping(table, options.defaultRewriter))

  const semantic = new PascalSemanticCompiler()
  const { code: jsBody, mainName } = toJs(ir, {
    semantic,
    debugNames: analysis.debugNames(),
  })

  return `${jsBody}\nexport default ${mainName};`
}

export function executeCompiled(
  code: string,
  syscalls: Record<string, Syscall>,
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
  mainFn(syscalls)
}

export interface RunOptions extends TransformOptions, RuntimeOptions {}

function reportErrorAsState(e: unknown, ctx: RuntimeContext) {
  const err = e as { message?: string; stack?: string } | undefined
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
    const dispatcher = createDispatcher(ctx, options.extraSyscalls ?? {})

    // 执行（ES module 代码）
    executeCompiled(source, dispatcher)

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
