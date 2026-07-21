// M5 JS 编译器：从 AST 编译为 JS 代码字符串，new AsyncFunction 执行
//
// 本文件是 JS 编译器的对外入口，导出：
// - runJS(source, options): 编译并执行 Pascal 程序，返回 RunState
// - compileToJS(source): 仅编译，返回 JS 代码字符串
// - 类型：RunState, RunError, JSRunOptions, JSDebugOptions
//
// 核心思想：
// - integer/real/boolean 用 JS 裸值（无 PascalValue 装箱），V8 JIT 可优化
// - array/record/set/file 保持 PascalValue，通过 ctx.sysCall/plugin 桥接
// - 异步操作（WRITELN/READ/file）用 async/await 原生处理
// - 默认加载标准 plugins（integer/boolean/char/real/array/record/enum/subrange/set/file）
// - string 是非标扩展，需用户注入 stringPlugin
//
// 编译策略和架构见同目录 compiler.ts；
// TypePlugin 系统见 types/types.ts 和 types/*.plugin.ts；
// 项目顶层入口见 ../../AGENTS.md。

import { parse } from '../index'
import type { ProgramNode } from '../ast/types'
import { createJSCtx, ctxToRunState } from './context'
import { buildTypeTable } from './type-table-builder'
import { integerPlugin } from './types/integer.plugin'
import { booleanPlugin } from './types/boolean.plugin'
import { charPlugin } from './types/char.plugin'
import { realPlugin } from './types/real.plugin'
import { createArrayPlugin } from './types/array.plugin'
import { createRecordPlugin } from './types/record.plugin'
import { createEnumPlugin } from './types/enum.plugin'
import { createSubrangePlugin } from './types/subrange.plugin'
import { createSetPlugin } from './types/set.plugin'
import { createFilePlugin, TEXT_TYPE } from './types/file.plugin'
import { createExtendedSysCalls } from './syscalls'
import { createDefaultIO, createRecordFileOps, type PascalIO } from './file-model'
import type { RuntimeCtx, SysCallHandler, TypePlugin, TypeDef } from './types'
import type { RunState, RunError } from './run-state'
import { Compiler } from './compiler'

export type { RunState, RunError } from './run-state'

// ============================================================================
// 公开 API
// ============================================================================

export interface JSDebugOptions {
  // 打印生成的 JS 代码到控制台
  emitJS?: boolean
  // 输出 JS 代码到文件（仅用于调试）
  emitJSFile?: string
  // 打印 label 静态分析结果
  labelAnalysis?: boolean
}

export interface JSRunOptions {
  input?: string[]
  plugins?: TypePlugin[]
  sysCalls?: Map<string, SysCallHandler>
  // 内存文件存储：用户提供 Map<url, Uint8Array>，runJS 会自动构造 PascalIO
  // 程序执行后 Map 会更新以反映写入结果
  files?: Map<string, Uint8Array>
  // 全局文件变量名（大写）→ URL；程序启动时自动 ASSIGN（TANGLE 等 Knuth 风格程序用）
  programFileUrls?: Record<string, string>
  maxSteps?: number
  // 非标扩展：允许无 LABEL 声明的 goto（Berkeley/DEC Pascal 扩展）
  allowUndeclaredLabels?: boolean
  // 调试选项
  debug?: JSDebugOptions
}

function parseSource(source: string): ProgramNode {
  const result = parse(source)
  if (!result.success) {
    throw new Error(`Parse error: ${(result as any).error}`)
  }
  return (result as any).astNode as ProgramNode
}

