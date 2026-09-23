/*
 * 执行层：把编译产物（ESM 源码）加载为工厂并执行。
 *
 * 编译产物由 @jitex/pascal-to-js 的 transform 产出，顶层是工厂：
 *   export default function main(__sys) { ... return __run }
 *
 * 加载走模块 import（浏览器用 Blob URL，其余环境用 data: URL），不使用 new Function：
 * 产物本身就是合法 ESM，且顶层只声明工厂、无副作用。
 */

import type { RuntimeContext, RuntimeOptions, Syscall } from './runtime-type.ts'
import { createDispatcher, createRuntimeContext, toRunState } from './runtime.ts'
import type { RunError, RunState } from './run-state.ts'

/** 编译产物顶层的工厂：注入 __sys 后返回执行体，调用执行体才真正开始执行 */
export type CompiledFactory = (syscalls: Record<string, Syscall>) => () => void

/**
 * 加载通道：
 *   - 浏览器（存在 document）：Blob URL —— 大产物比 data: URL 更稳；
 *   - 其余环境（Deno / Node）：data: URL —— 无需文件写权限。
 */
async function importModule(code: string): Promise<{ default: unknown }> {
  const isBrowser = (globalThis as { document?: unknown }).document !== undefined
  if (isBrowser) {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    try {
      return await import(url) as { default: unknown }
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  return await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(code)) as { default: unknown }
}

/** 把编译产物源码加载为工厂函数 */
export async function loadFactory(code: string): Promise<CompiledFactory> {
  const mod = await importModule(code)
  return mod.default as CompiledFactory
}

/**
 * 由调用方在编译阶段捕获异常时构造错误 RunState（格式与 runJs 内部一致）。
 *
 * 编译（@jitex/pascal-to-js 的 transform）与执行分属两个包：编译抛出的异常发生在
 * 调用方，用本函数转成统一的 RunState。
 */
export function toErrorState(e: unknown): RunState {
  return reportErrorAsState(e, createRuntimeContext())
}

function reportErrorAsState(e: unknown, ctx: RuntimeContext): RunState {
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

/**
 * 执行编译产物。
 *
 * @param code - transform 产出的 ESM 源码
 * @param options - 运行期选项（文件系统、maxSteps、额外 syscall）
 */
export async function runJs(code: string, options: RuntimeOptions = {}): Promise<RunState> {
  const ctx = createRuntimeContext({
    files: options.files,
    programFileUrls: options.programFileUrls,
    maxSteps: options.maxSteps,
  })
  try {
    ctx.jsCode = code
    // __sys dispatcher
    const dispatcher = createDispatcher(ctx, options.extraSyscalls ?? {})

    const factory = await loadFactory(code)
    const run = factory(dispatcher)
    run()

    return toRunState(ctx, 'terminated')
  } catch (e: unknown) {
    return reportErrorAsState(e, ctx)
  }
}
