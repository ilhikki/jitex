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
 *   __sys(key, args) → unknown
 *
 * transform.ts 的 SemanticCompiler 决定哪些 syscall inline（算术/比较），
 * 哪些走 dispatcher（IO/file/cell/mem/set）。本文件实现所有走 dispatcher 的 key。
 */

import type { RunError, RunState } from '../runtime/run-state.ts'
import type { PascalFile } from '../runtime/file-model.ts'
import type { IlPlugin } from './plugin.ts'
import type { RuntimeContext, RuntimeOptions, SyscallHandler } from './runtime-type.ts'
import { FileState, TypeDescriptor } from '@/compiler/runtime-type.ts'
import { ioSyscalls } from './sys/io.ts'
import { formatField, formatReal } from './runtime-util.ts'

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
    plugins: options.plugins ?? [],
    debugLog: options.debugLog ?? [],
    jsCode: undefined,
  }
}

export function toRunState(
  ctx: RuntimeContext,
  status: 'running' | 'terminated' | 'error' = 'terminated',
  error?: RunError | null,
): RunState {
  return {
    status,
    outputBuffer: ctx.outputBuffer,
    inputQueue: ctx.inputQueue,
    steps: ctx.steps,
    error: error ?? null,
    jsCode: ctx.jsCode,
  }
}

// ============================================================
// dispatch — 所有走 dispatcher 的 syscall
// ============================================================

