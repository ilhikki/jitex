/*
 * IL Runtime — 同步 syscall 实现。
 *
 * 决策依据：
 *   - 决策 7：全部同步，无 async/await
 *   - 决策 8：steps.check 在循环回边由 compiler.ts 插入
 *   - 决策 9：RunState 复用 src/runtime/run-state.ts；
 *             file ops 逻辑参考 file-model.ts 但同步化
 *
 * 提供给 transform.ts 生成的 JS 代码调用的 dispatcher：
 *   __sys(key, args) → unknown
 *
 * transform.ts 的 SemanticCompiler 决定哪些 syscall inline（算术/比较），
 * 哪些走 dispatcher（IO/file/cell/mem/set）。本文件实现所有走 dispatcher 的 key。
 */

import type { RunError, RunState } from './run-state.ts'
import type { RuntimeContext, RuntimeOptions, SyscallHandler } from './runtime-type.ts'
import { arithSyscalls } from './sys/arith.ts'
import { basicSyscall } from './sys/pascal-semantic-compiler.ts'
import { convertSyscalls } from './sys/convert.ts'
import { memSyscalls, setSyscalls } from './sys/mem.ts'
import { fileRuntimeSyscalls } from './sys/file-runtime.ts'

export function createRuntimeContext(options: RuntimeOptions = {}): RuntimeContext {
  return {
    files: options?.files ?? new Map(),
    steps: 0,
    maxSteps: options.maxSteps ?? Infinity,
    programFileUrls: options.programFileUrls ?? {},
    extensions: new Set(options.extensions ?? []),
    debugLog: [],
    jsCode: undefined,
  }
}

export function toRunState(
  ctx: RuntimeContext,
  status: 'running' | 'terminated' | 'error' = 'terminated',
  error?: RunError | null,
): RunState {
  return {
    status,
    steps: ctx.steps,
    error: error ?? null,
    jsCode: ctx.jsCode,
    files: ctx.files,
    debugLog: ctx.debugLog,
  }
}

// ============================================================
// dispatch — 所有走 dispatcher 的 syscall
// ============================================================

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

export function createDispatcher(
  extraSyscalls: Record<string, SyscallHandler>,
): (ctx: RuntimeContext, key: string, args: unknown[]) => unknown {
  const syscalls = { ...getDefaultSyscalls() }
  for (const [key, fn] of Object.entries(extraSyscalls)) {
    if (fn) {
      syscalls[key] = fn
    }
  }
  return (ctx, key, args) => {
    const fn = syscalls[key]
    if (fn) {
      return fn(ctx, args)
    }
    throw new Error(`Unknown syscall: ${key}`)
  }
}
