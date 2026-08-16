/*
 * 文件系统 syscall 实现（ISO 7185 6.4.3.5 / 6.6.5.2 / 6.9.8 / 6.10）。
 *
 * 设计原则（用户指示）：
 *   - 状态在句柄上：PascalFile 自带 offset/eof/writable/rec* 字段，
 *     不再有 ctx.fileStates 状态表。
 *   - 底层用 bytes：ctx.files 的 value 是 FileBuffer（data.length 即容量，length 为已用长度）；
 *     write/put 直接把字节追加到 ctx.files.get(url)，不做 string 拼接。
 *     容量不足时翻倍扩容（见 runtime-util.ts appendFileBytes），避免每次写入都整体拷贝数组。
 *   - 仅保留 ISO 标准能力：reset/rewrite/get/put/read/readln/write/writeln/page。
 *     已删除的非 ISO 能力（未用插件标识）：
 *       * assign(f, name) — Borland 扩展，ISO 6.6.5.2 无此过程。
 *         program-parameters 的外部绑定改由 compileBlock 通过 rec.set 设 .url 字段实现。
 *       * close(f) — Borland 扩展，ISO 6.6.5.2 无此过程。
 *         文件内容每次 write/put 同步写回 ctx.files，无需显式 close。
 *       * reset/rewrite 2-arg 形式 reset(f, name) — 非 ISO 6.9.8.1 签名。
 *         file.reset/rewrite 只接受 [file]，忽略多余的 name 参数。
 *       * file.reset.binary / file.rewrite.binary — Knuth TFM/DVI 专用 Latin-1 编码。
 *       * TTY: 终端回显、ttyEolnEchoed — Knuth term_in/term_out 模拟。
 *       * pascalHPreread / pascalHFileModel 扩展 — Knuth RESET 后 GET 预读语义。
 *       * fileEofBufferSpace 扩展 — Borland EOF 时 F^ 返回空格。
 *       * pool/POOL 写入追踪、所有 debugLog.push — debug 代码。
 *       * CRLF 双字符跳过 hack — Windows 特定，get(f) 只前进一字节。
 *
 * ISO 行为锚定：
 *   - reset(f)（6.6.5.2）：f.M=Inspection；若文件非空，f^=首组件，否则 f^ 未定义且 eof=true。
 *   - rewrite(f)（6.6.5.2）：f.M=Generation，f.L=f.R=S()，f^ 未定义；外部文件被擦除。
 *   - get(f)（6.6.5.2）：前置 f.M=Inspection 且 f.R 非空；后置 f.R=f0.R.rest。
 *   - put(f)（6.6.5.2）：前置 f.M=Generation 且 f^ 非空；后置 f.L=f0.L↑S(f0↑)。
 *   - eof(f)（6.9.8）：f.R=S() 时为 true。
 *   - eoln(f)（6.9.8）：f^ 为行结束符时为 true；前置 not eof(f)。
 *   - write(f, x)（6.9.8）：把 x 写入 f 的 generation 序列。
 *   - read(f, v)（6.9.8）：从 f 的 inspection 序列读 v。
 *   - page(f)（6.9.8.2）：写换页符到 f。
 *
 * file of record（6.4.3.5）：
 *   序列化为 magic prefix + UTF-8 JSON 存入 ctx.files.get(url)。
 *   recList 在句柄上，reset 时反序列化，put 时追加，rewrite 时清空。
 */

import type { PascalFile } from '@/runtime/file-model.ts'
import type { RuntimeContext, SyscallHandler, TypeDescriptor } from '../runtime-type.ts'
import {
  appendFileBytes,
  createDefaultRec,
  createFileBuffer,
  deepCopyValue,
  fileBufferView,
  formatField,
  formatReal,
} from '@/runtime/runtime-util.ts'

