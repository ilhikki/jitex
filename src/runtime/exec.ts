import type { RuntimeContext, RuntimeOptions, SyscallHandler, SyscallTable } from './runtime-type.ts'
import { createRuntimeContext, createSyscallTable, toRunState } from './runtime.ts'
import type { RunState } from './run-state.ts'

export type CompiledFactory = (syscalls: SyscallTable) => CompiledProgram

export type CompiledProgram = (ctx: RuntimeContext) => void

export type ProgramRunner = (ctx: RuntimeContext) => RunState

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

export async function loadFactory(code: string): Promise<CompiledFactory> {
  const mod = await importModule(code)
  return mod.default as CompiledFactory
}

export function injectSyscalls(
  factory: CompiledFactory,
  extraSyscalls: Record<string, SyscallHandler> = {},
): CompiledProgram {
  return factory(createSyscallTable(extraSyscalls))
}

export function executeProgram(program: CompiledProgram, ctx: RuntimeContext): RunState {
  try {
    program(ctx)
    return toRunState(ctx, 'terminated')
  } catch (e: unknown) {
    return reportErrorAsState(e, ctx)
  }
}

export function createRunnerFromFactory(
  factory: CompiledFactory,
  extraSyscalls: Record<string, SyscallHandler> = {},
): ProgramRunner {
  const program = injectSyscalls(factory, extraSyscalls)
  return (ctx: RuntimeContext) => executeProgram(program, ctx)
}

export async function createRunner(
  code: string,
  extraSyscalls: Record<string, SyscallHandler> = {},
): Promise<ProgramRunner> {
  return createRunnerFromFactory(await loadFactory(code), extraSyscalls)
}

export function toErrorState(e: unknown): RunState {
  return reportErrorAsState(e, createRuntimeContext())
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e))
}

function reportErrorAsState(e: unknown, ctx: RuntimeContext): RunState {
  const error = toError(e)

  ctx.debugLog.push(`[run] error: ${error.message}`)
  return toRunState(ctx, 'error', error)
}

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
