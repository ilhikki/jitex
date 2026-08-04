/*
 * IL Runtime — 同步 syscall 实现。
 *
 * 决策依据（见 decide.md）：
 *   - 决策 7：全部同步，无 async/await
 *   - 决策 8：steps.check 在循环回边由 compiler.ts 插入
 *   - 决策 9：RunState 复用 src/runtime/run-state.ts；
 *             file ops 逻辑参考 file-model.ts 但同步化
 *
 * 提供给 transform.ts 生成的 JS 代码调用的 dispatcher：
 *   __sys(key, args) → any
 *
 * transform.ts 的 SemanticCompiler 决定哪些 syscall inline（算术/比较），
 * 哪些走 dispatcher（IO/file/cell/mem/set）。本文件实现所有走 dispatcher 的 key。
 */

import type { RunState, RunError } from '@/runtime/run-state'
import type { PascalFile } from '@/runtime/file-model'

// ============================================================
// 文件状态（同步版本，逻辑参考 file-model.ts 的 RecordFileState）
// ============================================================

interface FileState {
  offset: number
  eof: boolean
  writable: boolean
  lines: string[]
  currentLine: string
}

// ============================================================
// 读取状态（维护当前行 tokens）
// ============================================================

interface ReadState {
  tokens: string[]
  tokenIdx: number
}

// ============================================================
// RuntimeContext
// ============================================================

export interface RuntimeContext {
  outputBuffer: string[]
  inputQueue: string[]
  files: Map<string, Uint8Array>
  fileStates: WeakMap<PascalFile, FileState>
  readState: ReadState
  steps: number
  maxSteps: number
  programFileUrls: Record<string, string>
  /**
   * 非标特性扩展列表（见 AGENTS.md 原则 A 标准锚定）。
   * 默认未启用的非标特性遇到即抛错。
   */
  extensions: Set<string>
}

export interface RuntimeOptions {
  input?: string[]
  files?: Map<string, Uint8Array>
  programFileUrls?: Record<string, string>
  maxSteps?: number
  /** 非标特性扩展列表 */
  extensions?: string[]
}

export function createRuntimeContext(options: RuntimeOptions = {}): RuntimeContext {
  return {
    outputBuffer: [],
    inputQueue: options.input ? [...options.input] : [],
    files: options.files ?? new Map(),
    fileStates: new WeakMap(),
    readState: { tokens: [], tokenIdx: 0 },
    steps: 0,
    maxSteps: options.maxSteps ?? Infinity,
    programFileUrls: options.programFileUrls ?? {},
    extensions: new Set(options.extensions ?? []),
  }
}

export function toRunState(
  ctx: RuntimeContext,
  status: 'running' | 'terminated' | 'error' = 'terminated',
  error?: RunError | null
): RunState {
  return {
    status,
    outputBuffer: ctx.outputBuffer,
    inputQueue: ctx.inputQueue,
    steps: ctx.steps,
    error: error ?? null,
  }
}

// ============================================================
// dispatch — 所有走 dispatcher 的 syscall
// ============================================================

