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

export function createSyscallTable(
  extraSyscalls: Record<string, SyscallHandler> = {},
): SyscallTable {
  return { ...getDefaultSyscalls(), ...extraSyscalls }
}