const syscalls: Record<string, SyscallHandler> = {
  // ---------- cell（var 参数传递）----------
  'cell.create': (_ctx, args) => ({ v: args[0] }),
  'cell.get': (_ctx, args) => (args[0] as { v: unknown }).v,
  'cell.set': (_ctx, args) => {
    ;(args[0] as { v: unknown }).v = args[1]
    return undefined
  },

  // ---------- array ----------
  'array.get': (_ctx, args) => getArrayElement(args[0], args.slice(1)),
  'array.set': (_ctx, args) => {
    setArrayElement(args[0], args.slice(1, -1), args[args.length - 1])
    return undefined
  },

  // ---------- cast ----------
  'cast.char.to.i64': (_ctx, args) => (typeof args[0] === 'string' ? args[0].charCodeAt(0) : args[0]),

  // ---------- record ----------
  'rec.field': (_ctx, args) => (args[0] as Record<string, unknown>)[args[1] as string],
  'rec.set': (_ctx, args) => {
    ;(args[0] as Record<string, unknown>)[args[1] as string] = args[2]
    return undefined
  },
  'rec.copy': (_ctx, args) => deepCopyValue(args[0]),

  // ---------- mem.default（变量初始化）----------
  // type 字面量由 literalToJs 直接作为 JS 对象字面量返回，无需 JSON.parse
  'mem.default.array': (_ctx, args) => createDefaultArray(args[0] as TypeDescriptor),
  'mem.default.rec': (_ctx, args) => createDefaultRec(args[0] as TypeDescriptor),

  // ---------- str.to.char.array ----------
  // Pascal `packed array[low..high] of char` 赋值为字符串字面量时，
  // 必须展开为 1-based（按 low 起）的字符数组对象，否则后续 `arr[k]`
  // 在 JS 中变成 0-based 字符串索引，导致首字符丢失。
  // args = [low, high, str]；返回对象 {low:ch1, low+1:ch2, ..., high:' '}
  // 同时填充 length 属性（=high-low+1），便于 fileUrlToString 等遍历。
  'str.to.char.array': (_ctx, args) => {
    const low: number = (args[0] as number) | 0
    const high: number = (args[1] as number) | 0
    const str: string = typeof args[2] === 'string' ? args[2] : String(args[2] ?? '')
    const out: Record<number | string, string | number> = {}
    for (let i = low; i <= high; i++) {
      const idx = i - low
      out[i] = idx < str.length ? str.charAt(idx) : ' '
    }
    out.length = high - low + 1
    return out
  },

  // ---------- set ----------
  'set.empty': (_ctx, _args) => new Set<number>(),
  'set.union': (_ctx, args) => new Set<number>([...(args[0] as Set<number>), ...(args[1] as Set<number>)]),
  'set.intersect': (_ctx, args) =>
    new Set<number>([...(args[0] as Set<number>)].filter((x) => (args[1] as Set<number>).has(x))),
  'set.diff': (_ctx, args) =>
    new Set<number>([...(args[0] as Set<number>)].filter((x) => !(args[1] as Set<number>).has(x))),
  'set.eq': (_ctx, args) =>
    (args[0] as Set<number>).size === (args[1] as Set<number>).size &&
    [...(args[0] as Set<number>)].every((x: number) => (args[1] as Set<number>).has(x)),
  'set.ne': (_ctx, args) =>
    !((args[0] as Set<number>).size === (args[1] as Set<number>).size &&
      [...(args[0] as Set<number>)].every((x: number) => (args[1] as Set<number>).has(x))),
  'set.le': (_ctx, args) => [...(args[0] as Set<number>)].every((x: number) => (args[1] as Set<number>).has(x)),
  'set.ge': (_ctx, args) => [...(args[1] as Set<number>)].every((x: number) => (args[0] as Set<number>).has(x)),
  'set.range': (_ctx, args) => {
    const s = new Set<number>()
    for (let i = args[0] as number; i <= (args[1] as number); i++) s.add(i)
    return s
  },
  'set.elem': (_ctx, args) => new Set<number>([args[0] as number]),
  'set.literal': (_ctx, args) => {
    const s = new Set<number>()
    for (const e of args) {
      if (e instanceof Set) {
        for (const x of e) s.add(x as number)
      } else {
        s.add(e as number)
      }
    }
    return s
  },
  'set.in': (_ctx, args) => (args[1] as Set<number>).has(args[0] as number),

  // ---------- string ----------
  'str.concat': (_ctx, args) => (args[0] as string) + (args[1] as string),
  'str.length': (_ctx, args) => (args[0] as string).length,
  // ---------- io.write（带文件）----------
  'io.write.i64.file': (ctx, args) => {
    writeToFile(ctx, args[0] as PascalFile, String(args[1]))
    return undefined
  },
  'io.write.f64.file': (ctx, args) => {
    writeToFile(ctx, args[0] as PascalFile, formatReal(args[1] as number))
    return undefined
  },
  'io.write.bool.file': (ctx, args) => {
    writeToFile(ctx, args[0] as PascalFile, args[1] ? 'TRUE' : 'FALSE')
    return undefined
  },
  'io.write.char.file': (ctx, args) => {
    writeToFile(ctx, args[0] as PascalFile, args[1] as string)
    return undefined
  },
  'io.write.str.file': (ctx, args) => {
    writeToFile(ctx, args[0] as PascalFile, args[1] as string)
    return undefined
  },

  // ---------- io.write.fmt.file（带文件 + 格式化）----------
  // [file, value, width, precision?]
  'io.write.i64.fmt.file': (ctx, args) => {
    writeToFile(ctx, args[0] as PascalFile, formatField(String(args[1]), args[2] as number))
    return undefined
  },
  'io.write.f64.fmt.file': (ctx, args) => {
    writeToFile(
      ctx,
      args[0] as PascalFile,
      formatField(
        args[3] !== undefined ? (args[1] as number).toFixed(args[3] as number) : formatReal(args[1] as number),
        args[2] as number,
      ),
    )
    return undefined
  },
  'io.write.bool.fmt.file': (ctx, args) => {
    writeToFile(ctx, args[0] as PascalFile, formatField(args[1] ? 'TRUE' : 'FALSE', args[2] as number))
    return undefined
  },
  'io.write.char.fmt.file': (ctx, args) => {
    writeToFile(ctx, args[0] as PascalFile, formatField(args[1] as string, args[2] as number))
    return undefined
  },
  'io.write.str.fmt.file': (ctx, args) => {
    writeToFile(ctx, args[0] as PascalFile, formatField(args[1] as string, args[2] as number))
    return undefined
  },

  'io.writeln.file': (ctx, args) => {
    writelnToFile(ctx, args[0] as PascalFile)
    return undefined
  },

  // ---------- io.read（带文件）----------
  'io.read.i64.file': (ctx, args) => readFileInt(ctx, args[0] as PascalFile),
  'io.read.f64.file': (ctx, args) => readFileReal(ctx, args[0] as PascalFile),
  'io.read.bool.file': (ctx, args) => readFileBool(ctx, args[0] as PascalFile),
  'io.read.char.file': (ctx, args) => readFileChar(ctx, args[0] as PascalFile),
  'io.read.str.file': (ctx, args) => readFileStr(ctx, args[0] as PascalFile),

  // ---------- io.readln.skip ----------
  'io.readln.skip': (ctx, _args) => {
    ctx.readState.tokens = []
    ctx.readState.tokenIdx = 0
    return undefined
  },
  'io.readln.skip.file': (ctx, args) => {
    readFilelnSkip(ctx, args[0] as PascalFile)
    return undefined
  },

  'io.page': (ctx, args) => {
    if (args.length > 0) {
      writeToFile(ctx, args[0] as PascalFile, '\f')
    } else {
      ctx.outputBuffer.push('\f')
    }
    return undefined
  },

  // ---------- file ----------
  'file.create': (_ctx, _args) => ({ url: '', offset: 0 } as PascalFile),
  'file.reset': (ctx, args) => {
    const file = args[0] as PascalFile
    if (!args[0]) throw new Error(`file.reset: file is undefined`)
    // Pascal reset(f, name, ...) — 先设置文件名再打开
    if (args[1] !== undefined && args[1] !== '') {
      file.url = fileUrlToString(args[1])
      ctx.fileStates.delete(file)
    }
    ctx.debugLog.push(
      `[file.reset] url="${file.url}" found=${ctx.files.has(file.url)} contentLen=${
        ctx.files.get(file.url)?.length ?? -1
      }`,
    )
    resetFile(ctx, file, false)
    return undefined
  },
  'file.reset.binary': (ctx, args) => {
    const file = args[0] as PascalFile
    // 二进制字节文件（file of byte/eight_bits）：不把 10/13 当作行结束符
    if (!args[0]) throw new Error(`file.reset.binary: file is undefined`)
    if (args[1] !== undefined && args[1] !== '') {
      file.url = fileUrlToString(args[1])
      ctx.fileStates.delete(file)
    }
    ctx.debugLog.push(
      `[file.reset.binary] url="${file.url}" found=${ctx.files.has(file.url)} contentLen=${
        ctx.files.get(file.url)?.length ?? -1
      }`,
    )
    resetFile(ctx, file, true)
    return undefined
  },
  'file.rewrite': (ctx, args) => {
    const file = args[0] as PascalFile
    if (!args[0]) throw new Error(`file.rewrite: file is undefined`)
    // Pascal rewrite(f, name, ...) — 先设置文件名再打开
    if (args[1] !== undefined && args[1] !== '') {
      file.url = fileUrlToString(args[1])
      ctx.fileStates.delete(file)
    }
    rewriteFile(ctx, file, false)
    return undefined
  },
  'file.rewrite.binary': (ctx, args) => {
    const file = args[0] as PascalFile
    // 二进制字节文件（file of byte/eight_bits）：Latin-1 编码写入
    if (!args[0]) throw new Error(`file.rewrite.binary: file is undefined`)
    if (args[1] !== undefined && args[1] !== '') {
      file.url = fileUrlToString(args[1])
      ctx.fileStates.delete(file)
    }
    rewriteFile(ctx, file, true)
    return undefined
  },
  'file.close': (ctx, args) => {
    closeFile(ctx, args[0] as PascalFile)
    return undefined
  },
  'file.assign': (ctx, args) => {
    if (args[0] === undefined) {
      throw new Error(`file.assign: file var is undefined (url=${args[1]})`)
    }
    ;(args[0] as PascalFile).url = args[1] as string
    ctx.fileStates.delete(args[0] as PascalFile)
    return undefined
  },
  'file.get': (ctx, args) => {
    getFile(ctx, args[0] as PascalFile)
    return undefined
  },
  'file.put': (ctx, args) => {
    // put(f) 或 put(f, value)
    // ISO 7185 6.6.5.2 put(f) pre-assertion: f0.M = Generation (i.e., after rewrite)
    // 违反 pre-assertion 应报错
    const s = getFileState(ctx, args[0] as PascalFile)
    if (!s.writable) {
      throw new Error(
        'put(f) before rewrite: pre-assertion violated (ISO 7185 6.6.5.2: f0.M must be Generation)',
      )
    }
    if (args.length >= 2) {
      // f^ := x 的语义：直接写入文件
      writeToFile(ctx, args[0] as PascalFile, typeof args[1] === 'number' ? String(args[1]) : args[1] as string)
    }
    return undefined
  },
  'file.peek': (ctx, args) => peekFile(ctx, args[0] as PascalFile),
  'file.eof': (ctx, args) => {
    if (!args[0]) throw new Error(`file.eof: file is undefined (typeof=${typeof args[0]})`)
    return isFileEof(ctx, args[0] as PascalFile)
  },
  'file.eoln': (ctx, args) => isFileEoln(ctx, args[0] as PascalFile),

  // ---------- file of record（ISO 7185 6.4.3.5）----------
  // record 文件以 JS 对象数组形式存储，序列化为 JSON（带 magic prefix）。
  // TeX 格式文件 word_file = file of memory_word 依赖此功能。
  'file.rec.reset': (ctx, args) => {
    if (!args[0]) throw new Error(`file.rec.reset: file is undefined`)
    // 参数布局：[file, name?, typeDesc?] 或 [file, typeDesc]（无 name 时）
    // name 是 string/数组，typeDesc 是 plain object（含 tag/fields）
    let name: string | undefined = undefined
    let typeDesc: TypeDescriptor | undefined = undefined
    if (args.length >= 3) {
      name = args[1] as string | undefined
      typeDesc = args[2] as TypeDescriptor
    } else if (args.length === 2) {
      typeDesc = args[1] as TypeDescriptor
    }
    if (name !== undefined && name !== '') {
      ;(args[0] as PascalFile).url = fileUrlToString(name)
      ctx.fileStates.delete(args[0] as PascalFile)
    }
    ctx.debugLog.push(
      `[file.rec.reset] url="${(args[0] as PascalFile).url}" found=${
        ctx.files.has((args[0] as PascalFile).url)
      } contentLen=${ctx.files.get((args[0] as PascalFile).url)?.length ?? -1}`,
    )
    resetRecFile(ctx, args[0] as PascalFile, typeDesc)
    return undefined
  },
  'file.rec.rewrite': (ctx, args) => {
    if (!args[0]) throw new Error(`file.rec.rewrite: file is undefined`)
    let name: string | undefined = undefined
    let typeDesc: TypeDescriptor | undefined = undefined
    if (args.length >= 3) {
      name = args[1] as string | undefined
      typeDesc = args[2] as TypeDescriptor
    } else if (args.length === 2) {
      typeDesc = args[1] as TypeDescriptor
    }
    if (name !== undefined && name !== '') {
      ;(args[0] as PascalFile).url = fileUrlToString(name)
      ctx.fileStates.delete(args[0] as PascalFile)
    }
    rewriteRecFile(ctx, args[0] as PascalFile, typeDesc)
    return undefined
  },
  'file.rec.setbuf': (ctx, args) => {
    // f^ := r：设置缓冲区（ISO 7185 6.5.5.2 file-buffer-variable 赋值）
    setRecBuffer(ctx, args[0] as PascalFile, args[1])
    return undefined
  },
  'file.rec.peek': (ctx, args) => {
    // r := f^：返回缓冲区的深拷贝（record 赋值是值拷贝语义）
    return peekRecFile(ctx, args[0] as PascalFile)
  },
  'file.rec.put': (ctx, args) => {
    putRecFile(ctx, args[0] as PascalFile)
    return undefined
  },
  'file.rec.get': (ctx, args) => {
    getRecFile(ctx, args[0] as PascalFile)
    return undefined
  },
  'file.rec.eof': (ctx, args) => isRecFileEof(ctx, args[0] as PascalFile),

  // ---------- steps.check（循环步数限制）----------
  'steps.check': (ctx, _args) => {
    if (++ctx.steps > ctx.maxSteps) {
      throw new Error('step limit exceeded')
    }
    return undefined
  },

  // ---------- range.check（subrange 运行时边界检查）----------
  'range.check': (_ctx, args) => {
    if ((args[0] as number) < (args[1] as number) || (args[0] as number) > (args[2] as number)) {
      throw new Error(`subrange value ${args[0]} out of range ${args[1]}..${args[2]}`)
    }
    return undefined
  },
}

