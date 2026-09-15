/*
 * 文件原语：runtime.file.*
 *
 * 设计要点：
 *   - **不接类型参数**。句柄（PascalFile）在 create 时已带编译期算定的
 *     `fileKind`（存储形态：text / bytes / blocks），runtime 据此区分读写路径，
 *     不做 Pascal 类型判断。
 *   - key 与 Pascal 原生 io 过程一一对应：reset / rewrite / get / put / read / write /
 *     readln / writeln / eof / eoln / page / peek(f^)。
 *   - rewrite 只负责「值 → 文件单位」的转换（convert.*）；语义（如 read = 读+推进）
 *     由本文件承担。
 */

import { rtKeys } from '@/middle/rewrite/runtime-keys.ts'
import type {
  BlockStore,
  PascalFile,
  PascalFileStore,
  RuntimeContext,
  SyscallHandler,
  TextFile,
} from '../runtime-type.ts'
import { bytesToString, encodeUtf8 } from '../runtime-util.ts'
import { MemoryTextFile } from './memory-text-file.ts'

/** 定长字节块文件：每块是一段字节 */
export class ByteBlockFile implements BlockStore {
  private blocks: Uint8Array[] = []
  private pos = 0
  private buffer: Uint8Array | undefined
  private mode: 'inspection' | 'generation' = 'inspection'

  constructor(initial?: Uint8Array[]) {
    if (initial) {
      this.blocks = initial.slice()
    }
  }