export function dispatch(ctx: RuntimeContext, key: string, args: any[]): any {
  switch (key) {
    // ---------- cell（var 参数传递）----------
    case 'cell.create':
      return { v: args[0] }
    case 'cell.get':
      return args[0].v
    case 'cell.set':
      args[0].v = args[1]
      return undefined

    // ---------- array ----------
    case 'array.get':
      return getArrayElement(args[0], args.slice(1))
    case 'array.set':
      setArrayElement(args[0], args.slice(1, -1), args[args.length - 1])
      return undefined

    // ---------- record ----------
    case 'rec.field':
      return args[0][args[1]]
    case 'rec.set':
      args[0][args[1]] = args[2]
      return undefined

    // ---------- mem.default（变量初始化）----------
    // type 字面量由 literalToJs 直接作为 JS 对象字面量返回，无需 JSON.parse
    case 'mem.default.array':
      return createDefaultArray(args[0])
    case 'mem.default.rec':
      return createDefaultRec(args[0])

    // ---------- set ----------
    case 'set.empty':
      return new Set<number>()
    case 'set.union':
      return new Set<number>([...args[0], ...args[1]] as number[])
    case 'set.intersect':
      return new Set<number>([...args[0]].filter((x) => args[1].has(x)) as number[])
    case 'set.diff':
      return new Set<number>([...args[0]].filter((x) => !args[1].has(x)) as number[])
    case 'set.eq':
      return args[0].size === args[1].size && [...args[0]].every((x: any) => args[1].has(x))
    case 'set.ne':
      return !(args[0].size === args[1].size && [...args[0]].every((x: any) => args[1].has(x)))
    case 'set.le':
      return [...args[0]].every((x: any) => args[1].has(x))
    case 'set.ge':
      return [...args[1]].every((x: any) => args[0].has(x))
    case 'set.range': {
      const s = new Set<number>()
      for (let i = args[0]; i <= args[1]; i++) s.add(i)
      return s
    }
    case 'set.elem':
      return new Set<number>([args[0]] as number[])
    case 'set.literal': {
      const s = new Set<number>()
      for (const e of args) {
        if (e instanceof Set) {
          for (const x of e) s.add(x as number)
        } else {
          s.add(e as number)
        }
      }
      return s
    }
    case 'set.in':
      return args[1].has(args[0])

    // ---------- string ----------
    case 'str.concat':
      return args[0] + args[1]
    case 'str.length':
      return args[0].length

    // ---------- io.write（无文件）----------
    case 'io.write.i64':
      ctx.outputBuffer.push(String(args[0]))
      return undefined
    case 'io.write.f64':
      ctx.outputBuffer.push(formatReal(args[0]))
      return undefined
    case 'io.write.bool':
      ctx.outputBuffer.push(args[0] ? 'TRUE' : 'FALSE')
      return undefined
    case 'io.write.char':
      ctx.outputBuffer.push(args[0])
      return undefined
    case 'io.write.str':
      ctx.outputBuffer.push(args[0])
      return undefined

    // ---------- io.write（带文件）----------
    case 'io.write.i64.file':
      writeToFile(ctx, args[0], String(args[1]))
      return undefined
    case 'io.write.f64.file':
      writeToFile(ctx, args[0], formatReal(args[1]))
      return undefined
    case 'io.write.bool.file':
      writeToFile(ctx, args[0], args[1] ? 'TRUE' : 'FALSE')
      return undefined
    case 'io.write.char.file':
      writeToFile(ctx, args[0], args[1])
      return undefined
    case 'io.write.str.file':
      writeToFile(ctx, args[0], args[1])
      return undefined

    // ---------- io.write.fmt（带 width/precision 格式化）----------
    // 无文件：[value, width, precision?]
    case 'io.write.i64.fmt':
      ctx.outputBuffer.push(formatField(String(args[0]), args[1]))
      return undefined
    case 'io.write.f64.fmt':
      ctx.outputBuffer.push(
        formatField(
          args[2] !== undefined ? (args[0] as number).toFixed(args[2] as number) : formatReal(args[0] as number),
          args[1] as number
        )
      )
      return undefined
    case 'io.write.bool.fmt':
      ctx.outputBuffer.push(formatField(args[0] ? 'TRUE' : 'FALSE', args[1] as number))
      return undefined
    case 'io.write.char.fmt':
      ctx.outputBuffer.push(formatField(args[0] as string, args[1] as number))
      return undefined
    case 'io.write.str.fmt':
      ctx.outputBuffer.push(formatField(args[0] as string, args[1] as number))
      return undefined

    // ---------- io.write.fmt.file（带文件 + 格式化）----------
    // [file, value, width, precision?]
    case 'io.write.i64.fmt.file':
      writeToFile(ctx, args[0], formatField(String(args[1]), args[2] as number))
      return undefined
    case 'io.write.f64.fmt.file':
      writeToFile(
        ctx,
        args[0],
        formatField(
          args[3] !== undefined ? (args[1] as number).toFixed(args[3] as number) : formatReal(args[1] as number),
          args[2] as number
        )
      )
      return undefined
    case 'io.write.bool.fmt.file':
      writeToFile(ctx, args[0], formatField(args[1] ? 'TRUE' : 'FALSE', args[2] as number))
      return undefined
    case 'io.write.char.fmt.file':
      writeToFile(ctx, args[0], formatField(args[1] as string, args[2] as number))
      return undefined
    case 'io.write.str.fmt.file':
      writeToFile(ctx, args[0], formatField(args[1] as string, args[2] as number))
      return undefined

    // ---------- io.writeln ----------
    case 'io.writeln.eol':
      ctx.outputBuffer.push('\n')
      return undefined
    case 'io.writeln.file':
      writelnToFile(ctx, args[0])
      return undefined

    // ---------- io.read（无文件，从 inputQueue）----------
    case 'io.read.i64':
      return readInt(ctx)
    case 'io.read.f64':
      return readReal(ctx)
    case 'io.read.bool':
      return readBool(ctx)
    case 'io.read.char':
      return readChar(ctx)
    case 'io.read.str':
      return readStr(ctx)

    // ---------- io.read（带文件）----------
    case 'io.read.i64.file':
      return readFileInt(ctx, args[0])
    case 'io.read.f64.file':
      return readFileReal(ctx, args[0])
    case 'io.read.bool.file':
      return readFileBool(ctx, args[0])
    case 'io.read.char.file':
      return readFileChar(ctx, args[0])
    case 'io.read.str.file':
      return readFileStr(ctx, args[0])

    // ---------- io.readln.skip ----------
    case 'io.readln.skip':
      ctx.readState.tokens = []
      ctx.readState.tokenIdx = 0
      return undefined
    case 'io.readln.skip.file':
      readFilelnSkip(ctx, args[0])
      return undefined

    // ---------- io.eof / eoln / break / page ----------
    case 'io.eof':
      return isInputEof(ctx)
    case 'io.eoln':
      return isInputEoln(ctx)
    case 'io.break':
      return undefined
    case 'io.page':
      if (args.length > 0) {
        writeToFile(ctx, args[0], '\f')
      } else {
        ctx.outputBuffer.push('\f')
      }
      return undefined

    // ---------- file ----------
    case 'file.create':
      return { url: '', offset: 0 } as PascalFile
    case 'file.reset':
      resetFile(ctx, args[0])
      return undefined
    case 'file.rewrite':
      rewriteFile(ctx, args[0])
      return undefined
    case 'file.close':
      closeFile(ctx, args[0])
      return undefined
    case 'file.assign':
      args[0].url = args[1]
      ctx.fileStates.delete(args[0] as PascalFile)
      return undefined
    case 'file.get':
      getFile(ctx, args[0])
      return undefined
    case 'file.put':
      // put(f) 或 put(f, value)
      if (args.length >= 2) {
        // f^ := x 的语义：直接写入文件
        writeToFile(ctx, args[0], typeof args[1] === 'number' ? String(args[1]) : args[1])
      }
      return undefined
    case 'file.peek':
      return peekFile(ctx, args[0])
    case 'file.eof':
      return isFileEof(ctx, args[0])
    case 'file.eoln':
      return isFileEoln(ctx, args[0])

    // ---------- steps.check（循环步数限制）----------
    case 'steps.check':
      if (++ctx.steps > ctx.maxSteps) {
        throw new Error('Step limit exceeded')
      }
      return undefined

    // ---------- range.check（subrange 运行时边界检查）----------
    case 'range.check':
      if (args[0] < args[1] || args[0] > args[2]) {
        throw new Error(`subrange value ${args[0]} out of range ${args[1]}..${args[2]}`)
      }
      return undefined

    default:
      throw new Error(`Unknown syscall: ${key}`)
  }
}