function getDefaultSyscalls(): Record<string, SyscallHandler> {
  return { ...syscalls, ...ioSyscalls() }
}

export function createDispatcher(plugins: IlPlugin[]): (ctx: RuntimeContext, key: string, args: unknown[]) => unknown {
  const syscalls = { ...getDefaultSyscalls() }
  for (const plugin of plugins) {
    const pluginName = plugin.name
    for (const [name, fn] of Object.entries(plugin.syscalls ?? {})) {
      if (fn) {
        syscalls[`plugin.${pluginName}.${name}`] = fn
      }
    }
  }
  return (ctx, key, args) => {
    const fn = syscalls[key]
    if (fn) {
      return fn(ctx, args)
    }
    throw new Error(`Unknown syscall: ${key}`)
  }
}

// ============================================================
// 辅助函数：数组
// ============================================================

/**
 * 深拷贝 Pascal 值（record 赋值语义）。
 * Pascal 中 record/array 赋值是值拷贝，但 JS 对象赋值是引用。
 * 此函数用于 `rec.copy` syscall，确保 record 赋值时产生独立副本。
 *
 * 规则：
 *   - 标量（number/string/boolean）：直接返回
 *   - Set：返回新 Set（元素是标量，无需递归）
 *   - Uint8Array：返回新 Uint8Array
 *   - Array：递归深拷贝每个元素
 *   - PascalFile（含 url 属性）：共享引用（文件是引用语义）
 *   - record（plain object）：递归深拷贝每个字段
 */
