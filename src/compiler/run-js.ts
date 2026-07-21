import { lex } from '../lexer/lexer'
import { parseProgram } from '../parser/declarations'
import type { ProgramNode, ParserInput } from '../ast/types'
import { createJSCtx, ctxToRunState } from '../runtime/context'
import { buildTypeTable } from './type-table-builder'
import { createExtendedSysCalls } from '../runtime/syscalls'
import { createDefaultIO, createRecordFileOps, type PascalIO } from '../runtime/file-model'
import type { RuntimeCtx, SysCallHandler, TypeDef } from '../types/types'
import type { RunState, RunError } from '../runtime/run-state'
import { Compiler } from './compiler'

export type { RunState, RunError } from '../runtime/run-state'

export interface JSDebugOptions {
  emitJS?: boolean
  emitJSFile?: string
  labelAnalysis?: boolean
}

export interface JSRunOptions {
  input?: string[]
  extraTypes?: TypeDef[]
  sysCalls?: Map<string, SysCallHandler>
  files?: Map<string, Uint8Array>
  programFileUrls?: Record<string, string>
  maxSteps?: number
  allowUndeclaredLabels?: boolean
  debug?: JSDebugOptions
}

function parseSource(source: string): ProgramNode {
  const tokens = lex(source)
  const input: ParserInput = { tokens, position: 0 }
  const result = parseProgram(input)
  if (!result.success) {
    throw new Error(`Parse error: ${(result as any).error}`)
  }
  return (result as any).astNode as ProgramNode
}

function buildRuntime(
  ast: ProgramNode,
  options: JSRunOptions
): { runtime: RuntimeCtx; sysCalls: Map<string, SysCallHandler> } {
  const typeTable = buildTypeTable(ast, options.extraTypes)
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
  return { runtime, sysCalls }
}

const AsyncFunction = Object.getPrototypeOf(async function () {
  /* */
}).constructor

export async function runJS(source: string, options: JSRunOptions = {}): Promise<RunState> {
  try {
    const ast = parseSource(source)
    const { runtime, sysCalls } = buildRuntime(ast, options)

    const compiler = new Compiler(runtime.typeTable, {
      allowUndeclaredLabels: options.allowUndeclaredLabels,
    })
    const body = compiler.compile(ast, options.programFileUrls)

    if (options.debug?.emitJS) {
      console.log('\n===== Generated JS =====')
      console.log(body)
      console.log('========================\n')
    }
    if (options.debug?.emitJSFile) {
      const fs = await import('fs')
      await fs.promises.writeFile(options.debug.emitJSFile, body, 'utf-8')
    }

    const ctx = createJSCtx({
      sysCalls,
      runtime,
      input: options.input,
      maxSteps: options.maxSteps,
    })

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
    return {
      status: 'error',
      outputBuffer: [],
      inputQueue: [],
      steps: 0,
      error: { message: e?.message || String(e), stackTrace: [] },
    }
  }
}

export function compileToJS(source: string): string {
  const ast = parseSource(source)
  const { runtime } = buildRuntime(ast, {})
  const compiler = new Compiler(runtime.typeTable)
  return compiler.compile(ast)
}