import {
  defaultCreateHandler,
  encodeUtf8,
  getPascalStringValue,
  MemoryRecordFile,
  MemoryTextFile,
  PascalArray,
  PascalFile,
  PascalRecord,
  RecordFile,
  RecordHandler,
  SyscallHandler,
  TextFile,
  TypeDescriptor,
  VariantPartDescriptor,
} from '@jitex/pascal-to-js'

export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

export function readTextFile(path: string): Promise<string> {
  return Deno.readTextFile(path)
}

export function readFile(path: string) {
  return Deno.readFile(path)
}

// ============================================================
// Binary Record Handler
// Binary record：所有字段（fix + 变体分支含嵌套变体）都是
// 定长数值（i32/subrange/f64）或嵌套 binary record 时，
// 用 Uint8Array 存储所有字段值，
// 允许 a 写 b 读（不抛 "not accessible in active branch"）。
// 嵌套 record 字段的 buf 是 parent buf 的 subarray（共享底层）。
// ============================================================

interface Codec {
  length: number
  encode: (value: number, buf: Uint8Array, offset: number) => void
  decode: (buf: Uint8Array, offset: number) => number
}

interface ScalarFieldMeta {
  offset: number
  length: number
  type: string
  encode: Codec['encode']
  decode: Codec['decode']
}

interface NestedFieldMeta {
  offset: number
  length: number
  subHandler: RecordHandler
  /** 子 record 的字段名列表，用于跨实现逐字段拷贝 */
  fieldNames: string[]
}

interface BinaryRecordValue {
  buf: Uint8Array
  tags: Record<string, unknown>
  subRecords: Map<string, PascalRecord>
}

function dataView(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
}

const codecTable: Record<string, Codec> = {
  i32: {
    length: 4,
    encode: (v, buf, off) => dataView(buf).setInt32(off, v | 0, false),
    decode: (buf, off) => dataView(buf).getInt32(off, false),
  },
  f64: {
    length: 8,
    encode: (v, buf, off) => dataView(buf).setFloat64(off, v, false),
    decode: (buf, off) => dataView(buf).getFloat64(off, false),
  },
  i8: {
    length: 1,
    encode: (v, buf, off) => dataView(buf).setInt8(off, v | 0),
    decode: (buf, off) => dataView(buf).getInt8(off),
  },
  u8: {
    length: 1,
    encode: (v, buf, off) => dataView(buf).setUint8(off, v | 0),
    decode: (buf, off) => dataView(buf).getUint8(off),
  },
  i16: {
    length: 2,
    encode: (v, buf, off) => dataView(buf).setInt16(off, v | 0, false),
    decode: (buf, off) => dataView(buf).getInt16(off, false),
  },
  u16: {
    length: 2,
    encode: (v, buf, off) => dataView(buf).setUint16(off, v | 0, false),
    decode: (buf, off) => dataView(buf).getUint16(off, false),
  },
}

function selectCodec(type: TypeDescriptor): { key: string; codec: Codec } {
  switch (type.tag) {
    case 'i32':
      return { key: 'i32', codec: codecTable.i32 }
    case 'f64':
      return { key: 'f64', codec: codecTable.f64 }
    case 'subrange': {
      const low = type.low
      const high = type.high
      if (low === undefined || high === undefined) {
        throw new Error('subrange missing low/high')
      }
      if (low >= -128 && high <= 127) {
        return { key: 'i8', codec: codecTable.i8 }
      }
      if (low >= 0 && high <= 255) {
        return { key: 'u8', codec: codecTable.u8 }
      }
      if (low >= -32768 && high <= 32767) {
        return { key: 'i16', codec: codecTable.i16 }
      }
      if (low >= 0 && high <= 65535) {
        return { key: 'u16', codec: codecTable.u16 }
      }
      return { key: 'i32', codec: codecTable.i32 }
    }
    default:
      throw new Error(`unsupported scalar field type: ${type.tag}`)
  }
}

/** 字段类型是否可用于 binary record（数值或嵌套 binary record） */
function isBinaryFieldType(type: TypeDescriptor): boolean {
  if (type.tag === 'i32' || type.tag === 'subrange' || type.tag === 'f64') {
    return true
  }
  if (type.tag === 'rec') {
    return isBinaryRecord(type)
  }
  return false
}

