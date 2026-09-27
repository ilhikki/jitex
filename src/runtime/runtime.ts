/*
 * IL Runtime — 同步 syscall 实现。
 *
 * 决策依据：
 *   - 决策 7：全部同步，无 async/await
 *   - 决策 8：steps.check 在循环回边由 compiler.ts 插入
 *   - 决策 9：RunState 复用 src/runtime/run-state.ts；
 *             file ops 逻辑参考 file-model.ts 但同步化
 *
 * 提供给 transform.ts 生成的 JS 代码调用的 syscall 表 `__sys`：
 *   __sys[key](ctx, ...args) → unknown
 *
 * handler 形参里的 ctx 由生成代码在调用点透传（生成产物柯里化为
 * `main(__sys)(ctx)`），**不在构造期 bind**：表因此与「某一次运行」无关，
 * 可跨运行复用（见 exec.ts 的三段式）。
 *
 * transform.ts 的 SemanticCompiler 决定哪些 syscall inline（算术/比较），
 * 哪些走 `__sys`（IO/file/cell/mem/set）。本文件实现所有走 `__sys` 的 key。
 */

import type { RunState } from './run-state.ts'
import type { RuntimeContext, RuntimeOptions, SyscallHandler, SyscallTable } from './runtime-type.ts'
import { arithSyscalls } from './sys/arith.ts'
import { basicSyscall } from './basic.ts'
import { convertSyscalls } from './sys/convert.ts'
import { memSyscalls, setSyscalls } from './sys/mem.ts'
import { fileRuntimeSyscalls } from './sys/file-runtime.ts'

export function createRuntimeContext(options: RuntimeOptions = {}): RuntimeContext {
  return {
    files: options?.files ?? new Map(),
    steps: 0,
    maxSteps: options.maxSteps ?? Infinity,
    programFileUrls: options.programFileUrls ?? {},
    debugLog: [],
  }
}

export function toRunState(
  ctx: RuntimeContext,
  status: 'running' | 'terminated' | 'error' = 'terminated',
  error?: Error | undefined,
): RunState {
  return {
    status,
    steps: ctx.steps,
    error: error ?? undefined,
    files: ctx.files,
    debugLog: ctx.debugLog,
  }
}

// syscall 表

function getDefaultSyscalls(): Record<string, SyscallHandler> {
  return {
    ...basicSyscall(),
    ...arithSyscalls(),
    ...setSyscalls(),
    ...convertSyscalls(),
    ...memSyscalls(),
    ...fileRuntimeSyscalls(),
  }
}

/**
 * 合成 `__sys` 表：默认实现 + 使用方覆盖（同 key 后者胜）。
 *
 * 只做合并，不做绑定：表内每个 handler 仍需在调用点接收 ctx。
 * 表的身份只取决于默认实现与 extraSyscalls，与单次运行无关。
 */
export function createSyscallTable(
  extraSyscalls: Record<string, SyscallHandler> = {},
): SyscallTable {
  return { ...getDefaultSyscalls(), ...extraSyscalls }
}
