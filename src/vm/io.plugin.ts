// IO 插件：WRITE/WRITELN/READ/READLN

import type { PascalValue, Ref, SubrangeType } from '../vm/jsoncode'
import type { SysCallHandler, RuntimeCtx, TypeTable } from '../types'
import type { VMState } from '../vm/state'
import { setValue } from './state'

function formatValueWithTable(value: PascalValue, typeTable: TypeTable | null): string {
  const raw = value.raw
  if (typeTable) {
    const td = typeTable.get(value.typeId)
    if (td && td.kind === 'subrange') {
      const st = td as SubrangeType
      if (st.baseTypeId === 'char') {
        return String.fromCharCode(raw as number)
      }
      if (st.baseTypeId === 'boolean') {
        return raw ? 'TRUE' : 'FALSE'
      }
      return String(raw)
    }
  }
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

export function formatValue(value: PascalValue): string {
  return formatValueWithTable(value, null)
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

export const writeHandler: SysCallHandler = (args, state, runtime) => {
  const vmState = state as VMState
  const typeTable = runtime?.typeTable || null
  // 跳过第一个参数如果是 text/file 类型（文件参数）
  const startIdx = (args.length > 0 && isFileArg(args[0], typeTable)) ? 1 : 0
  for (let i = startIdx; i < args.length; i++) {
    const value = (args[i] as any).value || args[i]
    vmState.outputBuffer.push(formatValueWithTable(value, typeTable))
  }
}

// ============================================================================
// WRITELN: 输出并换行
// ============================================================================

export const writelnHandler: SysCallHandler = (args, state, runtime) => {
  const vmState = state as VMState
  const typeTable = runtime?.typeTable || null
  // 跳过第一个参数如果是 text/file 类型（文件参数）
  const startIdx = (args.length > 0 && isFileArg(args[0], typeTable)) ? 1 : 0
  for (let i = startIdx; i < args.length; i++) {
    const value = (args[i] as any).value || args[i]
    vmState.outputBuffer.push(formatValueWithTable(value, typeTable))
  }
  vmState.outputBuffer.push('\n')
}

// 判断参数是否是文件类型（text/file）
function isFileArg(arg: any, typeTable: TypeTable | null): boolean {
  const value = arg?.value || arg
  if (!value || !value.typeId) return false
  if (value.typeId === 'text') return true
  if (typeTable) {
    const td = typeTable.get(value.typeId)
    return td?.kind === 'file'
  }
  return false
}

// ============================================================================
// READ: 读取输入
// ============================================================================

export const readHandler: SysCallHandler = async (args, state) => {
  const vmState = state as VMState
  let values: string[] = []
  let varValue: string
  
  for (const arg of args) {
    if (values.length === 0) {
      const input = vmState.inputQueue.shift()
      if (input === undefined) {
        // 输入为空时使用默认值 0
        values = ['0']
      } else {
        values = input.split(/\s+/).filter(v => v.length > 0)
        if (values.length === 0) {
          values = ['0']
        }
      }
    }
    
    const valueStr = values.shift()
    if (valueStr === undefined) {
      // 当行中值不够时，尝试读下一行或用默认值
      const nextInput = vmState.inputQueue.shift()
      if (nextInput !== undefined) {
        values = nextInput.split(/\s+/).filter(v => v.length > 0)
        const nextVal = values.shift()
        if (nextVal === undefined) continue
        // 有值，继续处理
        varValue = nextVal
      } else {
        varValue = '0'
      }
    } else {
      varValue = valueStr
    }
    
    const argValue = (arg as any).value || arg
    const argRef = (arg as any).ref
    let newValue: PascalValue
    if (argValue.typeId === 'integer') {
      newValue = { typeId: 'integer', raw: parseInt(varValue, 10) }
    } else if (argValue.typeId === 'real') {
      newValue = { typeId: 'real', raw: parseFloat(varValue) }
    } else if (argValue.typeId === 'char') {
      newValue = { typeId: 'char', raw: varValue.charAt(0) }
    } else if (argValue.typeId === 'string') {
      newValue = { typeId: 'string', raw: varValue }
    } else {
      newValue = { typeId: 'string', raw: varValue }
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
// 内置函数
// ============================================================================

const ordHandler: SysCallHandler = (args) => {
  const value = (args[0] as any).value || args[0]
  const raw = value.raw
  // char → charCode, boolean → 0/1, integer → itself, enum → index
  if (typeof raw === 'string') return { typeId: 'integer', raw: raw.charCodeAt(0) }
  if (typeof raw === 'boolean') return { typeId: 'integer', raw: raw ? 1 : 0 }
  return { typeId: 'integer', raw: raw as number }
}

const chrHandler: SysCallHandler = (args) => {
  const value = (args[0] as any).value || args[0]
  const code = value.raw as number
  return { typeId: 'char', raw: String.fromCharCode(code) }
}

const absHandler: SysCallHandler = (args) => {
  const value = (args[0] as any).value || args[0]
  const raw = value.raw as number
  if (value.typeId === 'real') return { typeId: 'real', raw: Math.abs(raw) }
  return { typeId: 'integer', raw: Math.abs(raw) }
}

const sqrHandler: SysCallHandler = (args) => {
  const value = (args[0] as any).value || args[0]
  const raw = value.raw as number
  if (value.typeId === 'real') return { typeId: 'real', raw: raw * raw }
  return { typeId: 'integer', raw: raw * raw }
}

const predHandler: SysCallHandler = (args) => {
  const value = (args[0] as any).value || args[0]
  const raw = value.raw
  if (typeof raw === 'string') return { typeId: value.typeId, raw: String.fromCharCode(raw.charCodeAt(0) - 1) }
  if (typeof raw === 'boolean') return { typeId: value.typeId, raw: false }
  return { typeId: value.typeId, raw: (raw as number) - 1 }
}

const succHandler: SysCallHandler = (args) => {
  const value = (args[0] as any).value || args[0]
  const raw = value.raw
  if (typeof raw === 'string') return { typeId: value.typeId, raw: String.fromCharCode(raw.charCodeAt(0) + 1) }
  if (typeof raw === 'boolean') return { typeId: value.typeId, raw: true }
  return { typeId: value.typeId, raw: (raw as number) + 1 }
}

const oddHandler: SysCallHandler = (args) => {
  const value = (args[0] as any).value || args[0]
  const raw = value.raw as number
  return { typeId: 'boolean', raw: raw % 2 !== 0 }
}

// ============================================================================
// 文件操作：REWRITE/RESET/CLOSE（简化为 no-op）
// ============================================================================

const rewriteHandler: SysCallHandler = (args) => {
  // rewrite(f): 创建新文件，简化为 no-op
  // 不做任何事，writeln(f, ...) 仍输出到 stdout
}

const resetHandler: SysCallHandler = (args) => {
  // reset(f): 打开文件读，简化为 no-op
}

const closeHandler: SysCallHandler = (args) => {
  // close(f): 关闭文件
  // Pascal82 标准不含 close，抛出友好错误
  throw new Error('close is not a Pascal82 standard function; use a Pascal82-compliant alternative')
}

// ============================================================================
// EOF/EOLN: 文件/输入结束检测
// ============================================================================

const eofHandler: SysCallHandler = (args, state) => {
  // eof 或 eof(f): 简化为返回 true（输入已耗尽）
  const vmState = state as VMState
  if (args.length === 0) {
    return { typeId: 'boolean', raw: vmState.inputQueue.length === 0 }
  }
  // 带 file 参数：简化为 true（空文件）
  return { typeId: 'boolean', raw: true }
}

const eolnHandler: SysCallHandler = (args, state) => {
  // eoln 或 eoln(f): 行结束检测
  // 简化：readln 后 eoln 为 true
  const vmState = state as VMState
  return { typeId: 'boolean', raw: vmState.inputQueue.length === 0 }
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
  // 内置函数
  map.set('ORD', ordHandler)
  map.set('CHR', chrHandler)
  map.set('ABS', absHandler)
  map.set('SQR', sqrHandler)
  map.set('PRED', predHandler)
  map.set('SUCC', succHandler)
  map.set('ODD', oddHandler)
  map.set('EOF', eofHandler)
  map.set('EOLN', eolnHandler)
  // 文件操作
  map.set('REWRITE', rewriteHandler)
  map.set('RESET', resetHandler)
  map.set('CLOSE', closeHandler)
  return map
}
