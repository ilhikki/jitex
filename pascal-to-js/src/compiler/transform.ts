/*
 * IL Transform — 入口：Pascal 源码 → JS 代码字符串。
 *
 * 依赖关系（见 decide.md）：
 *   transform → compiler → analysis
 *   transform → json-code-compiler
 *   transform → runtime（执行时）
 *
 * 职责：
 *   1. parse：Pascal 源码 → AST
 *   2. analyze：AST → Analysis
 *   3. compile：AST + Analysis → JsonCode
 *   4. 后处理 JsonCode：插入 programFileUrls 的 file.assign
 *   5. toJs：JsonCode → JS 代码字符串（通过 SemanticCompiler 实现）
 *   6. 包装：返回 ES module 代码（export）
 *
 * SemanticCompiler 实现（决策 6）：
 *   - literalToJs：i64/f64/str/char/bool → JS 字面量
 *   - syscallToJs：算术/比较/逻辑/转换 inline，IO/file/cell/mem/set 走 __sys dispatcher
 */

import { lex } from '../lexer/lexer.ts'
import { parseProgram } from '../parser/declarations.ts'
import type { ParserInput, ProgramNode } from '../ast/types.ts'
import { type Analysis, analyzeProgram, type VarSymbol } from './analysis.ts'
import { compileProgram } from './compiler.ts'
import { toJs } from './json-code-compiler.ts'
import * as JsonCode from './json-code.ts'
import type { RunError, RunState } from '@/runtime/run-state.ts'
import { createDispatcher, createRuntimeContext, toRunState } from '@/runtime/runtime.ts'
import type { RuntimeContext, RuntimeOptions } from '@/runtime/runtime-type.ts'
import type { IlPlugin } from './plugin.ts'
import { PascalSemanticCompiler } from '@/runtime/sys/pascal-semantic-compiler.ts'

// ============================================================
// TransformOptions
// ============================================================

export interface TransformOptions {
  /** 程序文件变量名 → files 中的键名（用于 ASSIGN）。
   * 缺省时按恒等映射处理：程序文件参数名即 files 键名（key === value）。 */
  programFileUrls?: Record<string, string>
  /** 非标特性扩展（传递给 analysis 做语义检查） */
  extensions?: string[]
  /** 非标特性插件（AGENTS.md 原则 A.7：注入优先） */
  plugins?: IlPlugin[]
}

// ============================================================
// parseSource：Pascal 源码 → AST
// ============================================================

function parseSource(source: string): ProgramNode {
  const tokens = lex(source)
  const input: ParserInput = { tokens, position: 0 }
  const result = parseProgram(input)
  if (!result.success) {
    throw new Error(`Parse error: ${result.error}`)
  }
  return result.astNode as ProgramNode
}

// ============================================================
// applyProgramFileUrls：在变量初始化之后插入 file.assign
// ============================================================

function applyProgramFileUrls(
  fn: JsonCode.Function,
  a: Analysis,
  programFileUrls: Record<string, string> | undefined,
  programParams: ProgramNode['parameters'],
): JsonCode.Function {
  // programFileUrls 缺省时使用恒等映射（key === value）：
  // 程序文件参数名直接作为 files 键名（如 WEBFILE → 'WEBFILE'），
  // 调用方只需把文件放入 files 即可（boot-tangle 正是此用法）。
  const mapping = programFileUrls ??
    Object.fromEntries(programParams.map((p) => [p.name, p.name]))
  if (Object.keys(mapping).length === 0) {
    return fn
  }

  const preamble: JsonCode.Statement[] = []
  for (const [varName, url] of Object.entries(mapping)) {
    const sym = a.globalSymbolOf(varName)
    if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
      const varSym = sym as VarSymbol
      preamble.push({
        kind: 'eval',
        expr: {
          kind: 'syscall',
          key: 'file.assign',
          args: [
            { kind: 'ref', varId: varSym.varId },
            { kind: 'literal', key: 'str', arg: url },
          ],
        },
      })
    }
  }

  if (preamble.length === 0) {
    return fn
  }

  // bug 22 修复：file.assign 必须在变量初始化之后执行，
  // 否则文件变量还未被 mem.default/file.create 初始化（为 undefined），
  // 导致 args[0].url = ... 报 "Cannot set properties of undefined"。
  // 使用 compileBlock 记录的 initCount，而非 info.locals.length，
  // 因为编译阶段 allocTempLocal 会向 info.locals 追加 cell 临时变量。
  const initCount = fn.initCount ?? 0

  return {
    ...fn,
    body: [...fn.body.slice(0, initCount), ...preamble, ...fn.body.slice(initCount)],
  }
}