function deepCopyValue(v: unknown): unknown {
  if (v === null || v === undefined) return v
  if (typeof v !== 'object') return v
  if (v instanceof Set) return new Set(v)
  if (v instanceof Uint8Array) return new Uint8Array(v)
  if (Array.isArray(v)) return v.map(deepCopyValue)
  // PascalFile：文件是引用语义，共享引用
  const obj = v as Record<string, unknown>
  if (typeof obj.url === 'string' && typeof obj.offset === 'number') return v
  // record：递归深拷贝每个字段
  const copy: Record<string, unknown> = {}
  for (const k of Object.keys(obj)) {
    copy[k] = deepCopyValue(obj[k])
  }
  return copy
}

function getArrayElement(arr: unknown, indices: unknown[]): unknown {
  let cur = arr as Record<PropertyKey, unknown>
  for (const idx of indices) {
    // Pascal char 作为数组索引时是单字符字符串，需转 charCode
    const n = typeof idx === 'string' && idx.length === 1 ? idx.charCodeAt(0) : idx
    cur = cur[n as PropertyKey] as Record<PropertyKey, unknown>
  }
  return cur
}

function setArrayElement(arr: unknown, indices: unknown[], value: unknown): void {
  let cur = arr as Record<PropertyKey, unknown>
  for (let i = 0; i < indices.length - 1; i++) {
    const idx = indices[i]
    const n = typeof idx === 'string' && idx.length === 1 ? idx.charCodeAt(0) : idx
    cur = cur[n as PropertyKey] as Record<PropertyKey, unknown>
  }
  const last = indices[indices.length - 1]
  const lastN = typeof last === 'string' && last.length === 1 ? last.charCodeAt(0) : last
  cur[lastN as PropertyKey] = value
}