export function fileSyscalls(): Record<string, SyscallHandler> {
  return {
    // ---------- io.write（带文件）----------
    'io.write.i64.file': (ctx, [file, value]) => {
      writeBytes(ctx, file as PascalFile, encodeUtf8(String(value)))
      return undefined
    },
    'io.write.f64.file': (ctx, [file, value]) => {
      writeBytes(ctx, file as PascalFile, encodeUtf8(formatReal(value as number)))
      return undefined
    },
    'io.write.bool.file': (ctx, [file, value]) => {
      writeBytes(ctx, file as PascalFile, encodeUtf8(value ? 'TRUE' : 'FALSE'))
      return undefined
    },
    'io.write.char.file': (ctx, [file, value]) => {
      writeBytes(ctx, file as PascalFile, encodeUtf8(value as string))
      return undefined
    },
    'io.write.str.file': (ctx, [file, value]) => {
      writeBytes(ctx, file as PascalFile, encodeUtf8(value as string))
      return undefined
    },

    // ---------- io.write.fmt.file（带文件 + 格式化）----------
    'io.write.i64.fmt.file': (ctx, [file, value, width]) => {
      writeBytes(ctx, file as PascalFile, encodeUtf8(formatField(String(value), width as number)))
      return undefined
    },
    'io.write.f64.fmt.file': (ctx, [file, value, width, precision]) => {
      const formatted = precision !== undefined
        ? (value as number).toFixed(precision as number)
        : formatReal(value as number)
      writeBytes(ctx, file as PascalFile, encodeUtf8(formatField(formatted, width as number)))
      return undefined
    },
    'io.write.bool.fmt.file': (ctx, [file, value, width]) => {
      writeBytes(ctx, file as PascalFile, encodeUtf8(formatField(value ? 'TRUE' : 'FALSE', width as number)))
      return undefined
    },
    'io.write.char.fmt.file': (ctx, [file, value, width]) => {
      writeBytes(ctx, file as PascalFile, encodeUtf8(formatField(value as string, width as number)))
      return undefined
    },
    'io.write.str.fmt.file': (ctx, [file, value, width]) => {
      writeBytes(ctx, file as PascalFile, encodeUtf8(formatField(value as string, width as number)))
      return undefined
    },

    'io.writeln.file': (ctx, [file]) => {
      writeBytes(ctx, file as PascalFile, encodeUtf8('\n'))
      return undefined
    },

    // ---------- io.read（带文件）----------
    'io.read.i64.file': (ctx, [file]) => readFileInt(ctx, file as PascalFile),
    'io.read.f64.file': (ctx, [file]) => readFileReal(ctx, file as PascalFile),
    'io.read.bool.file': (ctx, [file]) => readFileBool(ctx, file as PascalFile),
    'io.read.char.file': (ctx, [file]) => readFileChar(ctx, file as PascalFile),
    'io.read.str.file': (ctx, [file]) => readFileStr(ctx, file as PascalFile),

    // ---------- io.readln.skip（无文件 / 带文件）----------
    'io.readln.skip': (ctx) => {
      ctx.readState.tokens = []
      ctx.readState.tokenIdx = 0
      return undefined
    },
    'io.readln.skip.file': (ctx, [file]) => {
      readFilelnSkip(ctx, file as PascalFile)
      return undefined
    },

    'io.page': (ctx, [file]) => {
      if (file !== undefined) {
        writeBytes(ctx, file as PascalFile, encodeUtf8('\f'))
      } else {
        ctx.outputBuffer.push('\f')
      }
      return undefined
    },

    // ---------- file ----------
    'file.create': () => ({ url: '', offset: 0, eof: true, writable: false } as PascalFile),

    // reset(f)（ISO 6.6.5.2 / 6.9.8.1）：1-arg 形式。
    // 若传了 name 参数（非 ISO 扩展），忽略之；文件 url 必须已通过 program-param 绑定。
    'file.reset': (ctx, [file]) => {
      const f = file as PascalFile
      if (!f) throw new Error('file.reset: file is undefined')
      resetFile(ctx, f)
      return undefined
    },

    'file.rewrite': (ctx, [file]) => {
      const f = file as PascalFile
      if (!f) throw new Error('file.rewrite: file is undefined')
      rewriteFile(ctx, f)
      return undefined
    },

    'file.get': (ctx, [file]) => {
      getFile(ctx, file as PascalFile)
      return undefined
    },

    // put(f, value?)：ISO 6.6.5.2 put(f) 把 f^ 追加到文件。
    // 本实现简化：若调用方传了 value（来自 f^ := x 的编译期展开），直接写 value；
    // 若未传（裸 put(f)），按 ISO 应写 f^，但本实现视作 no-op（与历史测试一致）。
    'file.put': (ctx, [file, value]) => {
      const f = file as PascalFile
      if (!f) throw new Error('file.put: file is undefined')
      if (!f.writable) {
        throw new Error('put(f) before rewrite: pre-assertion violated (ISO 7185 6.6.5.2: f0.M must be Generation)')
      }
      if (value !== undefined) {
        const text = typeof value === 'number' ? String(value) : value as string
        writeBytes(ctx, f, encodeUtf8(text))
      }
      return undefined
    },

    'file.peek': (ctx, [file]) => peekFile(ctx, file as PascalFile),

    'file.eof': (ctx, [file]) => {
      if (!file) throw new Error('file.eof: file is undefined')
      return (file as PascalFile).eof
    },

    'file.eoln': (ctx, [file]) => {
      const f = file as PascalFile
      if (!f) throw new Error('file.eoln: file is undefined')
      const content = fileBytes(ctx, f.url)
      if (f.eof || f.offset >= content.length) return true
      const ch = content[f.offset]
      return ch === 10 || ch === 13
    },

    // ---------- file of record（ISO 7185 6.4.3.5）----------
    'file.rec.reset': (ctx, [file, arg1, arg2]) => {
      if (!file) throw new Error('file.rec.reset: file is undefined')
      const f = file as PascalFile
      // arg1 可能是 name（非 ISO，忽略）或 typeDesc；arg2 存在时 arg1 为 name。
      const typeDesc = (arg2 !== undefined ? arg2 : arg1) as TypeDescriptor | undefined
      resetRecFile(ctx, f, typeDesc)
      return undefined
    },

    'file.rec.rewrite': (ctx, [file, arg1, arg2]) => {
      if (!file) throw new Error('file.rec.rewrite: file is undefined')
      const f = file as PascalFile
      const typeDesc = (arg2 !== undefined ? arg2 : arg1) as TypeDescriptor | undefined
      rewriteRecFile(ctx, f, typeDesc)
      return undefined
    },

    'file.rec.setbuf': (_ctx, [file, value]) => {
      const f = file as PascalFile
      if (!f) throw new Error('file.rec.setbuf: file is undefined')
      if (!f.writable) {
        throw new Error('f^ := r before rewrite: pre-assertion violated (ISO 7185 6.6.5.2)')
      }
      // record 赋值是值拷贝语义（ISO 7185）
      f.recBuffer = deepCopyValue(value)
      return undefined
    },

    'file.rec.peek': (_ctx, [file]) => {
      const f = file as PascalFile
      if (!f) throw new Error('file.rec.peek: file is undefined')
      if (f.recBuffer === undefined) {
        f.recBuffer = f.recTypeDesc ? createDefaultRec(f.recTypeDesc as TypeDescriptor) : {}
      }
      // 返回缓冲区本身（非拷贝），使 f^.field := x 能修改缓冲区。
      // 整记录读 r := f^ 的值拷贝语义由 compiler 的 rec.copy 包装保证。
      return f.recBuffer
    },

    'file.rec.put': (ctx, [file]) => {
      const f = file as PascalFile
      if (!f) throw new Error('file.rec.put: file is undefined')
      if (!f.writable) {
        throw new Error('put(f) before rewrite: pre-assertion violated (ISO 7185 6.6.5.2)')
      }
      if (f.recBuffer === undefined) {
        throw new Error('put(f) with undefined f^: pre-assertion violated (ISO 7185 6.6.5.2)')
      }
      f.recList!.push(deepCopyValue(f.recBuffer))
      f.recBuffer = f.recTypeDesc ? createDefaultRec(f.recTypeDesc as TypeDescriptor) : {}
      // 同步到外部存储
      ctx.files.set(f.url, createFileBuffer(serializeRecList(f.recList!)))
      return undefined
    },

    'file.rec.get': (_ctx, [file]) => {
      const f = file as PascalFile
      if (!f) throw new Error('file.rec.get: file is undefined')
      if (f.eof) {
        throw new Error('get(f) at EOF: pre-assertion violated (ISO 7185 6.6.5.2)')
      }
      f.recPos!++
      if (f.recPos! < f.recList!.length) {
        // 深拷贝到缓冲区，使 f^.field := x 修改缓冲区而非文件内容
        f.recBuffer = deepCopyValue(f.recList![f.recPos!])
      } else {
        f.eof = true
        f.recBuffer = f.recTypeDesc ? createDefaultRec(f.recTypeDesc as TypeDescriptor) : {}
      }
      return undefined
    },

    'file.rec.eof': (_ctx, [file]) => {
      const f = file as PascalFile
      if (!f) throw new Error('file.rec.eof: file is undefined')
      return f.eof
    },
  }
}

