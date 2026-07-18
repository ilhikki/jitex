// IO 插件：WRITE/WRITELN/READ/READLN/RESET/REWRITE/GET/PUT/CLOSE/ASSIGN/BUFFER_CHAR/EOF/EOLN
//
// 路由规则：
// - 第一参数是 file 类型 → 调用 runtime.io.file 的对应方法
// - 否则 → 走 outputBuffer/inputQueue（控制台兼容模式）

import type { PascalValue, Ref, SubrangeType } from '../vm/jsoncode'
import type { SysCallHandler, RuntimeCtx, TypeTable } from '../types'
import type { PascalFile } from '../vm/file-model'
import type { VMState } from '../vm/state'
import { setValue } from './state'

function formatValueWithTable(
  value: PascalValue,
  typeTable: TypeTable | null,
  width?: number,
  precision?: number
): string {
  const raw = value.raw
  let s: string
  if (typeTable) {
    const td = typeTable.get(value.typeId)
    if (td && td.kind === 'subrange') {
      const st = td as SubrangeType
      if (st.baseTypeId === 'char') {
        s = String.fromCharCode(raw as number)
      } else if (st.baseTypeId === 'boolean') {
        s = raw ? 'TRUE' : 'FALSE'
      } else {
        s = String(raw)
      }
    } else {
      s = formatRaw(value)
    }
  } else {
    s = formatRaw(value)
  }
  // 应用宽度/精度
  return applyFormat(s, value, width, precision)
}

function formatRaw(value: PascalValue): string {
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

// Pascal 宽度/精度格式化
function applyFormat(
  s: string,
  value: PascalValue,
  width?: number,
  precision?: number
): string {
  // real 类型带 precision 时重新格式化
  if (value.typeId === 'real' && precision !== undefined) {
    const n = value.raw as number
    s = n.toFixed(precision)
  }

  if (width === undefined) return s

  // 宽度小于内容长度时不截断，只左填充空格
  if (s.length >= width) return s

  // Pascal 默认右对齐（数字、字符）；字符串也右对齐
  return ' '.repeat(width - s.length) + s
}

export function formatValue(value: PascalValue): string {
  return formatValueWithTable(value, null, undefined, undefined)
}

function formatReal(n: number): string {
  // Pascal 实数格式：带指数
  if (Number.isInteger(n)) {
    return `${n}.00000000000000E+000`
  }
  return n.toExponential(14).replace('e', 'E').replace('+', '+')
}

// ============================================================================
// 工具：从 SysCallArg 提取 PascalFile 句柄
// ============================================================================

function asFileValue(arg: any, typeTable: TypeTable | null): PascalFile | null {
  const value = arg?.value || arg
  if (!value || !value.typeId) return null
  if (value.typeId === 'text') return value.raw as PascalFile
  if (typeTable) {
    const td = typeTable.get(value.typeId)
    if (td?.kind === 'file') return value.raw as PascalFile
  }
  return null
}

function isFileArg(arg: any, typeTable: TypeTable | null): boolean {
  return asFileValue(arg, typeTable) !== null
}

// ============================================================================
// WRITE: 输出不换行
// ============================================================================

export const writeHandler: SysCallHandler = async (args, state, runtime) => {
  const vmState = state as VMState
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io

  // 第一参数是文件
  if (args.length > 0 && isFileArg(args[0], typeTable)) {
    const startIdx = 1
    // 有 io：写到对应文件
    if (io) {
      const file = asFileValue(args[0], typeTable)!
      for (let i = startIdx; i < args.length; i++) {
        const arg = args[i] as any
        const value = arg.value || arg
        const width = arg.width as number | undefined
        const precision = arg.precision as number | undefined
        await io.file.write(file, formatValueWithTable(value, typeTable, width, precision))
      }
      return
    }
    // 无 io：退化为控制台输出（跳过文件参数）
    for (let i = startIdx; i < args.length; i++) {
      const arg = args[i] as any
      const value = arg.value || arg
      const width = arg.width as number | undefined
      const precision = arg.precision as number | undefined
      vmState.outputBuffer.push(formatValueWithTable(value, typeTable, width, precision))
    }
    return
  }

  // 控制台模式：输出到 outputBuffer
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as any
    const value = arg.value || arg
    const width = arg.width as number | undefined
    const precision = arg.precision as number | undefined
    vmState.outputBuffer.push(formatValueWithTable(value, typeTable, width, precision))
  }
}