function variantFieldsAllBinary(variant: VariantPartDescriptor): boolean {
  for (const branch of variant.branches) {
    for (const f of branch.fields) {
      if (!isBinaryFieldType(f.type)) {
        return false
      }
    }
    if (branch.nested && !variantFieldsAllBinary(branch.nested)) {
      return false
    }
  }
  return true
}

/** record 是否可走 binary handler：所有字段是数值或嵌套 binary record */
function isBinaryRecord(type: TypeDescriptor): boolean {
  if (type.tag !== 'rec') {
    return false
  }
  for (const f of type.fields ?? []) {
    if (!isBinaryFieldType(f.type)) {
      return false
    }
  }
  if (type.variant && !variantFieldsAllBinary(type.variant)) {
    return false
  }
  return true
}

function collectTagNames(variant: VariantPartDescriptor, tags: Set<string>): void {
  if (variant.tagName) {
    tags.add(variant.tagName)
  }
  for (const branch of variant.branches) {
    if (branch.nested) {
      collectTagNames(branch.nested, tags)
    }
  }
}

interface BinaryLayout {
  scalarFields: Map<string, ScalarFieldMeta>
  nestedFields: Map<string, NestedFieldMeta>
  totalSize: number
  tagNames: Set<string>
  /** 所有字段名（scalar + nested + tags），用于跨实现逐字段拷贝 */
  fieldNames: string[]
}

function buildVariantFields(
  variant: VariantPartDescriptor,
  scalarFields: Map<string, ScalarFieldMeta>,
  nestedFields: Map<string, NestedFieldMeta>,
  start: number,
): number {
  let maxSize = 0
  for (const branch of variant.branches) {
    let branchSize = 0
    for (const f of branch.fields) {
      if (f.type.tag === 'rec') {
        const subLayout = buildLayout(f.type)
        nestedFields.set(f.name, {
          offset: start + branchSize,
          length: subLayout.totalSize,
          subHandler: createBinaryRecordHandler(f.type),
          fieldNames: subLayout.fieldNames,
        })
        branchSize += subLayout.totalSize
      } else {
        const { key, codec } = selectCodec(f.type)
        scalarFields.set(f.name, {
          offset: start + branchSize,
          length: codec.length,
          type: key,
          encode: codec.encode,
          decode: codec.decode,
        })
        branchSize += codec.length
      }
    }
    if (branch.nested) {
      branchSize += buildVariantFields(branch.nested, scalarFields, nestedFields, start + branchSize)
    }
    if (branchSize > maxSize) {
      maxSize = branchSize
    }
  }
  return maxSize
}

function buildLayout(type: TypeDescriptor): BinaryLayout {
  const scalarFields = new Map<string, ScalarFieldMeta>()
  const nestedFields = new Map<string, NestedFieldMeta>()
  let offset = 0
  for (const f of type.fields ?? []) {
    if (f.type.tag === 'rec') {
      const subLayout = buildLayout(f.type)
      nestedFields.set(f.name, {
        offset,
        length: subLayout.totalSize,
        subHandler: createBinaryRecordHandler(f.type),
        fieldNames: subLayout.fieldNames,
      })
      offset += subLayout.totalSize
    } else {
      const { key, codec } = selectCodec(f.type)
      scalarFields.set(f.name, {
        offset,
        length: codec.length,
        type: key,
        encode: codec.encode,
        decode: codec.decode,
      })
      offset += codec.length
    }
  }
  const tagNames = new Set<string>()
  if (type.variant) {
    collectTagNames(type.variant, tagNames)
    const variantStart = offset
    const variantSize = buildVariantFields(type.variant, scalarFields, nestedFields, variantStart)
    offset = variantStart + variantSize
  }
  const fieldNames = [
    ...scalarFields.keys(),
    ...nestedFields.keys(),
    ...tagNames,
  ]
  return { scalarFields, nestedFields, totalSize: offset, tagNames, fieldNames }
}

