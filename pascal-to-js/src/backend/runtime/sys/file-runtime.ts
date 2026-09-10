/*
 * 文件原语：runtime.file.*
 *
 * 设计要点：
 *   - **不接类型参数**。句柄（PascalFile）在 create 时已带 `type: TypeDescriptor`，
 *     runtime 据 `f.type.elem.tag` 自行区分「文本」与「二进制（record）」行为。
 *   - key 与 Pascal 原生 io 过程一一对应：reset / rewrite / get / put / read / write /
 *     readln / writeln / eof / eoln / page / peek(f^)。
 *   - rewrite 只负责「值 → 文件单位」的转换（convert.*）；语义（如 read = 读+推进）
 *     由本文件承担。
 */

import { rtKeys } from '@/middle/rewrite/runtime-keys.ts'
import { isByteScalar } from '@/middle/rewrite/type-layout.ts'
import type { PascalFile, PascalFileStore, RuntimeContext, SyscallHandler, TextFile } from '../runtime-type.ts'
import { bytesToString, encodeUtf8 } from '../runtime-util.ts'
import { MemoryTextFile } from './memory-text-file.ts'

/** byte 版 record 存储的接口（与旧 RecordFile 的差别：记录是 Uint8Array） */
export interface RecStore {
  getType(): unknown
  setType(t: unknown): void
  seek(p: number): void
  peekRecord(): Uint8Array | undefined
  advance(): void
  writeRecord(): void
  setBuffer(r: Uint8Array): void
  getBuffer(): Uint8Array | undefined
  clear(): void
  setMode(m: 'inspection' | 'generation'): void
  getMode(): 'inspection' | 'generation'
  hasMore(): boolean
  getRecords(): Uint8Array[]
}

/** 二进制 record 文件：每条记录是一段字节 */
export class ByteRecordFile implements RecStore {
  private records: Uint8Array[] = []
  private pos = 0
  private buffer: Uint8Array | undefined
  private mode: 'inspection' | 'generation' = 'inspection'
  private type: unknown

  constructor(initial?: Uint8Array[]) {
    if (initial) {
      this.records = initial.slice()
    }
  }

  getType(): unknown {
    return this.type
  }
  setType(t: unknown): void {
    this.type = t
  }
  seek(p: number): void {
    this.pos = p
  }
  peekRecord(): Uint8Array | undefined {
    return this.records[this.pos]
  }
  advance(): void {
    this.pos++
  }
  writeRecord(): void {
    if (this.buffer !== undefined) {
      this.records.push(this.buffer)
      this.buffer = undefined
    }
  }
  setBuffer(r: Uint8Array): void {
    this.buffer = r
  }
  getBuffer(): Uint8Array | undefined {
    return this.buffer
  }
  clear(): void {
    this.records = []
    this.pos = 0
    this.buffer = undefined
  }
  setMode(m: 'inspection' | 'generation'): void {
    this.mode = m
  }
  getMode(): 'inspection' | 'generation' {
    return this.mode
  }
  hasMore(): boolean {
    return this.pos < this.records.length
  }
  getRecords(): Uint8Array[] {
    return this.records
  }
}

// ============================================================
// 辅助
// ============================================================

function isRec(f: PascalFile): boolean {
  return f.type?.elem?.tag === 'rec'
}

/**
 * 二进制字节文件（`packed file of byte`）：元素是单字节标量。
 * 这类文件按 `Uint8Array` 逐字节语义处理，不做行结束符 / 编码转换
 * （TeX 的 `dvi_file`、`tfm_file`）。
 */
function isByteFile(f: PascalFile): boolean {
  return isByteScalar(f.type?.elem)
}

function textStore(f: PascalFile): TextFile {
  return f.value as unknown as TextFile
}

function recStore(f: PascalFile): RecStore {
  return f.value as unknown as RecStore
}

/** 默认 input / output（f 为 null 时） */
function defaultStore(ctx: RuntimeContext, isOutput: boolean): TextFile {
  const store = ctx.files.get(isOutput ? 'OUTPUT' : 'INPUT')
  if (store === undefined) {
    throw new Error(isOutput ? 'OUTPUT not defined' : 'INPUT not defined')
  }
  return store as unknown as TextFile
}

function pick(ctx: RuntimeContext, f: unknown, isOutput: boolean): TextFile {
  return f === null || f === undefined ? defaultStore(ctx, isOutput) : textStore(f as PascalFile)
}

/**
 * 处理非 ISO 的 `reset(f, name)` / `rewrite(f, name)` 形式：
 * 按名字在 ctx.files 中查找并绑定到句柄。
 *
 * - `create=false`（reset，输入）：文件不存在即**打开失败**，句柄保持
 *   `value === undefined`，由 `erstat(f)` 报告（TeX 的 `b_open_in` 依赖此语义）。
 * - `create=true`（rewrite，输出）：文件不存在则新建。
 */