// ============================================================
// 基础：字节读写
// ============================================================

/** 取文件内容（已用区域视图）。url 不存在时返回空数组（不新建 key，保持 ctx.files.has 语义）。 */
function fileBytes(ctx: RuntimeContext, url: string): Uint8Array {
  const buf = ctx.files.get(url)
  return buf ? fileBufferView(buf) : EMPTY_BYTES
}

const EMPTY_BYTES = new Uint8Array(0)

/** 把字节追加到文件外部内容（ctx.files.get(url)）。
 *  unbound 文件（url=''）或 output 句柄：写入 outputBuffer（stdout 语义）。 */
function writeBytes(ctx: RuntimeContext, f: PascalFile, bytes: Uint8Array): void {
  if (!f.url) {
    // unbound 文件 → stdout（output 程序参数的 impl 行为）
    ctx.outputBuffer.push(decodeUtf8(bytes))
    return
  }
  let buf = ctx.files.get(f.url)
  if (!buf) {
    buf = createFileBuffer()
    ctx.files.set(f.url, buf)
  }
  appendFileBytes(buf, bytes)
}

function resetFile(ctx: RuntimeContext, f: PascalFile): void {
  const content = fileBytes(ctx, f.url)
  f.offset = 0
  f.eof = content.length === 0
  f.writable = false
}