// ============================================================
// 辅助函数：real 格式化
// ============================================================

function formatReal(n: number): string {
  if (Number.isInteger(n)) {
    return `${n}.00000000000000E+000`
  }
  const s = n.toExponential(14)
  const eIdx = s.indexOf('e')
  if (eIdx < 0) return s
  const mantissa = s.slice(0, eIdx)
  const exp = s.slice(eIdx + 1)
  const sign = exp[0]
  const digits = exp.slice(1)
  const padded = digits.padStart(3, '0')
  return `${mantissa}E${sign}${padded}`
}

/**
 * 字段格式化：右对齐，左填充空格到 width。
 * Pascal 写参数语义：x:width 表示最小字段宽度，右对齐。
 */
function formatField(text: string, width: number): string {
  if (!width || text.length >= width) return text
  return ' '.repeat(width - text.length) + text
}

// ============================================================
// 辅助函数：数组
// ============================================================

function getArrayElement(arr: any, indices: any[]): any {
  let cur = arr
  for (const idx of indices) {
    cur = cur[idx]
  }
  return cur
}

function setArrayElement(arr: any, indices: any[], value: any): void {
  let cur = arr
  for (let i = 0; i < indices.length - 1; i++) {
    cur = cur[indices[i]]
  }
  cur[indices[indices.length - 1]] = value
}