function bindByName(
  ctx: RuntimeContext,
  p: PascalFile,
  fileName: unknown,
  tag: string,
  create: boolean,
): boolean {
  if (fileName === undefined || fileName === null) {
    return true
  }
  const name = typeof fileName === 'string'
    ? fileName.trim()
    : bytesToString(fileName as Uint8Array).trim()
  ctx.debugLog.push(`${tag} ${name}`)
  let store = ctx.files.get(name)
  if (store === undefined) {
    if (!create) {
      p.value = undefined
      return false
    }
    store = (isRec(p) ? new ByteRecordFile() : new MemoryTextFile()) as unknown as PascalFileStore
    ctx.files.set(name, store)
  }
  p.value = store
  return true
}

/** 读一个字符单位；行结束符消耗后返回空格（char 用 ord 值表示） */
function readCharUnit(store: TextFile): number {
  if (!store.hasMore()) {
    return 32
  }
  const b = store.peekByte()!
  if (b === 13 || b === 10) {
    store.advance()
    if (b === 13 && store.hasMore() && store.peekByte() === 10) {
      store.advance()
    }
    return 32
  }
  store.advance()
  return b
}

/** 读一个 token（跳过前导空白，读到下一空白） */
function readTokenUnit(store: TextFile): string {
  while (store.hasMore()) {
    const b = store.peekByte()!
    if (b === 32 || b === 9 || b === 10 || b === 13 || b === 0) {
      store.advance()
      if (b === 13 && store.hasMore() && store.peekByte() === 10) {
        store.advance()
      }
      continue
    }
    break
  }
  const bytes: number[] = []
  while (store.hasMore()) {
    const b = store.peekByte()!
    if (b === 32 || b === 9 || b === 10 || b === 13 || b === 0) {
      break
    }
    bytes.push(b)
    store.advance()
  }
  return bytesToString(new Uint8Array(bytes))
}

function skipLine(store: TextFile): void {
  while (store.hasMore()) {
    const b = store.peekByte()!
    store.advance()
    if (b === 13 || b === 10) {
      if (b === 13 && store.hasMore() && store.peekByte() === 10) {
        store.advance()
      }
      break
    }
  }
}

// ============================================================