// ============================================================
// 辅助函数：默认值构造
// ============================================================

function createDefaultArray(typeDesc: TypeDescriptor): unknown[] {
  // typeDesc = {tag:'array', dims:[{low,high},...], elem:{...}}
  // 支持两种多维形式：
  //   1. 扁平多维：array[1..2,1..2] of integer → dims 有多个，elem 是标量
  //   2. 嵌套多维：array[1..2] of array[1..2] of integer → dims 单个，elem 是 array
  if (!typeDesc.dims || typeDesc.dims.length === 0) return []
  const dim = typeDesc.dims[0]
  const arr: unknown[] = []
  if (typeDesc.dims.length > 1) {
    // 扁平多维：剩余维度递归
    const innerDesc: TypeDescriptor = {
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

function createDefaultRec(typeDesc: TypeDescriptor): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  if (typeDesc.fields) {
    for (const f of typeDesc.fields) {
      obj[f.name] = createDefaultValue(f.type)
    }
  }
  return obj
}

function createDefaultValue(ti: TypeDescriptor): unknown {
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
  // file of record：序列化为 JSON（带 magic prefix），不写文本/二进制字节
  if (s.fileElemTag === 'rec' && s.recList) {
    ctx.files.set(file.url, serializeRecList(s.recList))
    return
  }
  if (s.binary) {
    // 二进制字节文件：Latin-1 编码（每字符一字节），不加行分隔符和末尾换行。
    // 避免 UTF-8 多字节编码破坏 DVI/TFM 等二进制产物（0xF7 → c3 b7 的问题）。
    const text = s.lines.join('')
    const bytes = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i) & 0xff
    }
    ctx.files.set(file.url, bytes)
  } else {
    // 文本文件：UTF-8 编码，行间加 \n，末尾加 \n
    const text = s.lines.join('\n') + (s.lines.length > 0 ? '\n' : '')
    ctx.files.set(file.url, new TextEncoder().encode(text))
  }
}

function resetFile(ctx: RuntimeContext, file: PascalFile, binary?: boolean): void {
  const s = getFileState(ctx, file)
  const content = ctx.files.get(file.url) || new Uint8Array(0)
  s.offset = 0
  s.eof = content.length === 0
  s.writable = false
  s.currentLine = ''
  s.binary = binary === true
  // Pascal-H 文件模型（违反 ISO 7185 6.9.8.1：RESET 后 F^ 应指向第一个组件）：
  // RESET 后 F^ 未定义，需要 GET 预读第一个字符。
  // Knuth WEB 系统的 input_ln 依赖此行为（bypass_eoln=true 时 GET 是预读而非跳过）。
  // 但二进制文件（byte_file）不走 input_ln，TeX 直接访问 F^ 期望标准 RESET 语义，
  // 因此二进制文件不启用 Pascal-H 预读。
  if (ctx.extensions.has('pascalHFileModel') && !s.binary) {
    s.pascalHPreread = true
  }
}

/**
 * 把文件名参数转换为字符串。
 * Pascal 中文件名通常是 `packed array[1..N] of char`（运行时为 char 数组或 JS 字符串），
 * 需要连接为字符串并去除尾部填充（空格或 null）。
 *
 * 兼容三种运行时表示：
 *   1. JS 字符串（直接返回，去尾部空白）
 *   2. JS 数组（0-based 或 1-based，按 length 遍历，遇 undefined 跳过）
 *   3. 1-based 字符数组对象（str.to.char.array 生成，键为 1..N，含 length 属性）
 */
function fileUrlToString(url: unknown): string {
  // deno-lint-ignore no-control-regex
  if (typeof url === 'string') return url.replace(/[\s\x00]+$/, '')
  if (url && typeof url === 'object') {
    const u = url as Record<string, unknown>
    const chars: string[] = []
    // 优先用 length 属性确定边界；start 取首个非 undefined 索引（兼容 0/1-based）
    const len = typeof u.length === 'number' ? u.length : 0
    const start = u[0] !== undefined ? 0 : 1
    for (let i = start; i < start + len; i++) {
      const ch = u[i]
      if (ch === undefined || ch === null) continue
      if (typeof ch === 'string') chars.push(ch)
      else if (typeof ch === 'number') chars.push(String.fromCharCode(ch))
    }
    // deno-lint-ignore no-control-regex
    if (chars.length > 0) return chars.join('').replace(/[\s\x00]+$/, '')
    // 兜底：遍历数字键
    const keys = Object.keys(u)
      .map((k) => Number(k))
      .filter((k) => Number.isInteger(k))
      .sort((a, b) => a - b)
    for (const k of keys) {
      const ch = u[k]
      if (typeof ch === 'string') chars.push(ch)
      else if (typeof ch === 'number') chars.push(String.fromCharCode(ch))
    }
    // deno-lint-ignore no-control-regex
    return chars.join('').replace(/[\s\x00]+$/, '')
  }
  return String(url ?? '')
}