  seek(p: number): void {
    this.pos = p
  }
  peekBlock(): Uint8Array | undefined {
    return this.blocks[this.pos]
  }
  advance(): void {
    this.pos++
  }
  writeBlock(): void {
    if (this.buffer !== undefined) {
      this.blocks.push(this.buffer)
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
    this.blocks = []
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
    return this.pos < this.blocks.length
  }
  getBlocks(): Uint8Array[] {
    return this.blocks
  }
}

// 辅助

/**
 * 定长字节块文件（元素含 record）：每条记录是一段定长字节。
 */
function isBlockFile(f: PascalFile): boolean {
  return f.fileKind === 'blocks'
}

/**
 * 单字节单位文件（`packed file of byte`）：元素是单字节标量。
 * 这类文件按 `Uint8Array` 逐字节语义处理，不做行结束符 / 编码转换
 * （TeX 的 `dvi_file`、`tfm_file`）。
 */
function isByteFile(f: PascalFile): boolean {
  return f.fileKind === 'bytes'
}

function textStore(f: PascalFile): TextFile {
  return f.value as unknown as TextFile
}

function blockStore(f: PascalFile): BlockStore {
  return f.value as unknown as BlockStore
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
  return f === undefined ? defaultStore(ctx, isOutput) : textStore(f as PascalFile)
}

/**
 * 无 file-name 的 reset / rewrite：按元素类型建立初始存储。
 *
 * ISO 7185 6.6.5.2 把「文件未定义时使用」定为 error，而 reset / rewrite 的作用正是让
 * 文件进入定义状态；未初始化的文件变量在此建立存储（record → 字节记录，
 * 其余 → 文本式单位读写，见 isByteFile 的说明）。
 */
function ensureStore(p: PascalFile): PascalFileStore {
  let store = p.value
  if (store === undefined) {
    store = (isBlockFile(p) ? new ByteBlockFile() : new MemoryTextFile()) as unknown as PascalFileStore
    p.value = store
  }
  return store
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

export function fileRuntimeSyscalls(): Record<string, SyscallHandler> {
  return {
    [rtKeys.fileReset]: (_ctx, f) => {
      const store = ensureStore(f as PascalFile)
      store.seek(0)
      store.setMode('inspection')
      return undefined
    },
    [rtKeys.fileRewrite]: (_ctx, f) => {
      const store = ensureStore(f as PascalFile)
      store.clear()
      store.seek(0)
      store.setMode('generation')
      return undefined
    },

    [rtKeys.fileGet]: (_ctx, f) => {
      const p = f as PascalFile
      if (isBlockFile(p)) {
        const rs = blockStore(p)
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
    [rtKeys.filePeek]: (_ctx, f, size) => {
      const p = f as PascalFile
      if (isBlockFile(p)) {
        const rs = blockStore(p)
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
        const rec = rs.peekBlock()
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

    // unit 存在 → `f^ := x`（设缓冲区）；unit 缺失 → `put(f)`（把缓冲区写入文件）
    [rtKeys.filePut]: (_ctx, f, unit) => {
      const p = f as PascalFile
      if (isBlockFile(p)) {
        const rs = blockStore(p)
        if (unit !== undefined) {
          // ISO 6.6.5.2: 写缓冲区的前置条件是文件处于写状态
          if (rs.getMode() !== 'generation') {
            throw new Error('f^ := x before rewrite: pre-assertion violated')
          }
          // `f^ := x` 是赋值（值语义），x 可能是共享视图（如 mem[k]），
          // 必须深拷贝后落缓冲：否则改 x 会连带改掉已写入的缓冲内容。
          rs.setBuffer((unit as Uint8Array).slice())
        } else {
          if (rs.getMode() !== 'generation') {
            throw new Error('put(f) before rewrite: pre-assertion violated')
          }
          rs.writeBlock()
        }
        return undefined
      }
      if (unit !== undefined) {
        const store = textStore(p)
        if (isByteFile(p)) {
          store.writeByte((unit as number) & 0xff)
        } else {
          writeText(store, unit)
        }
      }
      return undefined
    },

    // 字符来源的 `f^ := ch`：char 以 ord 值承载，需转回字符写
    [rtKeys.filePutCharacter]: (_ctx, f, unit) => {
      const store = textStore(f as PascalFile)
      store.writeBytes(encodeUtf8(String.fromCharCode(unit as number)))
      return undefined
    },

    [rtKeys.fileReadCharacter]: (ctx, f) => {
      if (f === undefined) {
        return readCharUnit(defaultStore(ctx, false))
      }
      const p = f as PascalFile
      if (isBlockFile(p)) {
        const rs = blockStore(p)
        const rec = rs.peekBlock()
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
    [rtKeys.fileReadToken]: (ctx, f) => {
      if (f === undefined) {
        return readTokenUnit(defaultStore(ctx, false))
      }
      const p = f as PascalFile
      return readTokenUnit(textStore(p))
    },

    [rtKeys.fileWrite]: (ctx, f, unit) => {
      if (f === undefined) {
        writeText(defaultStore(ctx, true), unit)
        return undefined
      }
      const p = f as PascalFile
      if (isBlockFile(p)) {
        const rs = blockStore(p)
        rs.setBuffer(unit as Uint8Array)
        rs.writeBlock()
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

    [rtKeys.fileWriteln]: (ctx, f) => {
      const store = pick(ctx, f, true)
      store.writeByte(10)
      return undefined
    },
    [rtKeys.fileReadln]: (ctx, f) => {
      const store = pick(ctx, f, false)
      skipLine(store)
      return undefined
    },
    [rtKeys.filePage]: (ctx, f) => {
      const store = pick(ctx, f, true)
      // ISO 7185 6.9.5: 若 f.L 非空且 f.L.last 不是 end-of-line，page(f) 先隐式 writeln(f)
      if (store.currentLineHasContent()) {
        store.writeByte(10)
      }
      store.writeByte(12)
      return undefined
    },

    [rtKeys.fileEof]: (ctx, f) => {
      if (f === undefined) {
        return defaultStore(ctx, false).hasMore() ? 0 : 1
      }
      const p = f as PascalFile
      if (isBlockFile(p)) {
        return blockStore(p).hasMore() ? 0 : 1
      }
      return textStore(p).hasMore() ? 0 : 1
    },
    [rtKeys.fileEoln]: (ctx, f) => {
      const store = pick(ctx, f, false)
      if (!store.hasMore()) {
        return 1
      }
      const b = store.peekByte()
      return b === 10 || b === 13 ? 1 : 0
    },

    [rtKeys.fileCreate]: (_ctx, kind) => ({ kind: 'file', value: undefined, fileKind: kind } as PascalFile),
    [rtKeys.fileProgramUrl]: (ctx, f, name) => {
      const p = f as PascalFile
      const key = name as string
      const url = ctx.programFileUrls[key] ?? key
      let fileStore = ctx.files.get(url)
      if (fileStore === undefined) {
        // 定长块文件用字节版存储；其余用文本存储
        fileStore = (isBlockFile(p) ? new ByteBlockFile() : new MemoryTextFile()) as unknown as PascalFileStore
      }
      p.value = fileStore
      ctx.files.set(key, fileStore)
      return undefined
    },
  }
}

/** 文本写入：string → UTF-8 字节；Uint8Array → 原样 */
function writeText(store: TextFile, unit: unknown): void {
  if (unit instanceof Uint8Array) {
    store.writeBytes(unit)
    return
  }
  store.writeBytes(encodeUtf8(String(unit)))
}