// ============================================================================
// WRITELN: 输出并换行
// ============================================================================

export const writelnHandler: SysCallHandler = async (args, state, runtime) => {
  const vmState = state as VMState
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io

  // 第一参数是文件
  if (args.length > 0 && isFileArg(args[0], typeTable)) {
    const startIdx = 1
    // 有 io：写到对应文件
    if (io) {
      const file = asFileValue(args[0], typeTable)!
      for (let i = startIdx; i < args.length; i++) {
        const arg = args[i] as any
        const value = arg.value || arg
        const width = arg.width as number | undefined
        const precision = arg.precision as number | undefined
        await io.file.write(file, formatValueWithTable(value, typeTable, width, precision))
      }
      await io.file.writeln(file)
      return
    }
    // 无 io：退化为控制台输出
    for (let i = startIdx; i < args.length; i++) {
      const arg = args[i] as any
      const value = arg.value || arg
      const width = arg.width as number | undefined
      const precision = arg.precision as number | undefined
      vmState.outputBuffer.push(formatValueWithTable(value, typeTable, width, precision))
    }
    vmState.outputBuffer.push('\n')
    return
  }

  // 控制台模式
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as any
    const value = arg.value || arg
    const width = arg.width as number | undefined
    const precision = arg.precision as number | undefined
    vmState.outputBuffer.push(formatValueWithTable(value, typeTable, width, precision))
  }
  vmState.outputBuffer.push('\n')
}

// ============================================================================
// READ: 读取输入
// ============================================================================