function rewriteFile(ctx: RuntimeContext, file: PascalFile, binary?: boolean): void {
  const s = getFileState(ctx, file)
  // 终端文件（TTY:）不清空输入内容：term_in 和 term_out 共享 url='TTY:'，
  // 但 term_out 的写入已重定向到 outputBuffer，不影响 term_in 读取
  if (!isTtyFile(file)) {
    ctx.files.set(file.url, new Uint8Array(0))
  }
  s.offset = 0
  s.eof = true
  s.writable = true
  s.lines = []
  s.currentLine = ''
  s.binary = binary === true
}

function closeFile(ctx: RuntimeContext, file: PascalFile): void {
  const s = getFileState(ctx, file)
  if (s.currentLine.length > 0) {
    s.lines.push(s.currentLine)
    s.currentLine = ''
  }
  // 只对可写文件（rewrite 过的文件）写回内容，避免清空只读文件（reset 过的文件）。
  // 终端文件也不写回，避免覆盖 term_in 的输入内容。
  if (!isTtyFile(file) && s.writable) {
    writeBackFile(ctx, file)
  }
}

function getFile(ctx: RuntimeContext, file: PascalFile): void {
  const s = getFileState(ctx, file)
  // Pascal-H 文件模型：RESET 后第一次 GET 是预读（不推进 offset，只清除标记）
  if (s.pascalHPreread) {
    s.pascalHPreread = false
    return
  }
  // ISO 7185 6.6.5.2 get(f) pre-assertion: f0.R is not S() (i.e., not EOF)
  // 违反 pre-assertion 应报错（"It shall be an error if the stated pre-assertion does not hold"）
  if (s.eof) {
    ctx.debugLog.push(
      `[getFile] EOF url="${file.url}" offset=${s.offset} fileElemTag=${s.fileElemTag ?? '(none)'}`,
    )
    throw new Error(
      `get(f) at EOF: pre-assertion violated (ISO 7185 6.6.5.2: f0.R must not be empty) [url=${file.url}]`,
    )
  }
  const content = getCurrentContent(ctx, file)
  // 终端回显：读取 TTY:（终端输入）时，将消费的字符回显到 outputBuffer，
  // 模拟真实终端驱动程序的行为。TeX 的 init_terminal 打印 ** 提示符后，
  // input_ln 从 term_in 读取用户输入，真实终端会回显输入内容到 term_out。
  // 没有回显，终端输出会缺少 ** 后面的输入行（如 &trip  trip）。
  const isTty = isTtyFile(file)
  if (isTty) {
    const ch = content[s.offset]
    if (ch !== undefined) {
      // 行尾字符（\n/\r）已由 isFileEoln 回显，此处不重复回显
      if (ch !== 10 && ch !== 13) {
        ctx.outputBuffer.push(String.fromCharCode(ch & 0xff))
      }
    }
    // getFile 消费了行尾字符，重置 eoln 回显标记
    s.ttyEolnEchoed = false
  }
  s.offset++
  // 文本文件 CRLF 行尾处理：当 get 跳过 \r 且下一个字符是 \n 时，额外跳过 \n。
  // 原因：TeX 的 input_ln 用 get(f)+eoln(f) 逐字符读取，bypass_eoln 的 get(f)
  // 只跳过一个字符（\r），\n 仍留在文件中导致 eoln 再次返回 true，产生空行。
  // 二进制文件不处理（10/13 是正常数据字节）。
  if (
    !s.binary &&
    s.offset < content.length &&
    content[s.offset - 1] === 13 &&
    content[s.offset] === 10
  ) {
    // CRLF 的 \n 也需要跳过（回显已由 isFileEoln 处理）
    s.offset++
  }
  if (s.offset >= content.length) {
    s.eof = true
  }
}

function peekFile(ctx: RuntimeContext, file: PascalFile): string {
  const s = getFileState(ctx, file)
  const content = getCurrentContent(ctx, file)
  // Pascal-H 文件模型：RESET 后 F^ 未定义，返回空格
  if (s.pascalHPreread) {
    return ' '
  }
  if (s.eof || s.offset >= content.length) {
    // ISO 7185 6.9.8: "After EOF(f) becomes true, the file-buffer-variable f^ is undefined."
    // 默认未定义行为报错（AGENTS.md 原则 A.5/A.6）。
    // 非标 extension `fileEofBufferSpace`：EOF 时 F^ 返回空格（UCSD/Borland 扩展，Knuth WEB 依赖）。
    if (!ctx.extensions.has('fileEofBufferSpace')) {
      throw new Error(
        'F^ accessed at EOF: undefined behavior (ISO 7185 6.9.8); enable extension "fileEofBufferSpace" to return space',
      )
    }
    return ' '
  }
  const ch = content[s.offset] & 0xff
  // 二进制字节文件：直接返回字节值对应的字符，不把 10/13 当作行结束符
  // （TFM/DVI 等二进制文件中 10/13 是正常数据字节，不能转为空格）
  if (s.binary) {
    return String.fromCharCode(ch)
  }
  // 文本文件：ISO Pascal EOLN 时 F^ 返回空格
  if (ch === 10 || ch === 13) return ' '
  return String.fromCharCode(ch)
}

