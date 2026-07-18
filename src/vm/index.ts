// VM 公共 API

import { lex } from '../lexer/lexer'
import { parseProgram } from '../parser/declarations'
import type { ParserInput, ParseResult, ProgramNode } from '../ast/types'
import { StaticAnalyzer } from '../static-analyzer'
import { execute } from './vm'
import { createDefaultSysCalls } from './io.plugin'
import { integerPlugin } from '../types/integer.plugin'
import { booleanPlugin } from '../types/boolean.plugin'
import { charPlugin } from '../types/char.plugin'
import { realPlugin } from '../types/real.plugin'
import { createArrayPlugin } from '../types/array.plugin'
import { createRecordPlugin } from '../types/record.plugin'
import { createEnumPlugin } from '../types/enum.plugin'
import { createSubrangePlugin } from '../types/subrange.plugin'
import { createSetPlugin } from '../types/set.plugin'
import { createFilePlugin } from '../types/file.plugin'
import { createRecordFileOps, createDefaultIO, type PascalIO } from './file-model'
import type { JsonCode } from './jsoncode'
import type { VMState } from './state'
import type { TypePlugin } from '../types'
import type { SysCallHandler } from '../types'

export interface VMRunOptions {
  input?: string[]
  plugins?: TypePlugin[]
  sysCalls?: Map<string, SysCallHandler>
  // 内存文件存储：用户提供 Map<url, Uint8Array>，VM 会自动构造 PascalIO
  // 程序执行后 Map 会更新以反映写入结果
  files?: Map<string, Uint8Array>
  // 自定义 IO（与 files 互斥；若同时提供，files 优先）
  io?: PascalIO
  // 全局文件变量名（大写）→ URL；VM 启动时自动 ASSIGN（TANGLE 等 Knuth 风格程序用）
  programFileUrls?: Record<string, string>
  // 最大执行步数，默认 1 亿；大程序（如 TEX82）可设更大
  maxSteps?: number
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

export async function runVM(source: string, options: VMRunOptions = {}): Promise<VMState> {
  const ast = parseSource(source)

  const basePlugins = [integerPlugin, booleanPlugin, charPlugin, realPlugin]
  const extraPlugins = options.plugins || []
  const plugins = [...basePlugins, ...extraPlugins]
  const analyzer = new StaticAnalyzer(plugins)
  const jsonCode = analyzer.analyze(ast)

  const typeTable = analyzer.getTypeTable()
  const arrayPlugin = createArrayPlugin(typeTable)
  const recordPlugin = createRecordPlugin(typeTable)
  const enumPlugin = createEnumPlugin(typeTable)
  const subrangePlugin = createSubrangePlugin(typeTable)
  const setPlugin = createSetPlugin(typeTable)
  const filePlugin = createFilePlugin(typeTable)
  const allPlugins = [...plugins, arrayPlugin, recordPlugin, enumPlugin, subrangePlugin, setPlugin, filePlugin]

  // 构造 PascalIO
  let io: PascalIO | undefined = options.io
  if (options.files) {
    io = {
      file: createRecordFileOps(options.files),
      console: createDefaultIO([]).console,
    }
  }

  const sysCalls = options.sysCalls || createDefaultSysCalls()
  const state = await execute(jsonCode, {
    input: options.input,
    typePlugins: allPlugins,
    sysCalls,
    io,
    programFileUrls: options.programFileUrls,
    maxSteps: options.maxSteps,
  })

  return state
}

export function getOutput(state: VMState): string {
  return state.outputBuffer.join('')
}

export { execute } from './vm'
export { createDefaultSysCalls } from './io.plugin'
export { integerPlugin } from '../types/integer.plugin'
export { booleanPlugin } from '../types/boolean.plugin'
export { StaticAnalyzer } from '../static-analyzer'
export type { JsonCode, JsonInstruction, Ref, TypeDef } from './jsoncode'
export type { VMState, StackFrame, VMError } from './state'
export type { PascalIO, PascalFile, PascalFileOps, PascalConsole } from './file-model'
export { createRecordFileOps, createDefaultIO, createCallbackConsole } from './file-model'
