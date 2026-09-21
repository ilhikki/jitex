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
  /**
   * debug 构建（默认 true）。
   *
   * true 时 rewrite 产出 `runtime.debug.*` 系列检查：子界边界、循环步数、
   * 除零、字节视图断言。false 时这些 key 根本不生成，运行期零开销。
   *
   * 注意：非 debug 构建下，ISO 7185 定为 error 的情形（6.7.2.2 除数为 0 /
   * 负数、6.4.2.4 子界越界）不再被捕获，行为由宿主实现决定。
   */
  debug: boolean
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

export function transform(source: string, options: TransformOptions = { debug: false }): string {
  const ast = parseSource(source)

  // debug 构建开关：lowering（决定是否生成独立检查语句）与 rewrite（决定检查的
  // 具体形态）都需要它，故在两层之前先算出
  const debug = options.debug ?? true
  const analysis = analyzeProgram(ast, options.extraCallables, debug)

  const jsonCode = loweringProgram(ast, analysis)

  // IR 重写：合并内部 pascal 表、注入 callable 的自动表与用户表（后者覆盖前者），
  // 合成单一映射后执行后序 DFS 替换
  const table = mergeRewriteTables(
    mergeRewriteTables(buildPascalRewriteTable(debug), buildExtraCallableRewriters(options.extraCallables)),
    options.syscallRewriters,
  )
  const ir = rewrite(jsonCode, composeMapping(table, options.defaultRewriter))

  const semantic = new PascalSemanticCompiler()
  const { code: jsBody, mainName } = toJs(ir, {
    semantic,
    debugNames: analysis.debugNames(),
    debug: options.debug === true,
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
  const createRun = factory() as (syscalls: Record<string, Syscall>) => () => void

  // 产物顶层是工厂：注入 __sys 后返回执行体，调用它才真正开始执行。
  // 契约：工厂调用后 __sys 字典须保持稳定（解包只发生在工厂里）。
  const run = createRun(syscalls)
  run()
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

export function run(source: string, options: RunOptions = { debug: false }): RunState {
  let jsCode
  try {
    jsCode = transform(source, {
      extraCallables: options.extraCallables,
      debug: options.debug,
    })
  } catch (e: unknown) {
    const ctx = getRunTimeContextFromOptions(options)
    return reportErrorAsState(e, ctx)
  }
  return runJs(jsCode, options)
}
