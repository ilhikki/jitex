// IO 插件：WRITE/WRITELN/READ/READLN

import type { PascalValue, Ref } from '../vm/jsoncode'
import type { SysCallHandler } from '../types'
import type { VMState } from '../vm/state'
import { setValue } from './state'

// ============================================================================
// 值格式化
// ============================================================================

export function formatValue(value: PascalValue): string {
  const raw = value.raw
  switch (value.typeId) {
    case 'integer':
      return String(raw as number)
    case 'boolean':
      return (raw as boolean) ? 'TRUE' : 'FALSE'
    case 'real':
      return formatReal(raw as number)
    case 'char':
      return String(raw)
    case 'string':
      return String(raw)
    default:
      return String(raw)
  }
}

function formatReal(n: number): string {
  // Pascal 实数格式：带指数
  if (Number.isInteger(n)) {
    return `${n}.00000000000000E+000`
  }
  return n.toExponential(14).replace('e', 'E').replace('+', '+')
}

// ============================================================================
// WRITE: 输出不换行
// ============================================================================

export const writeHandler: SysCallHandler = (args, state) => {
  const vmState = state as VMState
  for (const arg of args) {
    const value = (arg as any).value || arg
    vmState.outputBuffer.push(formatValue(value))
  }
}

// ============================================================================
// WRITELN: 输出并换行
// ============================================================================

export const writelnHandler: SysCallHandler = (args, state) => {
  const vmState = state as VMState
  for (const arg of args) {
    const value = (arg as any).value || arg
    vmState.outputBuffer.push(formatValue(value))
  }
  vmState.outputBuffer.push('\n')
}

// ============================================================================
// READ: 读取输入
// ============================================================================

export const readHandler: SysCallHandler = async (args, state) => {
  const vmState = state as VMState
  let values: string[] = []
  
  for (const arg of args) {
    if (values.length === 0) {
      const input = vmState.inputQueue.shift()
      if (input === undefined) {
        throw new Error('READ: no more input')
      }
      values = input.split(/\s+/).filter(v => v.length > 0)
    }
    
    const valueStr = values.shift()
    if (valueStr === undefined) {
      throw new Error('READ: not enough values in input line')
    }
    
    const argValue = (arg as any).value || arg
    const argRef = (arg as any).ref
    let newValue: PascalValue
    if (argValue.typeId === 'integer') {
      newValue = { typeId: 'integer', raw: parseInt(valueStr, 10) }
    } else if (argValue.typeId === 'real') {
      newValue = { typeId: 'real', raw: parseFloat(valueStr) }
    } else if (argValue.typeId === 'char') {
      newValue = { typeId: 'char', raw: valueStr.charAt(0) }
    } else if (argValue.typeId === 'string') {
      newValue = { typeId: 'string', raw: valueStr }
    } else {
      newValue = { typeId: 'string', raw: valueStr }
    }
    if (argRef) {
      setValue(vmState, argRef as Ref, newValue)
    }
  }
}

export const readlnHandler: SysCallHandler = async (args, state) => {
  await readHandler(args, state)
}

// ============================================================================
// 创建系统调用表
// ============================================================================

export function createDefaultSysCalls(): Map<string, SysCallHandler> {
  const map = new Map<string, SysCallHandler>()
  map.set('WRITE', writeHandler)
  map.set('WRITELN', writelnHandler)
  map.set('READ', readHandler)
  map.set('READLN', readlnHandler)
  return map
}
