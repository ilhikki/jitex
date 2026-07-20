// M5 JS 编译器：运行时上下文
//
// 生成的 JS 代码签名：async function(ctx) { ... }
// ctx 提供：
//   - sysCall(name, args): 调用 VM 的 sysCall handler（WRITELN/READ/ORD...）
//   - box(typeId, raw): 裸值 → PascalValue（跨边界时装箱）
//   - steps / maxSteps: 步数限制
//   - outputBuffer / inputQueue: IO 缓冲（与 VM 状态结构兼容）

import type { PascalValue } from '../vm/jsoncode'
import type { RuntimeCtx, SysCallHandler } from '../types'
import type { VMState } from '../vm/state'
import { createEmptyFile, type PascalIO } from '../vm/file-model'

export interface JSCtx {
  sysCall: (name: string, args: any[]) => Promise<any>
  box: (typeId: string, raw: unknown) => PascalValue
  defaultOf: (typeId: string) => PascalValue
  formatReal: (n: number) => string
  steps: number
  maxSteps: number
  outputBuffer: string[]
  inputQueue: string[]
  // file IO（仅当 JSRunOptions.files 提供时存在；为 file-mode READ/READLN 内联用）
  io?: PascalIO
}

export interface JSRuntimeOptions {
  sysCalls: Map<string, SysCallHandler>
  runtime: RuntimeCtx
  input?: string[]
  maxSteps?: number
}

// 构造一个最小 VMState 兼容对象，供 sysCall handler 使用
// handler 主要访问 outputBuffer / inputQueue / status
function createMockState(outputBuffer: string[], inputQueue: string[]): VMState {
  return {
    pc: 0,
    currentProc: 'main',
    callStack: [],
    globals: {},
    returnValue: null,
    outputBuffer,
    inputQueue,
    error: null,
    status: 'running',
    stepsExecuted: 0,
  } as VMState
}

// Pascal 实数格式化（与 io.plugin 的 formatReal 行为一致，但修正指数补零为 3 位）
// 复制实现是为了不修改 src/vm 下的冻结代码
function formatReal(n: number): string {
  if (Number.isInteger(n)) {
    return `${n}.00000000000000E+000`
  }
  // toExponential 输出形如 "3.50000000000000e+0"，需将指数补零至 3 位
  const s = n.toExponential(14)
  // 拆出尾数和指数
  const eIdx = s.indexOf('e')
  if (eIdx < 0) return s
  const mantissa = s.slice(0, eIdx)
  let exp = s.slice(eIdx + 1) // 含符号
  const sign = exp[0]
  const digits = exp.slice(1)
  const padded = digits.padStart(3, '0')
  return `${mantissa}E${sign}${padded}`
}

// 递归构造类型默认值（与 plugin.default.invoke 语义一致）
function buildDefaultValue(typeId: string, typeTable: any): unknown {
  const td = typeTable.get(typeId) as any
  if (!td) return 0
  switch (td.kind) {
    case 'integer': return 0
    case 'real': return 0.0
    case 'boolean': return false
    case 'char': return '\x00'
    case 'string': return ''
    case 'text': return null
    case 'subrange': return 0
    case 'enum': return 0
    case 'array': {
      // 多维数组：StaticAnalyzer 把 array[1..2,1..3] of integer 压成
      // dimensions=[d0,d1]+elementTypeId=integer；需递归构造嵌套数组
      // 对 array[1..2] of array[1..3] of integer（dimensions=[d0]+elementTypeId=array-...）
      // 也能正确处理：dimIdx 越界时走 buildDefaultValue(elementTypeId) 递归
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
    case 'set': return new Set<number>()
    case 'file': return createEmptyFile()
    default: return 0
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
    formatReal,
    steps: 0,
    maxSteps: options.maxSteps ?? 100000000,
    outputBuffer,
    inputQueue,
    io: runtime.io as PascalIO | undefined,
  }
}

// 从 JSCtx 构造一个 VMState 兼容的返回值（供 _helper.ts 的 getOutput/runVMTest 使用）
export function ctxToVMState(ctx: JSCtx, status: 'running' | 'terminated' | 'error' = 'terminated'): VMState {
  return {
    pc: 0,
    currentProc: 'main',
    callStack: [],
    globals: {},
    returnValue: null,
    outputBuffer: ctx.outputBuffer,
    inputQueue: ctx.inputQueue,
    error: null,
    status,
    stepsExecuted: ctx.steps,
  } as VMState
}
