import {
  createDefaultRec,
  deepCopyValue,
  encodeUtf8,
  formatField,
  formatReal,
  getPascalStringValue,
} from '@/runtime/runtime-util.ts'
import {
  PascalArray,
  PascalFile,
  PascalRecord,
  RecordFile,
  RuntimeContext,
  SyscallHandler,
  TextFile,
  type TypeDescriptor,
} from '@/runtime/runtime-type.ts'
import { MemoryTextFile } from './memory-text-file.ts'

export function fileSyscalls(): Record<string, SyscallHandler> {
  return {
    'program.fileUrl': (ctx, [f, name]) => {
      const file = f as PascalFile
      const key = name as string
      const url = ctx.programFileUrls[key] ?? key
      const fileStore = ctx.files.get(url) ?? new MemoryTextFile()
      file.value = fileStore
      ctx.files.set(key, fileStore)
    },
    // ---------- io.write（带文本文件）----------
    'io.write.i64.file': (_ctx, [file, value]) => {
      const f = ensureTextFile(file as PascalFile)
      f.value!.writeBytes(encodeUtf8(String(value)))
      return undefined
    },
    'io.write.f64.file': (_ctx, [file, value]) => {
      const f = ensureTextFile(file as PascalFile)
      f.value!.writeBytes(encodeUtf8(formatReal(value as number)))
      return undefined
    },
    'io.write.bool.file': (_ctx, [file, value]) => {
      const f = ensureTextFile(file as PascalFile)
      f.value!.writeBytes(encodeUtf8(value ? 'TRUE' : 'FALSE'))
      return undefined
    },
    'io.write.char.file': (_ctx, [file, value]) => {
      const f = ensureTextFile(file as PascalFile)
      f.value!.writeBytes(encodeUtf8(value as string))
      return undefined
    },
    'io.write.str.file': (_ctx, [file, value]) => {
      const f = ensureTextFile(file as PascalFile)
      const charArray = value as PascalArray
      f.value!.writeBytes(encodeUtf8(getPascalStringValue(charArray)))
      return undefined
    },

    'io.write.i64': (ctx, [value]) => {
      const f = getOutput(ctx)
      f.writeBytes(encodeUtf8(String(value)))
      return undefined
    },
    'io.write.f64': (ctx, [value]) => {
      const f = getOutput(ctx)
      f.writeBytes(encodeUtf8(formatReal(value as number)))
      return undefined
    },
    'io.write.bool': (ctx, [value]) => {
      const f = getOutput(ctx)
      f.writeBytes(encodeUtf8(value ? 'TRUE' : 'FALSE'))
      return undefined
    },
    'io.write.char': (ctx, [value]) => {
      const f = getOutput(ctx)
      f.writeBytes(encodeUtf8(value as string))
      return undefined
    },
    'io.write.str': (ctx, [value]) => {
      const f = getOutput(ctx)
      const charArray = value as PascalArray
      f.writeBytes(encodeUtf8(getPascalStringValue(charArray)))
      return undefined
    },

    // ---------- io.write.fmt.file（带文本文件 + 格式化）----------
    'io.write.i64.fmt.file': (_ctx, [file, value, width]) => {
      const f = ensureTextFile(file as PascalFile)
      f.value!.writeBytes(encodeUtf8(formatField(String(value), width as number)))
      return undefined
    },
    'io.write.f64.fmt.file': (_ctx, [file, value, width, precision]) => {
      const f = ensureTextFile(file as PascalFile)
      const formatted = precision !== undefined
        ? (value as number).toFixed(precision as number)
        : formatReal(value as number)
      f.value!.writeBytes(encodeUtf8(formatField(formatted, width as number)))
      return undefined
    },
    'io.write.bool.fmt.file': (_ctx, [file, value, width]) => {
      const f = ensureTextFile(file as PascalFile)
      f.value!.writeBytes(encodeUtf8(formatField(value ? 'TRUE' : 'FALSE', width as number)))
      return undefined
    },
    'io.write.char.fmt.file': (_ctx, [file, value, width]) => {
      const f = ensureTextFile(file as PascalFile)
      f.value!.writeBytes(encodeUtf8(formatField(value as string, width as number)))
      return undefined
    },
    'io.write.str.fmt.file': (_ctx, [file, value, width]) => {
      const f = ensureTextFile(file as PascalFile)
      const str = getPascalStringValue(value as PascalArray)
      f.value!.writeBytes(encodeUtf8(formatField(str, width as number)))
      return undefined
    },

    'io.writeln.file': (_ctx, [file, str]) => {
      const f = ensureTextFile(file as PascalFile)
      f.value!.writeByte(10) // '\n'
      return undefined
    },
    'io.writeln': (ctx, []) => {
      const f = getOutput(ctx)
      f.writeByte(10) // '\n'
      return undefined
    },

    'io.write.i64.fmt': (ctx, [value, width]) => {
      const f = getOutput(ctx)
      f.writeBytes(encodeUtf8(formatField(String(value), width as number)))
      return undefined
    },
    'io.write.f64.fmt': (ctx, [value, width, precision]) => {
      const f = getOutput(ctx)
      const formatted = precision !== undefined
        ? (value as number).toFixed(precision as number)
        : formatReal(value as number)
      f.writeBytes(encodeUtf8(formatField(formatted, width as number)))
      return undefined
    },
    'io.write.bool.fmt': (ctx, [value, width]) => {
      const f = getOutput(ctx)
      f.writeBytes(encodeUtf8(formatField(value ? 'TRUE' : 'FALSE', width as number)))
      return undefined
    },
    'io.write.char.fmt': (ctx, [value, width]) => {
      const f = getOutput(ctx)
      f.writeBytes(encodeUtf8(formatField(value as string, width as number)))
      return undefined
    },
    'io.write.str.fmt': (ctx, [value, width]) => {
      const f = getOutput(ctx)
      const str = getPascalStringValue(value as PascalArray)
      f.writeBytes(encodeUtf8(formatField(str, width as number)))
      return undefined
    },

    // ---------- io.read（带文本文件）----------
    'io.read.i64.file': (_ctx, [file]) => {
      const f = ensureTextFile(file as PascalFile)
      return readFileInt(f.value!)
    },
    'io.read.f64.file': (_ctx, [file]) => {
      const f = ensureTextFile(file as PascalFile)
      return readFileReal(f.value!)
    },
    'io.read.bool.file': (_ctx, [file]) => {
      const f = ensureTextFile(file as PascalFile)
      return readFileBool(f.value!)
    },
    'io.read.char.file': (_ctx, [file]) => {
      const f = ensureTextFile(file as PascalFile)
      return readFileChar(f.value!)
    },
    'io.read.str.file': (_ctx, [file]) => {
      const f = ensureTextFile(file as PascalFile)
      return readFileStr(f.value!)
    },

    'io.read.i64': (ctx) => {
      const f = getInput(ctx)
      return readFileInt(f)
    },
    'io.read.f64': (ctx) => {
      const f = getInput(ctx)
      return readFileReal(f)
    },
    'io.read.bool': (ctx) => {
      const f = getInput(ctx)
      return readFileBool(f)
    },
    'io.read.char': (ctx) => {
      const f = getInput(ctx)
      return readFileChar(f)
    },
    'io.read.str': (ctx) => {
      const f = getInput(ctx)
      return readFileStr(f)
    },

    // ---------- io.readln.skip（无文件 / 带文本文件）----------
    'io.readln.skip': (ctx) => {
      return undefined
    },
    'io.readln.skip.file': (_ctx, [file]) => {
      const f = ensureTextFile(file as PascalFile)
      readFilelnSkip(f.value!)
      return undefined
    },

    'io.page': (ctx, [file]) => {
      if (file !== undefined) {
        const f = ensureTextFile(file as PascalFile)
        f.value!.writeByte(12)
      } else {
        getOutput(ctx).writeByte(12)
      }
      return undefined
    },

    // ---------- 文本文件 file.* ----------
    'file.create': (): PascalFile => ({ kind: 'file', value: undefined }),

    // reset(f)：组合：seek(0) + setMode('inspection')
    'file.reset': (_ctx, [file]) => {
      const f = ensureTextFile(file as PascalFile)
      f.value!.seek(0)
      f.value!.setMode('inspection')
    },

    // rewrite(f)：组合：clear() + seek(0) + setMode('generation')
    'file.rewrite': (_ctx, [file]) => {
      const f = ensureTextFile(file as PascalFile)
      f.value!.clear()
      f.value!.seek(0)
      f.value!.setMode('generation')
    },

    // get(f)：advance()
    'file.get': (_ctx, [file]) => {
      const f = ensureTextFile(file as PascalFile)
      if (!f.value!.hasMore()) {
        throw new Error('get(f) at EOF: pre-assertion violated')
      }
      f.value!.advance()
    },

    // put(f, value?)：文本文件写入
    'file.put': (_ctx, [file, value]) => {
      const f = ensureTextFile(file as PascalFile)
      if (f.value!.getMode() !== 'generation') {
        throw new Error('put(f) before rewrite: pre-assertion violated')
      }
      if (value !== undefined) {
        const text = typeof value === 'number' ? String(value) : (value as string)
        f.value!.writeBytes(encodeUtf8(text))
      }
      // 若 value 未定义，按 ISO 应写入 f^，但本实现沿用旧行为（no-op）
    },

    // peek(f)
    'file.peek': (_ctx, [file]) => {
      const f = ensureTextFile(file as PascalFile)
      const byte = f.value!.peekByte()
      if (byte === undefined) {
        throw new Error('F^ accessed at EOF: undefined behavior')
      }
      if (byte === 10 || byte === 13) {
        return ' '
      }
      return String.fromCharCode(byte)
    },

    // eof(f) -> !hasMore()
    'file.eof': (_ctx, [file]) => {
      const f = ensureTextFile(file as PascalFile)
      return !f.value!.hasMore()
    },

    'file.eoln': (_ctx, [file]) => {
      const byte = ensureTextFile(file as PascalFile).value.peekByte()
      return byte === 10 || byte === 13
    },

    'io.eof': (ctx) => {
      const f = getInput(ctx)
      return !f.hasMore()
    },

    'io.eoln': (ctx) => {
      const store = getInput(ctx)
      if (!store.hasMore()) {
        return true
      }
      const byte = store.peekByte()
      return byte === 10 || byte === 13
    },

    // ---------- 记录文件 file.rec.* ----------
    'file.rec.reset': (_ctx, [file, type]) => {
      const f = ensureRecordFile(file as PascalFile)
      const value = f.value!
      value.seek(0)
      value.setMode('inspection')
      value.setType(type)
    },

    'file.rec.rewrite': (_ctx, [file, type]) => {
      const f = ensureRecordFile(file as PascalFile)
      const value = f.value!
      value.clear()
      value.seek(0)
      value.setMode('generation')
      value.setType(type)
      return undefined
    },

    'file.rec.setbuf': (_ctx, [file, value]) => {
      const f = ensureRecordFile(file as PascalFile)
      if (f.value!.getMode() !== 'generation') {
        throw new Error('f^ := r before rewrite: pre-assertion violated')
      }
      f.value!.setBuffer(deepCopyValue(value) as PascalRecord)
      return undefined
    },

    'file.rec.peek': (_ctx, [file]) => {
      const f = ensureRecordFile(file as PascalFile)
      const fileStore = f.value!
      if (fileStore.getMode() === 'inspection') {
        return fileStore.peekRecord()
      }
      const rec = fileStore!.getBuffer()
      if (rec === undefined) {
        const type = fileStore.getType()
        if (type === undefined) {
          throw new Error('miss record type')
        }
        const buffer = createDefaultRec(file as TypeDescriptor)
        fileStore.setBuffer(buffer)
        return buffer
      }
      return rec
    },

    'file.rec.put': (_ctx, [file]) => {
      const f = ensureRecordFile(file as PascalFile)
      if (f.value!.getMode() !== 'generation') {
        throw new Error('put(f) before rewrite: pre-assertion violated')
      }
      f.value!.writeRecord()
      return undefined
    },

    'file.rec.get': (_ctx, [file]) => {
      const f = ensureRecordFile(file as PascalFile)
      if (!f.value!.hasMore()) {
        throw new Error('get(f) at EOF: pre-assertion violated')
      }
      f.value!.advance()
      return undefined
    },

    'file.rec.eof': (_ctx, [file]) => {
      const f = ensureRecordFile(file as PascalFile)
      return !f.value!.hasMore()
    },
  }
}