function createBinaryRecordHandler(type: TypeDescriptor): RecordHandler {
  const { scalarFields, nestedFields, totalSize, tagNames } = buildLayout(type)
  const handler: RecordHandler = {
    create(): PascalRecord {
      const buf = new Uint8Array(totalSize)
      return {
        kind: 'record',
        value: { buf, tags: {}, subRecords: new Map() },
        handler,
      }
    },
    get(value, key) {
      const bv = value as unknown as BinaryRecordValue
      if (tagNames.has(key)) {
        if (!(key in bv.tags)) {
          throw new Error(`read unsetted field: ${key}`)
        }
        return bv.tags[key]
      }
      const scalar = scalarFields.get(key)
      if (scalar) {
        return scalar.decode(bv.buf, scalar.offset)
      }
      const nested = nestedFields.get(key)
      if (nested) {
        let pr = bv.subRecords.get(key)
        if (!pr) {
          const subView = bv.buf.subarray(nested.offset, nested.offset + nested.length)
          pr = {
            kind: 'record',
            value: { buf: subView, tags: {}, subRecords: new Map() } as BinaryRecordValue,
            handler: nested.subHandler,
          }
          bv.subRecords.set(key, pr)
        }
        return pr
      }
      throw new Error(`record not contains field ${key}`)
    },
    set(value, key, val) {
      const bv = value as unknown as BinaryRecordValue
      if (tagNames.has(key)) {
        bv.tags[key] = val
        return
      }
      const scalar = scalarFields.get(key)
      if (scalar) {
        scalar.encode(val as number, bv.buf, scalar.offset)
        return
      }
      const nested = nestedFields.get(key)
      if (nested) {
        const src = val as PascalRecord
        const srcBv = src.value as unknown as { buf?: Uint8Array; tags?: Record<string, unknown> }
        if (srcBv.buf) {
          // src 是 binary record：直接 buf 拷贝
          bv.buf.set(srcBv.buf.subarray(0, nested.length), nested.offset)
        } else {
          // src 是默认 handler record：用子 record 的字段名逐字段拷贝
          const tmp = nested.subHandler.create()
          const tmpBv = tmp.value as unknown as BinaryRecordValue
          for (const fname of nested.fieldNames) {
            try {
              const v = src.handler.get(src.value, fname)
              nested.subHandler.set(tmp.value, fname, v)
            } catch { /* 字段未设置，跳过 */ }
          }
          bv.buf.set(tmpBv.buf.subarray(0, nested.length), nested.offset)
        }
        // 同步 tags 到缓存视图（如已创建）
        const cached = bv.subRecords.get(key)
        if (cached) {
          const cachedBv = cached.value as unknown as BinaryRecordValue
          cachedBv.tags = srcBv.tags ? { ...srcBv.tags } : {}
          cachedBv.subRecords = new Map()
        }
        return
      }
      throw new Error(`record not contains field ${key}`)
    },
    copy(record) {
      const bv = record.value as unknown as BinaryRecordValue
      return {
        kind: 'record',
        value: {
          buf: new Uint8Array(bv.buf),
          tags: { ...bv.tags },
          subRecords: new Map(),
        } as BinaryRecordValue,
        handler,
      }
    },
  }
  return handler
}