/**
 * 将 Pascal 源码编译为 ES module JS 代码字符串。
 *
 * 输出格式（ES module，非 CommonJS）：
 *   function v1_main(__sys) { ... }
 *   export { v1_main };
 *
 * 变量/函数名携带可读名（v{id}_{name}），便于调试。
 * __sys 作为顶层函数参数，由 executeCompiled 或 import 后调用时注入。
 */
export function transform(source: string, options: TransformOptions = {}): string {
  // 1. parse
  const ast = parseSource(source)

  // 2. analyze（传递 extensions 和 plugins）
  const analysis = analyzeProgram(ast, options.extensions, options.plugins)

  // 3. compile
  let jsonCode = compileProgram(ast, analysis)

  // 4. 后处理：插入 programFileUrls 的 file.assign
  jsonCode = applyProgramFileUrls(jsonCode, analysis, options.programFileUrls, ast.parameters)

  // 5. toJs（始终携带可读变量名）
  const semantic = new PascalSemanticCompiler()
  const { code: jsBody, mainName } = toJs(jsonCode, {
    semantic,
    debugNames: analysis.debugNames(),
  })

  // 6. 包装为 ES module
  return `${jsBody}\nexport { ${mainName} };`
}

// ============================================================
// executeCompiled：执行 transform 生成的 ES module 代码
// ============================================================

/**
 * 执行 transform() 生成的 ES module 代码。
 *
 * 生成的代码格式：
 *   function v1_main(__sys) { ... }
 *   export { v1_main };
 *
 * 执行方式：移除 export 语句，用 new Function 创建并调用顶层函数。
 * __sys dispatcher 作为参数传入。
 */
export function executeCompiled(
  code: string,
  __sys: (key: string, args: unknown[]) => unknown,
): void {
  // 提取导出的函数名
  const exportMatch = code.match(/export\s*\{\s*(\w+)\s*\}/)
  if (!exportMatch) {
    throw new Error('executeCompiled: no export found in code')
  }
  const mainName = exportMatch[1]

  // 移除 export 语句，添加 return
  const execCode = code.replace(/export\s*\{[^}]+\};?\s*$/, `return ${mainName};`)
  const factory = new Function(execCode)
  const mainFn = factory()
  mainFn(__sys)
}

// ============================================================
// transformAndRun：Pascal 源码 → 执行 → RunState
// ============================================================

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
    input: options.input,
    files: options.files,
    programFileUrls: options.programFileUrls,
    maxSteps: options.maxSteps,
    extensions: options.extensions,
    plugins: options.plugins,
    debugLog: options.debugLog ?? [],
  })
  return ctx
}

export function runJs(source: string, options: RuntimeOptions): RunState {
  const ctx = getRunTimeContextFromOptions(options)
  try {
    ctx.jsCode = source
    // __sys dispatcher
    const dispatcher = createDispatcher(options.plugins ?? [])
    const __sys = (key: string, args: unknown[]): unknown => dispatcher(ctx, key, args)

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
      programFileUrls: options.programFileUrls,
      extensions: options.extensions,
      plugins: options.plugins,
    })
  } catch (e: unknown) {
    const ctx = getRunTimeContextFromOptions(options)
    return reportErrorAsState(e, ctx)
  }

  return runJs(jsCode, options)
}
