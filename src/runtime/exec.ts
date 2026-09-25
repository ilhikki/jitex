/*
 * 执行层：装载编译产物 → 注入 syscall 表 → 以 ctx 执行。
 *
 * 编译产物由 @jitex/pascal-to-js 的 transform 产出，顶层是柯里化的工厂：
 *   export default function main(__sys) { ... return function __run(__ctx) { ... } }
 *
 * 生成代码的柯里化形状与本文件的三段式一一对应，三段各自一条生命周期：
 *
 *   阶段 1 装载（loadFactory）   code        → 工厂       生命周期 = 程序本身
 *   阶段 2 注入（injectSyscalls）工厂        → 执行体     生命周期 = 配置（code + syscall 表）
 *   阶段 3 执行（executeProgram）执行体 + ctx → RunState    生命周期 = 单次运行
 *
 * 分段的依据是「键的构成」：装载只取决于 code；注入只取决于 code 与 syscall 表；
 * 只有执行依赖 files / maxSteps 等本次运行的环境与状态（全部收在 ctx 里）。
 * 因此前两段的产物可被调用方持有并复用（同一份产物以不同 ctx 跑多次），
 * runJs 只是三段的组合。
 *
 * 加载走模块 import（浏览器用 Blob URL，其余环境用 data: URL），不使用 new Function：
 * 产物本身就是合法 ESM，且顶层只声明工厂、无副作用。
 */

import type { RuntimeContext, RuntimeOptions, SyscallHandler, SyscallTable } from './runtime-type.ts'
import { createRuntimeContext, createSyscallTable, toRunState } from './runtime.ts'
import type { RunError, RunState } from './run-state.ts'

/** 编译产物顶层的工厂：注入 __sys 后返回执行体 */
export type CompiledFactory = (syscalls: SyscallTable) => CompiledProgram

/**
 * 注入 syscall 表后的执行体：调用时传入本次运行的 ctx。
 *
 * 可重复调用——locals / 子函数 / 状态机标志都声明在生成代码的内层作用域里，
 * 每次调用都从干净状态开始，`__sys` 解包在更外层（与 ctx 无关），故同一执行体
 * 可安全地喂不同的 ctx 反复运行。
 */
export type CompiledProgram = (ctx: RuntimeContext) => void

/** 可复用的执行器：装载一次，以不同 ctx 跑多次 */
export type ProgramRunner = (ctx: RuntimeContext) => RunState

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

/** 阶段 1：把编译产物源码加载为工厂 */
export async function loadFactory(code: string): Promise<CompiledFactory> {
  const mod = await importModule(code)
  return mod.default as CompiledFactory
}

/**
 * 阶段 2：合成 syscall 表并注入工厂，得到与运行无关的执行体。
 *
 * 表内 handler 保持 `(ctx, ...args)` 形参、**不绑定 ctx**（见 runtime 的
 * createSyscallTable），ctx 由生成代码在调用点透传，因此这一段的产物可复用。
 */
export function injectSyscalls(
  factory: CompiledFactory,
  extraSyscalls: Record<string, SyscallHandler> = {},
): CompiledProgram {
  return factory(createSyscallTable(extraSyscalls))
}

/**
 * 阶段 3：注入 ctx 执行一次。
 *
 * 运行期异常在此转成 error 状态：此时有 ctx 可归属，错误信息与已产生的输出
 * （debugLog）都能保留。
 */
export function executeProgram(program: CompiledProgram, ctx: RuntimeContext): RunState {
  try {
    program(ctx)
    return toRunState(ctx, 'terminated')
  } catch (e: unknown) {
    return reportErrorAsState(e, ctx)
  }
}

/**
 * 阶段 2 + 3：由一个**已就绪的工厂**构造可复用执行器。
 *
 * 用于产物已被当作普通 ESM 模块装载的场合（构建期就拿到 factory，无需把源码
 * 当字符串再 import 一次）——浏览器/Worker 走这条，避开 data: URL 与 Blob URL。
 */
export function createRunnerFromFactory(
  factory: CompiledFactory,
  extraSyscalls: Record<string, SyscallHandler> = {},
): ProgramRunner {
  const program = injectSyscalls(factory, extraSyscalls)
  return (ctx: RuntimeContext) => executeProgram(program, ctx)
}

/**
 * 装载 + 注入：得到一个「(ctx) => RunState」的执行器，可对同一份产物反复运行。
 *
 * 只吃 code 与 extraSyscalls——files / maxSteps / programFileUrls 属于单次运行，
 * 随 ctx 在调用时给出。装载失败（动态 import 出错）会抛出：此时还没有任何运行
 * 上下文可归属；需要统一成 RunState 的调用方用 runJs。
 */
export async function createRunner(
  code: string,
  extraSyscalls: Record<string, SyscallHandler> = {},
): Promise<ProgramRunner> {
  return createRunnerFromFactory(await loadFactory(code), extraSyscalls)
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
 * 一次性执行：建 ctx → 装载 → 注入 → 执行（三段的组合）。
 *
 * ctx 先于装载建立，故装载失败也能把诊断信息写进 ctx.debugLog；
 * 执行期的失败已由 executeProgram 转成 error 状态，不会走到外层 catch。
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
    const run = await createRunner(code, options.extraSyscalls ?? {})
    return run(ctx)
  } catch (e: unknown) {
    return reportErrorAsState(e, ctx)
  }
}
