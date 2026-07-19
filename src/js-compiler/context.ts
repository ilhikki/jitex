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

export interface JSCtx {
  sysCall: (name: string, args: any[]) => Promise<any>
  box: (typeId: string, raw: unknown) => PascalValue
  steps: number
  maxSteps: number
  outputBuffer: string[]
  inputQueue: string[]
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

export function createJSCtx(options: JSRuntimeOptions): JSCtx {
  const outputBuffer: string[] = []
  const inputQueue: string[] = options.input ? [...options.input] : []
  const mockState = createMockState(outputBuffer, inputQueue)
  const runtime = options.runtime
  const sysCalls = options.sysCalls

  return {
    sysCall: (name: string, args: any[]) => {
      const handler = sysCalls.get(name)
      if (!handler) {
        throw new Error(`JS: unknown syscall ${name}`)
      }
      return Promise.resolve(handler(args, mockState, runtime))
    },
    box: (typeId: string, raw: unknown): PascalValue => ({ typeId, raw }),
    steps: 0,
    maxSteps: options.maxSteps ?? 100000000,
    outputBuffer,
    inputQueue,
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