export const extraSyscalls: Record<string, SyscallHandler> = {
  'extra.break': () => {
  },
  'file.rewrite': (ctx, [file, fileName]) => {
    const pascalFile = file as PascalFile
    if (fileName) {
      const fileNameArg = fileName as PascalArray
      const rawArray = fileNameArg.value.array
      const nameText = getPascalStringValue(fileNameArg)?.trim()
      ctx.debugLog.push('file.rewrite ' + nameText)
      let fileStore = ctx.files.get(nameText)
      if (fileStore === undefined) {
        fileStore = new MemoryTextFile()
        ctx.files.set(nameText, fileStore)
      }
      pascalFile.value = fileStore
    }
    if (!pascalFile.value) {
      throw new Error('file is not init')
    }
    const fileStore = pascalFile.value!
    fileStore.clear()
    fileStore.seek(0)
    fileStore.setMode('generation')
  },
  'io.write.i32.file': (_ctx, [file, value]) => {
    const f = file as PascalFile
    const pascalFileValue = f.value as TextFile
    if (f.type.elem && f.type.elem.tag !== 'char') {
      pascalFileValue.writeByte(value as number)
    } else {
      pascalFileValue!.writeBytes(encodeUtf8(String(value)))
    }
    return undefined
  },
  'file.rec.rewrite': (ctx, args) => {
    const file = args[0] as PascalFile
    let type
    if (args.length === 4) {
      const fileName = getPascalStringValue(args[1] as PascalArray).trim()
      ctx.debugLog.push('file.rec.rewrite ' + fileName)
      type = args[3]

      let fileStore = ctx.files.get(fileName)
      if (fileStore === undefined) {
        fileStore = new MemoryRecordFile()
        ctx.files.set(fileName, fileStore)
      }
      file.value = fileStore
    } else {
      type = args[1]
    }
    const value = file.value! as RecordFile
    value.clear()
    value.seek(0)
    value.setMode('generation')
    value.setType(type)
    return undefined
  },
  'file.rec.reset': (ctx, args) => {
    const file = args[0] as PascalFile
    let type
    if (args.length === 4) {
      const fileNameArg = args[1] as PascalArray
      const rawArray = fileNameArg.value.array
      const fileName = getPascalStringValue(fileNameArg).trim()
      ctx.debugLog.push('file.rec.reset ' + fileName)
      type = args[3]

      let fileStore = ctx.files.get(fileName)
      if (fileStore === undefined) {
        fileStore = new MemoryRecordFile()
        ctx.files.set(fileName, fileStore)
      }
      file.value = fileStore
      const records = (fileStore as MemoryRecordFile).getRecords()
    } else {
      type = args[1]
    }
    const value = file.value! as RecordFile
    value.seek(0)
    value.setMode('inspection')
    value.setType(type)
    return undefined
  },
  'file.reset': (ctx, [file, fileName]) => {
    const pascalFile = file as PascalFile
    if (file === undefined) {
      throw new Error('file.reset undefined ' + getPascalStringValue(fileName as PascalArray)?.trim())
    }
    if (fileName) {
      const pascalString = fileName as PascalArray
      const nameText = getPascalStringValue(pascalString)?.trim()
      ctx.debugLog.push('file.reset ' + nameText)
      let fileStore = ctx.files.get(nameText)
      if (fileStore === undefined) {
        pascalFile.value = undefined
        return
      }
      pascalFile.value = fileStore
    }
    if (!pascalFile.value) {
      throw new Error('file is not init')
    }
    const fileStore = pascalFile.value!
    fileStore.seek(0)
  },
  'factory.createHandler': (ctx, [type]) => {
    const td = type as TypeDescriptor
    // subrange 初始化为 0
    if (td.tag === 'subrange') {
      return {
        create() {
          return td.low
        },
      }
    }
    if (td.tag === 'file') {
      return {
        create: () => {
          const pascalFile: PascalFile = {
            kind: 'file',
            value: undefined,
            type: td,
          }
          return pascalFile
        },
      }
    }
    // binary record → 二进制 handler
    if (isBinaryRecord(td)) {
      return createBinaryRecordHandler(td)
    }
    return defaultCreateHandler(ctx, type as TypeDescriptor)
  },
  // mem.default.rec 实际调用 factory.createRecHandler（非 factory.createHandler），
  // 必须在此覆盖才能让 binary record handler 生效（a 写 b 读支持）。
  'factory.createRecHandler': (ctx, [type]) => {
    const td = type as TypeDescriptor
    if (isBinaryRecord(td)) {
      return createBinaryRecordHandler(td)
    }
    return defaultCreateHandler(ctx, td)
  },
  'extra.close': (ctx) => {
    ctx.debugLog.push('extra.close')
  },
  'extra.breakIn': (ctx) => {
    ctx.debugLog.push('extra.breakIn')
  },
  'extra.erStat': (_ctx, [file]) => {
    const pascalFile = file as PascalFile
    return pascalFile.value !== undefined ? 0 : 1
  },
}

export class ConsoleFile implements TextFile {
  readonly input: { value: string; position: number }
  readonly output: string[] = []
  mode: 'inspection' | 'generation'
  getInput() {
    return this.input.value
  }