// ============================================================
// 辅助函数：默认值构造
// ============================================================

function createDefaultArray(typeDesc: any): any[] {
  // typeDesc = {tag:'array', dims:[{low,high},...], elem:{...}}
  // 支持两种多维形式：
  //   1. 扁平多维：array[1..2,1..2] of integer → dims 有多个，elem 是标量
  //   2. 嵌套多维：array[1..2] of array[1..2] of integer → dims 单个，elem 是 array
  if (!typeDesc.dims || typeDesc.dims.length === 0) return []
  const dim = typeDesc.dims[0]
  const arr: any[] = []
  if (typeDesc.dims.length > 1) {
    // 扁平多维：剩余维度递归
    const innerDesc = {
      tag: 'array',
      dims: typeDesc.dims.slice(1),
      elem: typeDesc.elem,
    }
    for (let i = dim.low; i <= dim.high; i++) {
      arr[i] = createDefaultArray(innerDesc)
    }
  } else if (typeDesc.elem && typeDesc.elem.tag === 'array') {
    // 嵌套多维
    for (let i = dim.low; i <= dim.high; i++) {
      arr[i] = createDefaultArray(typeDesc.elem)
    }
  } else {
    for (let i = dim.low; i <= dim.high; i++) {
      arr[i] = createDefaultValue(typeDesc.elem ?? { tag: 'i64' })
    }
  }
  return arr
}

function createDefaultRec(typeDesc: any): Record<string, any> {
  const obj: Record<string, any> = {}
  if (typeDesc.fields) {
    for (const f of typeDesc.fields) {
      obj[f.name] = createDefaultValue(f.type)
    }
  }
  return obj
}

function createDefaultValue(ti: any): any {
  switch (ti.tag) {
    case 'i64':
    case 'enum':
      return 0
    case 'subrange':
      return ti.low ?? 0
    case 'f64':
      return 0.0
    case 'bool':
      return false
    case 'char':
      return '\x00'
    case 'str':
      return ''
    case 'set':
      return new Set<number>()
    case 'array':
      if (ti.dims && ti.dims.length > 0) {
        return createDefaultArray(ti)
      }
      return []
    case 'rec':
      return createDefaultRec(ti)
    case 'file':
      return { url: '', offset: 0 }
    default:
      return 0
  }
}

// ============================================================
// 文件操作（同步版本，逻辑参考 file-model.ts）
// ============================================================

function getFileState(ctx: RuntimeContext, file: PascalFile): FileState {
  let s = ctx.fileStates.get(file)
  if (!s) {
    const content = ctx.files.get(file.url) || new Uint8Array(0)
    s = {
      offset: 0,
      eof: content.length === 0,
      writable: false,
      lines: [],
      currentLine: '',
    }
    ctx.fileStates.set(file, s)
  }
  return s
}

function getCurrentContent(ctx: RuntimeContext, file: PascalFile): Uint8Array {
  return ctx.files.get(file.url) || new Uint8Array(0)
}