function isFileEof(ctx: RuntimeContext, file: PascalFile): boolean {
  const s = getFileState(ctx, file)
  // Pascal-H 文件模型：RESET 后 F^ 未定义，但 EOF 仍可检查文件是否为空
  if (s.pascalHPreread) {
    const content = getCurrentContent(ctx, file)
    return content.length === 0
  }
  return s.eof
}

function isFileEoln(ctx: RuntimeContext, file: PascalFile): boolean {
  const s = getFileState(ctx, file)
  // Pascal-H 文件模型：RESET 后 F^ 未定义，EOLN 返回 false
  if (s.pascalHPreread) {
    return false
  }
  const content = getCurrentContent(ctx, file)
  if (s.eof || s.offset >= content.length) return true
  const ch = content[s.offset]
  const isEoln = ch === 10 || ch === 13
  // 终端回显：input_ln 的 while not eoln(f) 循环在 eoln 返回 true 时退出，
  // 但不消费行尾字符。真实终端在用户按 Enter 时回显换行。
  // 此处在 eoln 检测到行尾时回显 \n（仅一次），getFile 消费行尾时重置标记。
  if (isEoln && isTtyFile(file) && !s.ttyEolnEchoed) {
    s.ttyEolnEchoed = true
    ctx.outputBuffer.push('\n')
  }
  return isEoln
}

// ============================================================
// file of record 辅助函数（ISO 7185 6.4.3.5 / 6.6.5.2）
// ============================================================

/** record 文件序列化的 magic prefix，用于区分文本/二进制/record 文件 */
const REC_FILE_MAGIC = '\x00PASCAL_TS_REC\x00'

/**
 * 把记录列表序列化为 Uint8Array（magic prefix + UTF-8 JSON）。
 */
function serializeRecList(recList: unknown[]): Uint8Array {
  const json = JSON.stringify(recList)
  const text = REC_FILE_MAGIC + json
  return new TextEncoder().encode(text)
}

/**
 * 从 Uint8Array 反序列化记录列表。
 * 若内容不以 magic prefix 开头，返回空数组（兼容空文件或旧格式）。
 */
