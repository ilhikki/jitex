// VMState: 贫血状态模型（纯数据，可序列化）

import type { PascalValue, Ref, SourcePos } from './jsoncode'

// ============================================================================
// VMState
// ============================================================================

export interface VMState {
  pc: number
  currentProc: string
  callStack: StackFrame[]
  globals: Record<string, PascalValue>
  returnValue: PascalValue | null
  outputBuffer: string[]
  inputQueue: string[]
  error: VMError | null
  status: 'running' | 'paused' | 'terminated' | 'error'
  stepsExecuted: number
}

export interface StackFrame {
  procName: string
  locals: Record<string, PascalValue>
  varBindings: Record<string, Ref>
  temps: PascalValue[]
  returnAddress: number
  returnProc: string
  returnDest?: Ref  // 函数返回值存储位置（由 CALL 设置，RET 使用）
  savedSourcePos?: SourcePos
  staticLink?: number // callStack 中父帧的索引
  level?: number // 过程的嵌套层级
}

export interface VMError {
  message: string
  instructionIndex: number
  sourcePos?: SourcePos
  stackTrace: string[]
}

// ============================================================================
// 序列化/反序列化
// ============================================================================

export function serializeState(state: VMState): string {
  return JSON.stringify(state)
}

export function deserializeState(json: string): VMState {
  return JSON.parse(json) as VMState
}

// ============================================================================
// 状态创建
// ============================================================================

export function createVMState(): VMState {
  return {
    pc: 0,
    currentProc: 'main',
    callStack: [],
    globals: {},
    returnValue: null,
    outputBuffer: [],
    inputQueue: [],
    error: null,
    status: 'running',
    stepsExecuted: 0,
  }
}

export function createStackFrame(
  procName: string,
  returnAddress: number,
  returnProc: string,
  staticLink?: number,
  level?: number
): StackFrame {
  return {
    procName,
    locals: {},
    varBindings: {},
    temps: [],
    returnAddress,
    returnProc,
    staticLink,
    level,
  }
}

// ============================================================================
// 变量存取（核心算法）
// ============================================================================

function resolveFrame(state: VMState, upLevel: number): StackFrame {
  if (upLevel === 0) {
    return topFrame(state)
  }
  let frame = topFrame(state)
  for (let i = 0; i < upLevel; i++) {
    const link = frame.staticLink
    if (link === undefined) {
      throw new Error(`VM: static link broken at level ${i}`)
    }
    frame = state.callStack[link]
    if (!frame) {
      throw new Error(`VM: static link points to invalid frame`)
    }
  }
  return frame
}

export function getValue(state: VMState, ref: Ref): PascalValue {
  switch (ref.kind) {
    case 'global':
      return state.globals[ref.name]
    case 'local': {
      const upLevel = (ref as any).upLevel || 0
      const frame = resolveFrame(state, upLevel)
      const binding = frame.varBindings[ref.name]
      if (binding) return getValue(state, binding)
      return frame.locals[ref.name]
    }
    case 'temp': {
      const frame = topFrame(state)
      return frame.temps[ref.index]
    }
  }
}

// 解析 var 参数绑定：返回最终的目标 ref（避免 varBinding 链形成循环）
// 当 var 参数被传递给另一层 var 参数时，需要先 resolve 到最终目标
export function resolveVarBinding(state: VMState, ref: Ref): Ref {
  if (ref.kind === 'local') {
    const upLevel = (ref as any).upLevel || 0
    const frame = resolveFrame(state, upLevel)
    const binding = frame.varBindings[ref.name]
    if (binding) {
      // 递归解析，直到找到非 varBinding 的 ref
      return resolveVarBinding(state, binding)
    }
  }
  return ref
}

export function setValue(state: VMState, ref: Ref, value: PascalValue): void {
  switch (ref.kind) {
    case 'global':
      state.globals[ref.name] = value
      break
    case 'local': {
      const upLevel = (ref as any).upLevel || 0
      const frame = resolveFrame(state, upLevel)
      const binding = frame.varBindings[ref.name]
      if (binding) {
        setValue(state, binding, value)
        return
      }
      frame.locals[ref.name] = value
      break
    }
    case 'temp': {
      const frame = topFrame(state)
      frame.temps[ref.index] = value
      break
    }
  }
}

export function topFrame(state: VMState): StackFrame {
  const frame = state.callStack[state.callStack.length - 1]
  if (!frame) {
    throw new Error('VM: call stack underflow')
  }
  return frame
}