// ============================================================
// 辅助：类型守卫（仅在运行时检查，确保类型匹配）
// ============================================================
function getInput(ctx: RuntimeContext) {
  const input = ctx.files.get('INPUT')
  if (input === undefined) {
    throw new Error('OUTPUT not defined')
  }
  return input as TextFile
}

function getOutput(ctx: RuntimeContext) {
  const output = ctx.files.get('OUTPUT')
  if (output === undefined) {
    throw new Error('OUTPUT not defined')
  }
  return output as TextFile
}

function ensureTextFile(f: PascalFile): PascalFile & { value: TextFile } {
  if (!f.value) {
    throw new Error('File value is undefined')
  }
  // 假定调用方传入的是 TextFile，不做类型检查（由外部保证）
  return f as PascalFile & { value: TextFile }
}

function ensureRecordFile(f: PascalFile): PascalFile & { value: RecordFile } {
  if (!f.value) {
    throw new Error('File value is undefined')
  }
  // 假定调用方传入的是 RecordFile，不做类型检查（由外部保证）
  return f as PascalFile & { value: RecordFile }
}

/**
 * 读取一个字符（Pascal read(f, ch) 语义）：
 * - 若当前位置是行结束符（CR 或 LF），消耗行结束符，返回空格（' '）
 * - 否则返回当前字符并推进
 */