function writeBackFile(ctx: RuntimeContext, file: PascalFile): void {
  const s = getFileState(ctx, file)
  const text = s.lines.join('\n') + (s.lines.length > 0 ? '\n' : '')
  ctx.files.set(file.url, new TextEncoder().encode(text))
}

function resetFile(ctx: RuntimeContext, file: PascalFile): void {
  const s = getFileState(ctx, file)
  const content = ctx.files.get(file.url) || new Uint8Array(0)
  s.offset = 0
  s.eof = content.length === 0
  s.writable = false
  s.currentLine = ''
}

function rewriteFile(ctx: RuntimeContext, file: PascalFile): void {
  const s = getFileState(ctx, file)
  ctx.files.set(file.url, new Uint8Array(0))
  s.offset = 0
  s.eof = true
  s.writable = true
  s.lines = []
  s.currentLine = ''
}

function closeFile(ctx: RuntimeContext, file: PascalFile): void {
  const s = getFileState(ctx, file)
  if (s.currentLine.length > 0) {
    s.lines.push(s.currentLine)
    s.currentLine = ''
  }
  writeBackFile(ctx, file)
}

function getFile(ctx: RuntimeContext, file: PascalFile): void {
  const s = getFileState(ctx, file)
  if (s.eof) return
  const content = getCurrentContent(ctx, file)
  s.offset++
  if (s.offset >= content.length) {
    s.eof = true
  }
}

function peekFile(ctx: RuntimeContext, file: PascalFile): string {
  const s = getFileState(ctx, file)
  const content = getCurrentContent(ctx, file)
  if (s.eof || s.offset >= content.length) {
    // ISO 7185 6.9.8: "After EOF(f) becomes true, the file-buffer-variable f^ is undefined."
    // 默认未定义行为报错（AGENTS.md 原则 A.5/A.6）。
    // 非标 extension `fileEofBufferSpace`：EOF 时 F^ 返回空格（UCSD/Borland 扩展，Knuth WEB 依赖）。
    if (!ctx.extensions.has('fileEofBufferSpace')) {
      throw new Error('F^ accessed at EOF: undefined behavior (ISO 7185 6.9.8); enable extension "fileEofBufferSpace" to return space')
    }
    return ' '
  }
  const ch = content[s.offset] & 0xff
  // ISO Pascal: EOLN 时 F^ 返回空格
  if (ch === 10 || ch === 13) return ' '
  return String.fromCharCode(ch)
}

function isFileEof(ctx: RuntimeContext, file: PascalFile): boolean {
  return getFileState(ctx, file).eof
}

function isFileEoln(ctx: RuntimeContext, file: PascalFile): boolean {
  const s = getFileState(ctx, file)
  const content = getCurrentContent(ctx, file)
  if (s.eof || s.offset >= content.length) return true
  const ch = content[s.offset]
  return ch === 10 || ch === 13
}

function writeToFile(ctx: RuntimeContext, file: PascalFile, text: string): void {
  // 决策 15：未绑定 url 的文件变量（url=''）回显到 stdout，
  // 复现旧 runtime 无 io 时的 fallback 行为（WRITELN(F,'x') 退化成 WRITELN('x')）
  if (!file.url) {
    ctx.outputBuffer.push(text)
    return
  }
  const s = getFileState(ctx, file)
  // mock IO 不模拟文件状态错误：未打开时自动初始化为可写
  if (!s.writable) {
    s.writable = true
    s.lines = []
    s.currentLine = ''
  }
  s.currentLine += text
}

function writelnToFile(ctx: RuntimeContext, file: PascalFile): void {
  // 决策 15：未绑定 url 的文件变量回显到 stdout
  if (!file.url) {
    ctx.outputBuffer.push('\n')
    return
  }
  const s = getFileState(ctx, file)
  if (!s.writable) {
    s.writable = true
    s.lines = []
    s.currentLine = ''
  }
  s.lines.push(s.currentLine)
  s.currentLine = ''
  writeBackFile(ctx, file)
}

