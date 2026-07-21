import type { PascalValue, SysCallHandler, TypeTable, RuntimeCtx } from '../types/types'
import type { PascalFile } from './file-model'

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
      const st = td as any
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

function applyFormat(s: string, value: PascalValue, width?: number, precision?: number): string {
  if (value.typeId === 'real' && precision !== undefined) {
    const n = value.raw as number
    s = n.toFixed(precision)
  }

  if (width === undefined) return s

  if (s.length >= width) return s

  return ' '.repeat(width - s.length) + s
}

export function formatValue(value: PascalValue): string {
  return formatValueWithTable(value, null, undefined, undefined)
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

interface SysCallState {
  outputBuffer: string[]
  inputQueue: string[]
}

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

export const writeHandler: SysCallHandler = async (args, state, runtime) => {
  const s = state as SysCallState
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io

  if (args.length > 0 && isFileArg(args[0], typeTable)) {
    const startIdx = 1
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
    for (let i = startIdx; i < args.length; i++) {
      const arg = args[i] as any
      const value = arg.value || arg
      const width = arg.width as number | undefined
      const precision = arg.precision as number | undefined
      s.outputBuffer.push(formatValueWithTable(value, typeTable, width, precision))
    }
    return
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as any
    const value = arg.value || arg
    const width = arg.width as number | undefined
    const precision = arg.precision as number | undefined
    s.outputBuffer.push(formatValueWithTable(value, typeTable, width, precision))
  }
}

export const writelnHandler: SysCallHandler = async (args, state, runtime) => {
  const s = state as SysCallState
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io

  if (args.length > 0 && isFileArg(args[0], typeTable)) {
    const startIdx = 1
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
    for (let i = startIdx; i < args.length; i++) {
      const arg = args[i] as any
      const value = arg.value || arg
      const width = arg.width as number | undefined
      const precision = arg.precision as number | undefined
      s.outputBuffer.push(formatValueWithTable(value, typeTable, width, precision))
    }
    s.outputBuffer.push('\n')
    return
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as any
    const value = arg.value || arg
    const width = arg.width as number | undefined
    const precision = arg.precision as number | undefined
    s.outputBuffer.push(formatValueWithTable(value, typeTable, width, precision))
  }
  s.outputBuffer.push('\n')
}

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
  if (typeof raw === 'string')
    return { typeId: value.typeId, raw: String.fromCharCode(raw.charCodeAt(0) - 1) }
  if (typeof raw === 'boolean') return { typeId: value.typeId, raw: false }
  return { typeId: value.typeId, raw: (raw as number) - 1 }
}

const succHandler: SysCallHandler = (args) => {
  const value = (args[0] as any).value || args[0]
  const raw = value.raw
  if (typeof raw === 'string')
    return { typeId: value.typeId, raw: String.fromCharCode(raw.charCodeAt(0) + 1) }
  if (typeof raw === 'boolean') return { typeId: value.typeId, raw: true }
  return { typeId: value.typeId, raw: (raw as number) + 1 }
}

const oddHandler: SysCallHandler = (args) => {
  const value = (args[0] as any).value || args[0]
  const raw = value.raw as number
  return { typeId: 'boolean', raw: raw % 2 !== 0 }
}

const resetHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return
  if (args.length === 0) throw new Error('RESET requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('RESET: argument is not a file')
  await io.file.reset(file)
}

const rewriteHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return
  if (args.length === 0) throw new Error('REWRITE requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('REWRITE: argument is not a file')
  await io.file.rewrite(file)
}

const closeHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return
  if (args.length === 0) throw new Error('CLOSE requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('CLOSE: argument is not a file')
  await io.file.close(file)
}

const getHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return
  if (args.length === 0) throw new Error('GET requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('GET: argument is not a file')
  await io.file.get(file)
}

const putHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return
  if (args.length === 0) throw new Error('PUT requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('PUT: argument is not a file')
  await io.file.put(file)
}

const assignHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return
  if (args.length < 2) throw new Error('ASSIGN requires (file, name) arguments')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('ASSIGN: first argument is not a file')
  const nameValue = (args[1] as any).value || args[1]
  const name = String(nameValue.raw)
  await io.file.assign(file, name)
}

const bufferCharHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return { typeId: 'char', raw: ' ' }
  if (args.length === 0) throw new Error('buffer char requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('buffer char: argument is not a file')
  const code = await io.file.bufferChar(file)
  return { typeId: 'char', raw: String.fromCharCode(code) }
}