function rewriteFile(ctx: RuntimeContext, f: PascalFile): void {
  // ISO 6.6.5.2: rewrite 擦除现有外部文件
  ctx.files.set(f.url, createFileBuffer())
  f.offset = 0
  f.eof = true
  f.writable = true
}

function getFile(ctx: RuntimeContext, f: PascalFile): void {
  // ISO 6.6.5.2 get(f) pre-assertion: f0.M = Inspection 且 f0.R 非空（not eof）
  if (f.eof) {
    throw new Error('get(f) at EOF: pre-assertion violated (ISO 7185 6.6.5.2: f0.R must not be empty)')
  }
  const content = fileBytes(ctx, f.url)
  f.offset++
  if (f.offset >= content.length) {
    f.eof = true
  }
}

function peekFile(ctx: RuntimeContext, f: PascalFile): string {
  const content = fileBytes(ctx, f.url)
  if (f.eof || f.offset >= content.length) {
    // ISO 7185 6.9.8: EOF 后 f^ 未定义；默认报错。
    throw new Error('F^ accessed at EOF: undefined behavior (ISO 7185 6.9.8)')
  }
  const ch = content[f.offset] & 0xff
  // ISO Pascal EOLN 时 F^ 返回空格（行结束符视为空格）
  if (ch === 10 || ch === 13) return ' '
  return String.fromCharCode(ch)
}

function readFilelnSkip(ctx: RuntimeContext, f: PascalFile): void {
  if (f.eof) return
  const content = fileBytes(ctx, f.url)
  while (f.offset < content.length) {
    const ch = content[f.offset]
    f.offset++
    if (ch === 10 || ch === 13) break
  }
  if (f.offset >= content.length) {
    f.eof = true
  }
}