function readFilelnSkip(ctx: RuntimeContext, file: PascalFile): void {
  const s = getFileState(ctx, file)
  if (s.eof) return
  const content = getCurrentContent(ctx, file)
  while (s.offset < content.length) {
    const ch = content[s.offset]
    s.offset++
    if (ch === 10 || ch === 13) break
  }
  // 跳过 CRLF 的 \n
  if (s.offset < content.length && content[s.offset] === 10) {
    s.offset++
  }
  if (s.offset >= content.length) {
    s.eof = true
  }
}

// ============================================================
// 从 inputQueue 读取（同步）
// ============================================================

function nextToken(ctx: RuntimeContext): string | null {
  if (ctx.readState.tokenIdx >= ctx.readState.tokens.length) {
    if (ctx.inputQueue.length === 0) {
      return null
    }
    const line = ctx.inputQueue.shift()!
    ctx.readState.tokens = line.split(/\s+/).filter((s) => s.length > 0)
    ctx.readState.tokenIdx = 0
    if (ctx.readState.tokens.length === 0) {
      return nextToken(ctx) // 递归取下一行（空行跳过）
    }
  }
  return ctx.readState.tokens[ctx.readState.tokenIdx++]
}

function readInt(ctx: RuntimeContext): number {
  const tok = nextToken(ctx)
  return tok ? (parseInt(tok, 10) | 0) : 0
}

function readReal(ctx: RuntimeContext): number {
  const tok = nextToken(ctx)
  return tok ? parseFloat(tok) : 0
}

function readBool(ctx: RuntimeContext): boolean {
  const tok = nextToken(ctx)
  if (!tok) return false
  const lower = tok.toLowerCase()
  return lower === 'true' || lower === 't'
}

function readChar(ctx: RuntimeContext): string {
  const tok = nextToken(ctx)
  return tok ? tok.charAt(0) : '\x00'
}

function readStr(ctx: RuntimeContext): string {
  const tok = nextToken(ctx)
  return tok ?? ''
}

function isInputEof(ctx: RuntimeContext): boolean {
  return (
    ctx.inputQueue.length === 0 &&
    ctx.readState.tokenIdx >= ctx.readState.tokens.length
  )
}

function isInputEoln(ctx: RuntimeContext): boolean {
  return ctx.readState.tokenIdx >= ctx.readState.tokens.length
}

// ============================================================
// 从文件读取（同步）
// ============================================================

function readFileToken(ctx: RuntimeContext, file: PascalFile): string {
  const s = getFileState(ctx, file)
  const content = getCurrentContent(ctx, file)
  // 跳过空白
  while (s.offset < content.length) {
    const ch = content[s.offset]
    if (ch === 32 || ch === 10 || ch === 13 || ch === 9) {
      s.offset++
      continue
    }
    break
  }
  // 读取 token
  let tok = ''
  while (s.offset < content.length) {
    const ch = content[s.offset]
    if (ch === 32 || ch === 10 || ch === 13 || ch === 9 || ch === 0) break
    tok += String.fromCharCode(ch)
    s.offset++
  }
  if (s.offset >= content.length) {
    s.eof = true
  }
  return tok
}

function readFileInt(ctx: RuntimeContext, file: PascalFile): number {
  const tok = readFileToken(ctx, file)
  return tok ? (parseInt(tok, 10) | 0) : 0
}

function readFileReal(ctx: RuntimeContext, file: PascalFile): number {
  const tok = readFileToken(ctx, file)
  return tok ? parseFloat(tok) : 0
}

function readFileBool(ctx: RuntimeContext, file: PascalFile): boolean {
  const tok = readFileToken(ctx, file).toLowerCase()
  return tok === 'true' || tok === 't'
}

function readFileChar(ctx: RuntimeContext, file: PascalFile): string {
  const s = getFileState(ctx, file)
  const content = getCurrentContent(ctx, file)
  if (s.eof || s.offset >= content.length) return '\x00'
  const ch = content[s.offset]
  s.offset++
  if (s.offset >= content.length) {
    s.eof = true
  }
  return String.fromCharCode(ch)
}

function readFileStr(ctx: RuntimeContext, file: PascalFile): string {
  return readFileToken(ctx, file)
}
