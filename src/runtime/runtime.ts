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