const breakHandler: SysCallHandler = async (_args, _state, runtime) => {}

const breakinHandler: SysCallHandler = async (_args, _state, _runtime) => {}

const erstatHandler: SysCallHandler = async (_args, _state, _runtime) => {
  return { typeId: 'integer', raw: 0 }
}

const writeFileHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return
  if (args.length < 2) throw new Error('WRITE_FILE requires (file, value) arguments')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('WRITE_FILE: first argument is not a file')
  const valueArg = args[1] as any
  const value = valueArg.value || valueArg
  const text = typeof value.raw === 'string' ? value.raw : String.fromCharCode(value.raw)
  await io.file.write(file, text)
}

const pageHandler: SysCallHandler = async (args, state, runtime) => {
  const s = state as SysCallState
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (args.length > 0 && isFileArg(args[0], typeTable)) {
    const file = asFileValue(args[0], typeTable)!
    if (io) {
      await io.file.write(file, '\f')
      return
    }
  }
  s.outputBuffer.push('\f')
}

const eofHandler: SysCallHandler = async (args, state, runtime) => {
  const s = state as SysCallState
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io

  if (args.length > 0 && isFileArg(args[0], typeTable)) {
    const file = asFileValue(args[0], typeTable)!
    if (!io) return { typeId: 'boolean', raw: true }
    const v = await io.file.eof(file)
    return { typeId: 'boolean', raw: v }
  }

  return { typeId: 'boolean', raw: s.inputQueue.length === 0 }
}

const eolnHandler: SysCallHandler = async (args, state, runtime) => {
  const s = state as SysCallState
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io

  if (args.length > 0 && isFileArg(args[0], typeTable)) {
    const file = asFileValue(args[0], typeTable)!
    if (!io) return { typeId: 'boolean', raw: true }
    const v = await io.file.eoln(file)
    return { typeId: 'boolean', raw: v }
  }

  return { typeId: 'boolean', raw: s.inputQueue.length === 0 }
}

export function createDefaultSysCalls(): Map<string, SysCallHandler> {
  const map = new Map<string, SysCallHandler>()
  map.set('WRITE', writeHandler)
  map.set('WRITELN', writelnHandler)
  map.set('ORD', ordHandler)
  map.set('CHR', chrHandler)
  map.set('ABS', absHandler)
  map.set('SQR', sqrHandler)
  map.set('PRED', predHandler)
  map.set('SUCC', succHandler)
  map.set('ODD', oddHandler)
  map.set('EOF', eofHandler)
  map.set('EOLN', eolnHandler)
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

function getValue(arg: PascalValue | { value: PascalValue } | unknown): PascalValue {
  if (arg && typeof arg === 'object' && 'value' in arg) {
    const v = (arg as any).value
    if (v && typeof v === 'object' && 'typeId' in v) return v as PascalValue
  }
  return arg as PascalValue
}

function extractFileName(val: PascalValue, typeTable: TypeTable | null): string {
  const raw = val.raw
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw
      .map((c: any) => (typeof c === 'number' ? String.fromCharCode(c) : String(c)))
      .join('')
      .replace(/\s+$/, '')
  }
  return String(raw)
}

const extendedResetHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return
  if (args.length === 0) throw new Error('RESET requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('RESET: argument is not a file')
  if (args.length >= 2) {
    const nameVal = getValue(args[1])
    const name = extractFileName(nameVal, typeTable)
    await io.file.assign(file, name)
  }
  await io.file.reset(file)
}

const extendedRewriteHandler: SysCallHandler = async (args, _state, runtime) => {
  const typeTable = runtime?.typeTable || null
  const io = runtime?.io
  if (!io) return
  if (args.length === 0) throw new Error('REWRITE requires a file argument')
  const file = asFileValue(args[0], typeTable)
  if (!file) throw new Error('REWRITE: argument is not a file')
  if (args.length >= 2) {
    const nameVal = getValue(args[1])
    const name = extractFileName(nameVal, typeTable)
    await io.file.assign(file, name)
  }
  await io.file.rewrite(file)
}

export function createExtendedSysCalls(): Map<string, SysCallHandler> {
  const map = createDefaultSysCalls()
  map.set('RESET', extendedResetHandler)
  map.set('REWRITE', extendedRewriteHandler)
  return map
}