export const readHandler: SysCallHandler = async (args, state, runtime) => {
  const vmState = state as VMState
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io

  // 第一参数是文件：从文件读
  let fileMode: PascalFile | null = null
  let argStart = 0
  if (args.length > 0 && isFileArg(args[0], typeTable)) {
    fileMode = asFileValue(args[0], typeTable)!
    argStart = 1
  }

  let values: string[] = []
  for (let i = argStart; i < args.length; i++) {
    const arg = args[i] as any
    const argValue = arg.value || arg
    const argRef = arg.ref

    let varValue: string
    if (fileMode) {
      if (!io) throw new Error('READ from file requires runtime.io')
      // 从文件读一个 token：先跳过空白，读到下一个空白
      let ch = await io.file.bufferChar(fileMode)
      while (ch === 32 || ch === 10 || ch === 13 || ch === 9) {
        await io.file.get(fileMode)
        ch = await io.file.bufferChar(fileMode)
      }
      let s = ''
      while (ch !== 32 && ch !== 10 && ch !== 13 && ch !== 9 && ch !== 0) {
        s += String.fromCharCode(ch)
        await io.file.get(fileMode)
        ch = await io.file.bufferChar(fileMode)
      }
      varValue = s
    } else {
      // 控制台模式
      if (values.length === 0) {
        const input = vmState.inputQueue.shift()
        values = input === undefined ? ['0'] : input.split(/\s+/).filter(v => v.length > 0)
        if (values.length === 0) values = ['0']
      }
      const v = values.shift()
      varValue = v === undefined ? '0' : v
    }

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

export const readlnHandler: SysCallHandler = async (args, state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io

  // 第一参数是文件
  if (args.length > 0 && isFileArg(args[0], typeTable)) {
    const file = asFileValue(args[0], typeTable)!
    if (!io) throw new Error('READLN from file requires runtime.io')
    // 先按 READ 处理后续变量参数
    if (args.length > 1) {
      await readHandler(args, state, runtime)
    }
    await io.file.readln(file)
    return
  }

  // 控制台模式
  await readHandler(args, state, runtime)
}

// ============================================================================
// 内置函数：ORD/CHR/ABS/SQR/PRED/SUCC/ODD
// ============================================================================

const ordHandler: SysCallHandler = (args) => {
  const value = (args[0] as any).value || args[0]
  const raw = value.raw
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
// 文件操作：RESET/REWRITE/CLOSE/GET/PUT/ASSIGN
// ============================================================================

const resetHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return // 无 io：退化为 no-op（向后兼容）
  if (args.length === 0) throw new Error('RESET requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('RESET: argument is not a file')
  await io.file.reset(file)
}

const rewriteHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return // 无 io：退化为 no-op
  if (args.length === 0) throw new Error('REWRITE requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('REWRITE: argument is not a file')
  await io.file.rewrite(file)
}

const closeHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return // 无 io：退化为 no-op
  if (args.length === 0) throw new Error('CLOSE requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('CLOSE: argument is not a file')
  await io.file.close(file)
}

const getHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return // 无 io：退化为 no-op
  if (args.length === 0) throw new Error('GET requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('GET: argument is not a file')
  await io.file.get(file)
}

const putHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return // 无 io：退化为 no-op
  if (args.length === 0) throw new Error('PUT requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('PUT: argument is not a file')
  await io.file.put(file)
}

const assignHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return // 无 io：退化为 no-op
  if (args.length < 2) throw new Error('ASSIGN requires (file, name) arguments')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('ASSIGN: first argument is not a file')
  const nameValue = (args[1] as any).value || args[1]
  const name = String(nameValue.raw)
  await io.file.assign(file, name)
}

// BUFFER_CHAR: 返回文件缓冲区当前字符（F^ 表达式编译为此 syscall）
const bufferCharHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return { typeId: 'char', raw: ' ' } // 无 io：返回空格
  if (args.length === 0) throw new Error('buffer char requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('buffer char: argument is not a file')
  const code = await io.file.bufferChar(file)
  return { typeId: 'char', raw: String.fromCharCode(code) }
}

const breakHandler: SysCallHandler = async (_args, _state, runtime) => {
  // BREAK(f): flush 输出缓冲区，简化为 no-op（未来可调用 io.file.flush）
}

// BREAKIN: TEX82 调试用交互断点，no-op
const breakinHandler: SysCallHandler = async (_args, _state, _runtime) => {
  // no-op
}

// ERSTAT: TEX82 文件错误状态（类似 errno），简化为总是返回 0（成功）
const erstatHandler: SysCallHandler = async (_args, _state, _runtime) => {
  return { typeId: 'integer', raw: 0 }
}

// WRITE_FILE: 写入文件缓冲区（F^ := value 编译为此调用）
const writeFileHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return // 无 io：退化为 no-op
  if (args.length < 2) throw new Error('WRITE_FILE requires (file, value) arguments')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('WRITE_FILE: first argument is not a file')
  // 简化处理：通过 write 写入（实际应该更新缓冲区变量）
  const valueArg = args[1] as any
  const value = valueArg.value || valueArg
  const text = typeof value.raw === 'string' ? value.raw : String.fromCharCode(value.raw)
  await io.file.write(file, text)
}

const pageHandler: SysCallHandler = async (args, state, runtime) => {
  const vmState = state as VMState
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  // PAGE(f) 或 PAGE
  if (args.length > 0 && isFileArg(args[0], typeTable)) {
    const file = asFileValue(args[0], typeTable)!
    if (io) {
      await io.file.write(file, '\f')
      return
    }
  }
  vmState.outputBuffer.push('\f')
}

// ============================================================================
// EOF/EOLN: 文件/输入结束检测
// ============================================================================

const eofHandler: SysCallHandler = async (args, state, runtime) => {
  const vmState = state as VMState
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io

  // 带 file 参数
  if (args.length > 0 && isFileArg(args[0], typeTable)) {
    const file = asFileValue(args[0], typeTable)!
    if (!io) return { typeId: 'boolean', raw: true } // 无 io：空文件
    const v = await io.file.eof(file)
    return { typeId: 'boolean', raw: v }
  }

  // 无参数：检查 inputQueue
  return { typeId: 'boolean', raw: vmState.inputQueue.length === 0 }
}

const eolnHandler: SysCallHandler = async (args, state, runtime) => {
  const vmState = state as VMState
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io

  if (args.length > 0 && isFileArg(args[0], typeTable)) {
    const file = asFileValue(args[0], typeTable)!
    if (!io) return { typeId: 'boolean', raw: true } // 无 io：行尾
    const v = await io.file.eoln(file)
    return { typeId: 'boolean', raw: v }
  }

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
  map.set('GET', getHandler)
  map.set('PUT', putHandler)
  map.set('ASSIGN', assignHandler)
  map.set('BUFFER_CHAR', bufferCharHandler)
  map.set('BREAK', breakHandler)
  map.set('BREAKIN', breakinHandler)
  map.set('ERSTAT', erstatHandler)
  map.set('WRITE_FILE', writeFileHandler)
  map.set('PAGE', pageHandler)
  return map
}