function deserializeRecList(content: Uint8Array): unknown[] {
  if (content.length === 0) return []
  const text = new TextDecoder().decode(content)
  if (!text.startsWith(REC_FILE_MAGIC)) {
    // 不是 record 文件格式，返回空（避免误解析文本文件）
    return []
  }
  const json = text.slice(REC_FILE_MAGIC.length)
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function resetRecFile(ctx: RuntimeContext, file: PascalFile, typeDesc?: TypeDescriptor): void {
  const s = getFileState(ctx, file)
  const content = ctx.files.get(file.url) || new Uint8Array(0)
  s.fileElemTag = 'rec'
  s.recTypeDesc = typeDesc
  s.recList = deserializeRecList(content)
  s.recPos = 0
  s.writable = false
  s.eof = s.recList.length === 0
  // ISO 7185 6.6.5.2 reset: f^ 指向第一个组件（若有）。
  // 深拷贝 recList[0] 到缓冲区，使 f^.field := x 修改缓冲区而非文件内容。
  if (s.recList.length > 0) {
    s.recBuffer = deepCopyValue(s.recList[0])
  } else {
    s.recBuffer = typeDesc ? createDefaultRec(typeDesc) : {}
  }
}

function rewriteRecFile(ctx: RuntimeContext, file: PascalFile, typeDesc?: TypeDescriptor): void {
  const s = getFileState(ctx, file)
  if (!isTtyFile(file)) {
    ctx.files.set(file.url, new Uint8Array(0))
  }
  s.fileElemTag = 'rec'
  s.recTypeDesc = typeDesc
  s.recList = []
  s.recPos = 0
  // 初始化缓冲区为默认记录，使 f^.field := x 能直接设置字段。
  // （ISO 7185 中 rewrite 后 f^ 未定义；实际实现给默认值以便字段级赋值。）
  s.recBuffer = typeDesc ? createDefaultRec(typeDesc) : {}
  s.writable = true
  s.eof = true
}

function setRecBuffer(ctx: RuntimeContext, file: PascalFile, value: unknown): void {
  const s = getFileState(ctx, file)
  if (!s.writable) {
    throw new Error('f^ := r before rewrite: pre-assertion violated (ISO 7185 6.6.5.2)')
  }
  // record 赋值是值拷贝语义（ISO 7185），避免别名共享
  s.recBuffer = deepCopyValue(value)
}

function peekRecFile(ctx: RuntimeContext, file: PascalFile): unknown {
  const s = getFileState(ctx, file)
  // 不检查 eof：rewrite 后 eof=true 但 f^ 应可写（缓冲区为默认记录）。
  // reset 空文件后 eof=true，f^ 返回默认记录（ISO "undefined" 由默认值体现，不抛错）。
  // recBuffer 始终被初始化（rewrite/reset/get/put 均设置），不会为 undefined。
  if (s.recBuffer === undefined) {
    // 兜底：若缓冲区确实未初始化，返回空对象
    s.recBuffer = s.recTypeDesc ? createDefaultRec(s.recTypeDesc) : {}
  }
  // 返回缓冲区本身（非拷贝），使 f^.field := x 能修改缓冲区。
  // 整记录读 r := f^ 的值拷贝语义由 compiler 的 rec.copy 包装保证。
  return s.recBuffer
}

function putRecFile(ctx: RuntimeContext, file: PascalFile): void {
  const s = getFileState(ctx, file)
  // ISO 7185 6.6.5.2 put(f) pre-assertion: f0.M = Generation (i.e., after rewrite)
  if (!s.writable) {
    throw new Error('put(f) before rewrite: pre-assertion violated (ISO 7185 6.6.5.2)')
  }
  if (s.recBuffer === undefined) {
    throw new Error('put(f) with undefined f^: pre-assertion violated (ISO 7185 6.6.5.2)')
  }
  // 推入缓冲区的拷贝（避免后续 put 修改同一对象）
  s.recList!.push(deepCopyValue(s.recBuffer))
  // 重置缓冲区为默认记录，便于下一轮 f^.field := x
  s.recBuffer = s.recTypeDesc ? createDefaultRec(s.recTypeDesc) : {}
}

function getRecFile(ctx: RuntimeContext, file: PascalFile): void {
  const s = getFileState(ctx, file)
  // ISO 7185 6.6.5.2 get(f) pre-assertion: f0.R is not S() (i.e., not EOF)
  if (s.eof) {
    throw new Error('get(f) at EOF: pre-assertion violated (ISO 7185 6.6.5.2)')
  }
  s.recPos!++
  if (s.recPos! < s.recList!.length) {
    // 深拷贝到缓冲区，使 f^.field := x 修改缓冲区而非文件内容
    s.recBuffer = deepCopyValue(s.recList![s.recPos!])
  } else {
    s.eof = true
    s.recBuffer = s.recTypeDesc ? createDefaultRec(s.recTypeDesc) : {}
  }
}

function isRecFileEof(ctx: RuntimeContext, file: PascalFile): boolean {
  const s = getFileState(ctx, file)
  return s.eof
}

/** 终端文件 url：写入重定向到 outputBuffer，读取从 ctx.files 查找 */
const TTY_URL = 'TTY:'

function isTtyFile(file: PascalFile): boolean {
  return file.url === TTY_URL
}

function writeToFile(ctx: RuntimeContext, file: PascalFile, text: string): void {
  // 决策 15：未绑定 url 或终端文件（url='TTY:'）回显到 stdout
  if (!file.url || isTtyFile(file)) {
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
  // 决策 15：未绑定 url 或终端文件回显到 stdout
  if (!file.url || isTtyFile(file)) {
    ctx.outputBuffer.push('\n')
    return
  }
  const s = getFileState(ctx, file)
  if (!s.writable) {
    s.writable = true
    s.lines = []
    s.currentLine = ''
  }
  // pool 文件写入追踪（TANGLE 生成 pool 时记录每一行，便于诊断字符串 ID 偏移）
  // TANGLE 写入 url='POOL'，TeX 读取 url='TeXformats:TEX.POOL'，两者均需追踪
  const isPoolWrite = typeof file.url === 'string' && (file.url === 'POOL' || file.url.includes('TEX.POOL'))
  if (isPoolWrite) {
    const cnt = (__poolWriteCount.get(file) ?? 0) + 1
    __poolWriteCount.set(file, cnt)
    ctx.debugLog.push(`[POOL write #${cnt}] ${JSON.stringify(s.currentLine)}`)
  }
  s.lines.push(s.currentLine)
  s.currentLine = ''
  writeBackFile(ctx, file)
}

// ============================================================
// 文件读写追踪（用于 e2e 报告诊断，不写临时文件）
// ============================================================

const __poolLineStart = new WeakMap<PascalFile, number>()
const __poolLineCount = new WeakMap<PascalFile, number>()
const __poolWriteCount = new WeakMap<PascalFile, number>()

function readFilelnSkip(ctx: RuntimeContext, file: PascalFile): void {
  const s = getFileState(ctx, file)
  const isPool = typeof file.url === 'string' && file.url.includes('TEX.POOL')
  if (isPool) {
    const content = getCurrentContent(ctx, file)
    const start = __poolLineStart.get(file) ?? 0
    const lineBytes = content.slice(start, s.offset)
    const cnt = (__poolLineCount.get(file) ?? 0) + 1
    __poolLineCount.set(file, cnt)
    // 诊断信息收集到 ctx.debugLog，由 e2e 报告消费
    ctx.debugLog.push(
      `[POOL readln #${cnt} off=${start}->${s.offset}] ${
        JSON.stringify(Array.from(lineBytes, (b: number) => String.fromCharCode(b)).join(''))
      }`,
    )
  }
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
  if (isPool) {
    __poolLineStart.set(file, s.offset)
  }
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
  return tok ? parseInt(tok, 10) | 0 : 0
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
