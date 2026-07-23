import { lex } from '@/lexer'
import { parseProgram } from '@/parser'
import type { ParserInput, ProgramNode } from '@/ast/types'
import type { RunError, RunState } from '@/runtime'
import {
  createDefaultIO,
  createExtendedSysCalls,
  createJSCtx,
  createRecordFileOps,
  ctxToRunState,
  type PascalIO,
} from '@/runtime'
import { buildTypeTable } from './type-table-builder'
import type { RuntimeCtx, SysCallHandler, TypeDef } from '@/types'
import { Compiler } from './compiler'
import { STRING_TYPE } from '@/types'

export type { RunState, RunError } from '../runtime/run-state'

/** 非标扩展标识符。内置扩展：'string' */
export type Extension = 'string' | string

/** 调试选项 */
export interface JSDebugOptions {
  /** 在控制台打印生成的 JS 代码 */
  emitJS?: boolean
  /** 将生成的 JS 代码写入指定文件路径 */
  emitJSFile?: string
}

/** runJS 的运行时选项 */
export interface JSRunOptions {
  /** 模拟输入（按行），供 readln/read 使用 */
  input?: string[]
  /** 启用的非标扩展列表 */
  extensions?: Extension[]
  /** 自定义系统调用处理器（覆盖默认实现） */
  sysCalls?: Map<string, SysCallHandler>
  /** 内存文件系统：文件名 → 文件内容 */
  files?: Map<string, Uint8Array>
  /** 程序文件变量名 → files 中的键名（用于 ASSIGN） */
  programFileUrls?: Record<string, string>
  /** 最大执行步数（默认无限制） */
  maxSteps?: number
  /** 调试选项 */
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

function resolveExtensions(extensions: Extension[] = []): {
  extraTypes: TypeDef[]
} {
  const extraTypes: TypeDef[] = []

  for (const ext of extensions) {
    switch (ext) {
      case 'string':
        if (!extraTypes.find((t) => t.id === 'string')) {
          extraTypes.push(STRING_TYPE)
        }
        break
    }
  }

  return { extraTypes }
}

function buildRuntime(
  ast: ProgramNode,
  options: JSRunOptions
): { runtime: RuntimeCtx; sysCalls: Map<string, SysCallHandler> } {
  const { extraTypes } = resolveExtensions(options.extensions)
  const typeTable = buildTypeTable(ast, extraTypes)
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

/**
 * 编译并执行 Pascal 源码。
 *
 * @param source - Pascal 源码字符串
 * @param options - 运行时选项
 * @returns 执行后的状态（包含输出、错误等信息）
 */
export async function runJS(source: string, options: JSRunOptions = {}): Promise<RunState> {
  try {
    const ast = parseSource(source)
    const { runtime, sysCalls } = buildRuntime(ast, options)

    const compiler = new Compiler(runtime.typeTable)
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

/**
 * 将 Pascal 源码编译为 JS 代码字符串（不执行）。
 *
 * @param source - Pascal 源码字符串
 * @param options - 编译选项
 * @returns 生成的 JavaScript 代码
 */
export function compileToJS(source: string, options: JSRunOptions = {}): string {
  const ast = parseSource(source)
  const { runtime } = buildRuntime(ast, options)
  const compiler = new Compiler(runtime.typeTable)
  return compiler.compile(ast)
}
