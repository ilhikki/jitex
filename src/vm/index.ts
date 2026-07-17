// VM 公共 API

import { lex } from '../lexer/lexer'
import { parseProgram } from '../parser/declarations'
import type { ParserInput, ParseResult, ProgramNode } from '../ast/types'
import { StaticAnalyzer } from '../static-analyzer'
import { execute } from './vm'
import { createDefaultSysCalls } from './io.plugin'
import { integerPlugin } from '../types/integer.plugin'
import { booleanPlugin } from '../types/boolean.plugin'
import { stringPlugin } from '../types/string.plugin'
import { charPlugin } from '../types/char.plugin'
import { createArrayPlugin } from '../types/array.plugin'
import { createRecordPlugin } from '../types/record.plugin'
import { createEnumPlugin } from '../types/enum.plugin'
import type { JsonCode } from './jsoncode'
import type { VMState } from './state'
import type { TypePlugin } from '../types'
import type { SysCallHandler } from '../types'

export interface VMRunOptions {
  input?: string[]
  plugins?: TypePlugin[]
  sysCalls?: Map<string, SysCallHandler>
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

  const basePlugins = [integerPlugin, booleanPlugin, stringPlugin, charPlugin]
  const plugins = options.plugins || basePlugins
  const analyzer = new StaticAnalyzer(plugins)
  const jsonCode = analyzer.analyze(ast)

  const typeTable = analyzer.getTypeTable()
  const arrayPlugin = createArrayPlugin(typeTable)
  const recordPlugin = createRecordPlugin(typeTable)
  const enumPlugin = createEnumPlugin(typeTable)
  const allPlugins = [...plugins, arrayPlugin, recordPlugin, enumPlugin]

  const sysCalls = options.sysCalls || createDefaultSysCalls()
  const state = await execute(jsonCode, {
    input: options.input,
    typePlugins: allPlugins,
    sysCalls,
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
