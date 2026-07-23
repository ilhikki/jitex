import type { PascalValue, RuntimeCtx, SysCallHandler } from '@/types'
import type { RunState } from './run-state'
import { createEmptyFile, type PascalIO } from './file-model'

export interface JSCtx {
  sysCall: (name: string, args: any[]) => Promise<any>
  box: (typeId: string, raw: unknown) => PascalValue
  defaultOf: (typeId: string) => PascalValue
  checkArrayIndex: (idx: number, low: number, high: number) => number
  formatReal: (n: number) => string
  steps: number
  maxSteps: number
  outputBuffer: string[]
  inputQueue: string[]
  io?: PascalIO
}

export interface JSRuntimeOptions {
  sysCalls: Map<string, SysCallHandler>
  runtime: RuntimeCtx
  input?: string[]
  maxSteps?: number
}

function createMockState(outputBuffer: string[], inputQueue: string[]): RunState {
  return {
    outputBuffer,
    inputQueue,
    error: null,
    status: 'running',
    steps: 0,
  }
}

function formatReal(n: number): string {
  if (Number.isInteger(n)) {
    return `${n}.00000000000000E+000`
  }
  const s = n.toExponential(14)
  const eIdx = s.indexOf('e')
  if (eIdx < 0) return s
  const mantissa = s.slice(0, eIdx)
  let exp = s.slice(eIdx + 1)
  const sign = exp[0]
  const digits = exp.slice(1)
  const padded = digits.padStart(3, '0')
  return `${mantissa}E${sign}${padded}`
}

function buildDefaultValue(typeId: string, typeTable: any): unknown {
  const td = typeTable.get(typeId) as any
  if (!td) return 0
  switch (td.kind) {
    case 'integer':
      return 0
    case 'real':
      return 0.0
    case 'boolean':
      return false
    case 'char':
      return '\x00'
    case 'string':
      return ''
    case 'text':
      return null
    case 'subrange':
      return 0
    case 'enum':
      return 0
    case 'array': {
      const dims = td.dimensions
      const elemTypeId = td.elementTypeId
      const build = (dimIdx: number): unknown => {
        if (dimIdx >= dims.length) {
          return buildDefaultValue(elemTypeId, typeTable)
        }
        const dim = dims[dimIdx]
        const arr: unknown[] = []
        for (let i = dim.low; i <= dim.high; i++) {
          arr[i] = build(dimIdx + 1)
        }
        return arr
      }
      return build(0)
    }
    case 'record': {
      const obj: Record<string, unknown> = {}
      for (const f of td.fields) {
        obj[f.name] = buildDefaultValue(f.typeId, typeTable)
      }
      return obj
    }
    case 'set':
      return new Set<number>()
    case 'file':
      return createEmptyFile()
    default:
      return 0
  }
}

export function createJSCtx(options: JSRuntimeOptions): JSCtx {
  const outputBuffer: string[] = []
  const inputQueue: string[] = options.input ? [...options.input] : []
  const mockState = createMockState(outputBuffer, inputQueue)
  const runtime = options.runtime
  const sysCalls = options.sysCalls
  const typeTable = runtime.typeTable

  return {
    sysCall: (name: string, args: any[]) => {
      const handler = sysCalls.get(name)
      if (!handler) {
        throw new Error(`JS: unknown syscall ${name}`)
      }
      return Promise.resolve(handler(args, mockState, runtime))
    },
    box: (typeId: string, raw: unknown): PascalValue => ({ typeId, raw }),
    defaultOf: (typeId: string): PascalValue => {
      return { typeId, raw: buildDefaultValue(typeId, typeTable) }
    },
    checkArrayIndex: (idx: number, low: number, high: number): number => {
      if (idx < low || idx > high) {
        throw new Error(`JS VM: array index ${idx} out of range ${low}..${high}`)
      }
      return idx
    },
    formatReal,
    steps: 0,
    maxSteps: options.maxSteps ?? Infinity,
    outputBuffer,
    inputQueue,
    io: runtime.io as PascalIO | undefined,
  }
}

export function ctxToRunState(
  ctx: JSCtx,
  status: 'running' | 'terminated' | 'error' = 'terminated'
): RunState {
  return {
    outputBuffer: ctx.outputBuffer,
    inputQueue: ctx.inputQueue,
    error: null,
    status,
    steps: ctx.steps,
  }
}