  getOutput() {
    const out = this.output.join('')
    // Simulate terminal auto-newline: real terminals return to the line
    // start when a program ends. TeX's close_files_and_terminate outputs
    // "Transcript written on trip.log." via print_nl + print_char(".")
    // without a trailing print_ln.
    if (out.length > 0 && out[out.length - 1] !== '\n') {
      return out + '\n'
    }
    return out
  }
  constructor(input: string) {
    this.input = {
      value: input,
      position: -1,
    }

    this.mode = 'inspection'
  }
  advance(): void {
    if (!this.hasMore()) {
      throw new Error('EOF')
    }
    if (this.input.position >= 0) {
      this.output.push(this.input.value[this.input.position])
    }
    this.input.position++
  }

  clear(): void {
    if (this.getMode() === 'inspection') {
      this.input.position = -1
    }
  }

  getMode(): 'inspection' | 'generation' {
    return this.mode
  }

  hasMore(): boolean {
    return this.input.position < this.input.value.length
  }

  peekByte(): number | undefined {
    if (!this.hasMore()) {
      throw new Error('EOF')
    }
    return this.input.value[this.input.position]?.charCodeAt(0)
  }

  seek(): void {
    this.input.position = -1
  }

  setMode(mode: 'inspection' | 'generation'): void {
    this.mode = mode
  }

  writeByte(byte: number): void {
    this.output.push(String.fromCharCode(byte))
  }

  writeBytes(data: Uint8Array): void {
    const items = bytesToString(data)
    this.output.push(items)
  }
}

export function getTripChFile() {
  return `% tex.trip.ch — TRIP 测试专用 WEB change file（tripman.tex Appendix A step 2）
%
% 按 tripman.tex step 2 "Prepare a special version of INITEX" 要求：
%   1. init/tini 宏改为 null（启用 INITEX 模式的全部初始化代码）
%   2. stat/tats 宏改为 @t@>（启用统计代码：var_used/dyn_used 跟踪等）
%   3. mem_min/mem_bot: 0 → 1, mem_top/mem_max: 30000 → 3000
%   4. error_line: 72 → 64, half_error_line: 42 → 32, max_print_line: 79 → 72
%      （这些参数影响 show_context 截断/缩进、print 行宽、内存统计数字）
%
% @x 块按 tex.web 行号递增排列（TANGLE 单调扫描，不可逆序）。
% @x 后的旧行必须与 tex.web 中的行字节级匹配（不含行尾符）。

@x
@d stat==@{ {change this to \`$\\\\{stat}\\equiv\\null$' when gathering
  usage statistics}
@d tats==@t@>@} {change this to \`$\\\\{tats}\\equiv\\null$' when gathering
  usage statistics}
@y
@d stat==@t@>
@d tats==@t@>
@z

@x
@d init== {change this to \`$\\\\{init}\\equiv\\.{@@\\{}$' in the production version}
@d tini== {change this to \`$\\\\{tini}\\equiv\\.{@@\\}}$' in the production version}
@y
@d init==
@d tini==
@z

@x
@!mem_max=30000; {greatest index in \\TeX's internal |mem| array;
@y
@!mem_max=3000; {greatest index in \\TeX's internal |mem| array;
@z

@x
@!mem_min=0; {smallest index in \\TeX's internal |mem| array;
@y
@!mem_min=1; {smallest index in \\TeX's internal |mem| array;
@z

@x
@!error_line=72; {width of context lines on terminal error messages}
@y
@!error_line=64; {width of context lines on terminal error messages}
@z

@x
@!half_error_line=42; {width of first lines of contexts in terminal
  error messages; should be between 30 and |error_line-15|}
@y
@!half_error_line=32; {width of first lines of contexts in terminal
  error messages; should be between 30 and |error_line-15|}
@z

@x
@!max_print_line=79; {width of longest text lines output; should be at least 60}
@y
@!max_print_line=72; {width of longest text lines output; should be at least 60}
@z

@x
@d mem_bot=0 {smallest index in the |mem| array dumped by \\.{INITEX};
@y
@d mem_bot=1 {smallest index in the |mem| array dumped by \\.{INITEX};
@z

@x
@d mem_top==30000 {largest index in the |mem| array dumped by \\.{INITEX};
@y
@d mem_top==3000 {largest index in the |mem| array dumped by \\.{INITEX};
@z
`
}