// 构造 runtime
function buildRuntime(
  ast: ProgramNode,
  options: JSRunOptions
): { runtime: RuntimeCtx; sysCalls: Map<string, SysCallHandler> } {
  const fileTypePlugin: TypePlugin = {
    name: 'file-types',
    version: '1.0.0',
    types: [TEXT_TYPE as TypeDef],
    ops: {},
  }
  const basePlugins: TypePlugin[] = [
    integerPlugin,
    booleanPlugin,
    charPlugin,
    realPlugin,
    fileTypePlugin,
    ...(options.plugins || []),
  ]
  const typeTable = buildTypeTable(ast, basePlugins)
  const arrayPlugin = createArrayPlugin(typeTable)
  const recordPlugin = createRecordPlugin(typeTable)
  const enumPlugin = createEnumPlugin(typeTable)
  const subrangePlugin = createSubrangePlugin(typeTable)
  const setPlugin = createSetPlugin(typeTable)
  const filePlugin = createFilePlugin(typeTable)
  const allPlugins = [
    ...basePlugins,
    arrayPlugin,
    recordPlugin,
    enumPlugin,
    subrangePlugin,
    setPlugin,
    filePlugin,
  ]
  const sysCalls = options.sysCalls || createExtendedSysCalls()
  let io: PascalIO | undefined
  if (options.files) {
    io = {
      file: createRecordFileOps(options.files),
      console: createDefaultIO([]).console,
    }
  }
  const runtime: RuntimeCtx = {
    typeTable,
    sysCalls,
    io,
  }
  ;(runtime as any).plugins = allPlugins
  return { runtime, sysCalls }
}

const AsyncFunction = Object.getPrototypeOf(async function () {
  /* */
}).constructor

/**
 * 编译并执行 Pascal 程序，返回执行结果。
 *
 * 默认行为符合 ISO Pascal 1983 标准。
 * 非标特性（如 string 类型）需通过 options.plugins 注入。
 *
 * @param source - Pascal 源码字符串
 * @param options - 运行选项（plugins/sysCalls/files/maxSteps/debug 等）
 * @returns RunState - 执行状态（terminated/error + outputBuffer + error）
 *
 * @example
 * ```ts
 * import { runJS } from 'pascal-ts'
 * const state = await runJS(`
 *   program hello;
 *   begin writeln('Hello, Pascal!'); end.
 * `)
 * console.log(state.status, state.outputBuffer.join(''))
 * ```
 *
 * @example 注入非标 string 插件
 * ```ts
 * import { runJS, stringPlugin } from 'pascal-ts'
 * const state = await runJS(code, { plugins: [stringPlugin] })
 * ```
 */
export async function runJS(source: string, options: JSRunOptions = {}): Promise<RunState> {
  try {
    const ast = parseSource(source)
    const { runtime, sysCalls } = buildRuntime(ast, options)

    // 编译
    const compiler = new Compiler(runtime.typeTable, {
      allowUndeclaredLabels: options.allowUndeclaredLabels,
    })
    const body = compiler.compile(ast, options.programFileUrls)

    // 调试输出
    if (options.debug?.emitJS) {
      console.log('\n===== Generated JS =====')
      console.log(body)
      console.log('========================\n')
    }
    if (options.debug?.emitJSFile) {
      const fs = await import('fs')
      await fs.promises.writeFile(options.debug.emitJSFile, body, 'utf-8')
    }

    // 构造 ctx
    const ctx = createJSCtx({
      sysCalls,
      runtime,
      input: options.input,
      maxSteps: options.maxSteps,
    })

    // 执行
    const fn = new AsyncFunction('ctx', body)
    try {
      await fn(ctx)
      return ctxToRunState(ctx, 'terminated')
    } catch (e: any) {
      const state = ctxToRunState(ctx, 'error')
      state.error = {
        message: e?.message || String(e),
        stackTrace: [],
      }
      return state
    }
  } catch (e: any) {
    // parse / compile 阶段异常也包装为 error 状态
    return {
      status: 'error',
      outputBuffer: [],
      inputQueue: [],
      steps: 0,
      error: { message: e?.message || String(e), stackTrace: [] },
    }
  }
}

/**
 * 仅编译 Pascal 源码为 JS 代码字符串，不执行。
 *
 * 默认加载与 runJS 一致的标准 plugins，确保编译结果与实际执行一致。
 *
 * @param source - Pascal 源码字符串
 * @returns string - 编译生成的 JS 代码字符串
 *
 * @example
 * ```ts
 * import { compileToJS } from 'pascal-ts'
 * const js = compileToJS(`
 *   program hello;
 *   begin writeln(42); end.
 * `)
 * console.log(js)
 * ```
 */
export function compileToJS(source: string): string {
  const ast = parseSource(source)
  const { runtime } = buildRuntime(ast, {})
  const compiler = new Compiler(runtime.typeTable)
  return compiler.compile(ast)
}