export function fileRuntimeSyscalls(): Record<string, SyscallHandler> {
  return {
    // ---------- reset / rewrite ----------
    // 第二参数（非 ISO 的 `reset(f, name)` 形式）用于按名字绑定/新建文件存储
    [rtKeys.fileReset]: (ctx, [f, fileName]) => {
      const p = f as PascalFile
      if (!bindByName(ctx, p, fileName, 'file.reset', false)) {
        // 具名输入文件不存在：打开失败，句柄保持未初始化
        return undefined
      }
      const store = p.value
      if (store === undefined) {
        throw new Error('file is not init')
      }
      store.seek(0)
      store.setMode('inspection')
      if (isRec(p)) {
        recStore(p).setType(p.type.elem)
      }
      return undefined
    },
    [rtKeys.fileRewrite]: (ctx, [f, fileName]) => {
      const p = f as PascalFile
      bindByName(ctx, p, fileName, 'file.rewrite', true)
      const store = p.value
      if (store === undefined) {
        throw new Error('file is not init')
      }
      store.clear()
      store.seek(0)
      store.setMode('generation')
      if (isRec(p)) {
        recStore(p).setType(p.type.elem)
      }
      return undefined
    },

    // ---------- 推进 / 查看当前元素 ----------
    [rtKeys.fileGet]: (_ctx, [f]) => {
      const p = f as PascalFile
      if (isRec(p)) {
        const rs = recStore(p)
        if (!rs.hasMore()) {
          throw new Error('get(f) at EOF: pre-assertion violated')
        }
        rs.advance()
        return undefined
      }
      const store = textStore(p)
      // ISO 6.6.5.2: get(f) 的 pre-assertion 是 not eof(f)
      if (!store.hasMore()) {
        throw new Error('get(f) at EOF: pre-assertion violated')
      }
      // 字节文件：单纯推进，不做行结束符处理
      if (isByteFile(p)) {
        store.advance()
        return undefined
      }
      readCharUnit(store)
      return undefined
    },
    [rtKeys.filePeek]: (_ctx, [f, size]) => {
      const p = f as PascalFile
      if (isRec(p)) {
        const rs = recStore(p)
        // 写模式：f^ 恒为当前缓冲区（每次 put 后重建），保证多次 f^.field := x 互不干扰
        if (rs.getMode() === 'generation') {
          const buf = rs.getBuffer()
          if (buf !== undefined) {
            return buf
          }
          const nb = new Uint8Array((size as number) ?? 0)
          rs.setBuffer(nb)
          return nb
        }
        // 读模式：当前记录
        const rec = rs.peekRecord()
        if (rec !== undefined) {
          return rec
        }
        const buf = new Uint8Array((size as number) ?? 0)
        rs.setBuffer(buf)
        return buf
      }
      const store = textStore(p)
      const b = store.peekByte()
      if (b === undefined) {
        // 字节文件在 EOF 处取 0（WEB 的 fbyte 语义），文本文件取空格
        return isByteFile(p) ? 0 : 32
      }
      return b
    },

    // ---------- 写一个元素 ----------
    // unit 存在 → `f^ := x`（设缓冲区）；unit 缺失 → `put(f)`（把缓冲区写入文件）
    [rtKeys.filePut]: (_ctx, [f, unit]) => {
      const p = f as PascalFile
      if (isRec(p)) {
        const rs = recStore(p)
        if (unit !== undefined) {
          rs.setBuffer(unit as Uint8Array)
        } else {
          rs.writeRecord()
        }
        return undefined
      }
      if (unit !== undefined) {
        const store = textStore(p)
        if (isByteFile(p)) {
          store.writeByte((unit as number) & 0xff)
        } else if (typeof unit === 'number' && p.type?.elem?.tag === 'char') {
          // text file 的 f^ := ch：char 用 ord 值表示，需转回字符写
          store.writeBytes(encodeUtf8(String.fromCharCode(unit)))
        } else {
          writeText(store, unit)
        }
      }
      return undefined
    },

    // ---------- 读取（语义级：读 + 推进）----------
    [rtKeys.fileReadChar]: (ctx, [f]) => {
      if (f === null || f === undefined) {
        return readCharUnit(defaultStore(ctx, false))
      }
      const p = f as PascalFile
      if (isRec(p)) {
        const rs = recStore(p)
        const rec = rs.peekRecord()
        rs.advance()
        return rec ?? new Uint8Array(0)
      }
      const store = textStore(p)
      // 字节文件：原样取一个字节
      if (isByteFile(p)) {
        const b = store.peekByte() ?? 0
        store.advance()
        return b
      }
      return readCharUnit(store)
    },
    [rtKeys.fileReadToken]: (ctx, [f]) => {
      if (f === null || f === undefined) {
        return readTokenUnit(defaultStore(ctx, false))
      }
      const p = f as PascalFile
      return readTokenUnit(textStore(p))
    },

    // ---------- 写（语义级：写 + 推进）----------
    [rtKeys.fileWrite]: (ctx, [f, unit]) => {
      if (f === null || f === undefined) {
        writeText(defaultStore(ctx, true), unit)
        return undefined
      }
      const p = f as PascalFile
      if (isRec(p)) {
        const rs = recStore(p)
        rs.setBuffer(unit as Uint8Array)
        rs.writeRecord()
        return undefined
      }
      const store = textStore(p)
      // 字节文件：值即字节，原样写出
      if (isByteFile(p)) {
        store.writeByte((unit as number) & 0xff)
        return undefined
      }
      writeText(store, unit)
      return undefined
    },

    // ---------- 行 / 页 ----------
    [rtKeys.fileWriteln]: (ctx, [f]) => {
      const store = pick(ctx, f, true)
      store.writeByte(10)
      return undefined
    },
    [rtKeys.fileReadln]: (ctx, [f]) => {
      const store = pick(ctx, f, false)
      skipLine(store)
      return undefined
    },
    [rtKeys.filePage]: (ctx, [f]) => {
      const store = pick(ctx, f, true)
      store.writeByte(12)
      return undefined
    },

    // ---------- 状态查询 ----------
    [rtKeys.fileEof]: (ctx, [f]) => {
      if (f === null || f === undefined) {
        return defaultStore(ctx, false).hasMore() ? 0 : 1
      }
      const p = f as PascalFile
      if (isRec(p)) {
        return recStore(p).hasMore() ? 0 : 1
      }
      return textStore(p).hasMore() ? 0 : 1
    },
    [rtKeys.fileEoln]: (ctx, [f]) => {
      const store = pick(ctx, f, false)
      if (!store.hasMore()) {
        return 1
      }
      const b = store.peekByte()
      return b === 10 || b === 13 ? 1 : 0
    },

    // ---------- 构造 / 绑定 ----------
    [rtKeys.fileCreate]: (_ctx, [type]) => ({ kind: 'file', value: undefined, type } as PascalFile),
    [rtKeys.programFileUrl]: (ctx, [f, name]) => {
      const p = f as PascalFile
      const key = name as string
      const url = ctx.programFileUrls[key] ?? key
      let fileStore = ctx.files.get(url)
      if (fileStore === undefined) {
        // record 文件用字节版存储；其余用文本存储
        fileStore = (isRec(p) ? new ByteRecordFile() : new MemoryTextFile()) as unknown as PascalFileStore
      }
      p.value = fileStore
      ctx.files.set(key, fileStore)
      return undefined
    },
  }
}

// ============================================================

/** 文本写入：string → UTF-8 字节；Uint8Array → 原样 */
function writeText(store: TextFile, unit: unknown): void {
  if (unit instanceof Uint8Array) {
    store.writeBytes(unit)
    return
  }
  store.writeBytes(encodeUtf8(String(unit)))
}