// ============================================================
// 从文件读取 token / char / int / real / bool / str
// ============================================================

function readFileToken(ctx: RuntimeContext, f: PascalFile): string {
  const content = fileBytes(ctx, f.url)
  // 跳过空白
  while (f.offset < content.length) {
    const ch = content[f.offset]
    if (ch === 32 || ch === 10 || ch === 13 || ch === 9) {
      f.offset++
      continue
    }
    break
  }
  // 读取 token
  const chars: string[] = []
  while (f.offset < content.length) {
    const ch = content[f.offset]
    if (ch === 32 || ch === 10 || ch === 13 || ch === 9 || ch === 0) break
    chars.push(String.fromCharCode(ch))
    f.offset++
  }
  if (f.offset >= content.length) {
    f.eof = true
  }
  return chars.join('')
}

function readFileInt(ctx: RuntimeContext, f: PascalFile): number {
  const tok = readFileToken(ctx, f)
  return tok ? parseInt(tok, 10) | 0 : 0
}

function readFileReal(ctx: RuntimeContext, f: PascalFile): number {
  const tok = readFileToken(ctx, f)
  return tok ? parseFloat(tok) : 0
}

function readFileBool(ctx: RuntimeContext, f: PascalFile): boolean {
  const tok = readFileToken(ctx, f).toLowerCase()
  return tok === 'true' || tok === 't'
}

function readFileChar(ctx: RuntimeContext, f: PascalFile): string {
  const content = fileBytes(ctx, f.url)
  if (f.eof || f.offset >= content.length) return '\x00'
  const ch = content[f.offset]
  f.offset++
  if (f.offset >= content.length) {
    f.eof = true
  }
  return String.fromCharCode(ch)
}

function readFileStr(ctx: RuntimeContext, f: PascalFile): string {
  return readFileToken(ctx, f)
}

// ============================================================
// file of record 序列化（ISO 7185 6.4.3.5）
// ============================================================

/** record 文件序列化的 magic prefix，用于区分文本/record 文件 */
const REC_FILE_MAGIC = '\x00PASCAL_TS_REC\x00'

function serializeRecList(recList: unknown[]): Uint8Array {
  const json = JSON.stringify(recList)
  return encodeUtf8(REC_FILE_MAGIC + json)
}

function deserializeRecList(content: Uint8Array): unknown[] {
  if (content.length === 0) return []
  const text = decodeUtf8(content)
  if (!text.startsWith(REC_FILE_MAGIC)) return []
  const json = text.slice(REC_FILE_MAGIC.length)
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function resetRecFile(ctx: RuntimeContext, f: PascalFile, typeDesc?: TypeDescriptor): void {
  const content = fileBytes(ctx, f.url)
  f.recTypeDesc = typeDesc
  f.recList = deserializeRecList(content)
  f.recPos = 0
  f.writable = false
  f.eof = f.recList.length === 0
  // ISO 7185 6.6.5.2 reset: f^ 指向第一个组件（若有）。
  // 深拷贝 recList[0] 到缓冲区，使 f^.field := x 修改缓冲区而非文件内容。
  if (f.recList.length > 0) {
    f.recBuffer = deepCopyValue(f.recList[0])
  } else {
    f.recBuffer = typeDesc ? createDefaultRec(typeDesc) : {}
  }
}

function rewriteRecFile(ctx: RuntimeContext, f: PascalFile, typeDesc?: TypeDescriptor): void {
  ctx.files.set(f.url, createFileBuffer())
  f.recTypeDesc = typeDesc
  f.recList = []
  f.recPos = 0
  // 初始化缓冲区为默认记录，使 f^.field := x 能直接设置字段。
  // （ISO 7185 中 rewrite 后 f^ 未定义；实际实现给默认值以便字段级赋值。）
  f.recBuffer = typeDesc ? createDefaultRec(typeDesc) : {}
  f.writable = true
  f.eof = true
}

// ============================================================
// UTF-8 编解码辅助
// ============================================================

function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