function readFileChar(file: TextFile): string {
  if (!file.hasMore()) {
    return '\x00'
  }

  const b = file.peekByte()
  if (b === undefined) {
    return '\x00'
  }
  // 检查是否为行结束符
  if (b === 13 || b === 10) {
    // 消耗行结束符
    file.advance()
    // 处理 CRLF（Windows 风格）：若为 CR，检查下一个是否为 LF
    if (b === 13 && file.hasMore()) {
      const next = file.peekByte()
      if (next === 10) {
        file.advance() // 消耗 LF
      }
    }
    return ' '
  }

  // 普通字符
  file.advance()
  return String.fromCharCode(b)
}

/**
 * 读取一个 token（用于 integer/real/boolean/string）
 * 跳过所有前导空白（包括空格、制表、换行、回车），然后读取直到下一个空白
 */
function readFileToken(file: TextFile): string {
  // 跳过空白（包括行结束符）
  while (file.hasMore()) {
    const b = file.peekByte()
    if (b === undefined) {
      break
    }
    if (b === 32 || b === 10 || b === 13 || b === 9) {
      file.advance()
      // 跳过 CRLF 中的 LF（若前一个是 CR）
      if (b === 13 && file.hasMore()) {
        const next = file.peekByte()
        if (next === 10) {
          file.advance()
        }
      }
      continue
    }
    break
  }

  // 收集 token
  const chars: number[] = []
  while (file.hasMore()) {
    const b = file.peekByte()
    if (b === undefined) {
      break
    }
    if (b === 32 || b === 10 || b === 13 || b === 9 || b === 0) {
      break
    }
    chars.push(b)
    file.advance()
  }
  return new TextDecoder().decode(new Uint8Array(chars))
}

/**
 * 跳过当前行的剩余内容（readln 语义）
 * 消耗直到并包括行结束符
 */
function readFilelnSkip(file: TextFile): void {
  while (file.hasMore()) {
    const b = file.peekByte()
    if (b === undefined) {
      break
    }
    if (b === 13 || b === 10) {
      file.advance()
      // 处理 CRLF
      if (b === 13 && file.hasMore()) {
        const next = file.peekByte()
        if (next === 10) {
          file.advance()
        }
      }
      break
    }
    file.advance()
  }
}

function readFileInt(file: TextFile): number {
  const tok = readFileToken(file)
  return tok ? parseInt(tok, 10) | 0 : 0
}

function readFileReal(file: TextFile): number {
  const tok = readFileToken(file)
  return tok ? parseFloat(tok) : 0
}

function readFileBool(file: TextFile): boolean {
  const tok = readFileToken(file).toLowerCase()
  return tok === 'true' || tok === 't'
}

function readFileStr(file: TextFile): string {
  return readFileToken(file)
}
