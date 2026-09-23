import { createMemoryFileStore, rtKeys } from '@jitex/runtime'
import type { ByteHost, PascalFile, PascalFileStore, RunState, SyscallHandler } from '@jitex/runtime'
import type { SyscallRewriteTable } from '@jitex/pascal-to-js'

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

export function bytesToString(bytes: Uint8Array): string {
  return textDecoder.decode(bytes)
}
export function stringToBytes(str: string): Uint8Array {
  return textEncoder.encode(str)
}

export function readTextFile(path: string): Promise<string> {
  return Deno.readTextFile(path)
}

export function readFile(path: string) {
  return Deno.readFile(path)
}

/**
 * TeX 依赖的外部过程 / 函数实现。
 *
 * 只保留 `extra.*`：这几个对应 TeX 源码里声明为 external 的例程
 * （break / close / breakin / erstat）。
 *
 * 文件与 record 的语义（reset 打开失败时句柄保持未初始化、record 的字节
 * 布局、`file of byte` 的逐字节写出等）已由 pascal-to-js 的 `runtime.*`
 * 原语承担，这里不再覆盖。
 */
export const extraSyscalls: Record<string, SyscallHandler> = {
  'extra.break': () => {
  },
  'extra.close': (ctx) => {
    ctx.debugLog.push('extra.close')
  },
  'extra.breakIn': (ctx) => {
    ctx.debugLog.push('extra.breakIn')
  },
  'extra.erStat': (ctx, file) => {
    const pascalFile = file as PascalFile
    const result = pascalFile.value !== undefined ? 0 : 1
    ctx.debugLog.push('extra.erStat = ' + result)
    return result
  },
}

// 具名文件打开（TeX 方言的 reset(f, name, opts) / rewrite(f, name, opts)）
//
// ISO 7185 6.6.5.2 的 reset / rewrite 只接受一个 file-variable 实参，不带 file-name。
// 带 file-name 的形式以 rewrite 扩展接管（覆盖同名 lowering.* key）：
//   - ISO 形式（file-variable + 类型描述）交回内部终态 key；
//   - 方言形式改写成宿主侧注入的 openin / openout（选项实参丢弃）。
// 编译器内部表对非 ISO 形式默认报错，这里的覆盖使方言形式合法化。

/** TeX 方言的文件打开：以 rewrite 扩展覆盖 lowering 侧的无本体调用 key */
export const fileOpenRewriters: SyscallRewriteTable = {
  // key 为 lowering 统一产出的 `lowering.call.<小写名>`；实参布局 = (值, 类型描述) 平铺，
  // 故 ISO 单实参形式长度为 2，方言形式（带 file-name）长度 > 2
  ['lowering.call.reset']: (sys) => {
    if (sys.args.length === 2) {
      return { kind: 'syscall', key: rtKeys.fileReset, args: [sys.args[0]] }
    }
    return { kind: 'syscall', key: 'extra.openIn', args: [sys.args[0], sys.args[2]] }
  },
  ['lowering.call.rewrite']: (sys) => {
    if (sys.args.length === 2) {
      return { kind: 'syscall', key: rtKeys.fileRewrite, args: [sys.args[0]] }
    }
    return { kind: 'syscall', key: 'extra.openOut', args: [sys.args[0], sys.args[2]] }
  },
}

const fileNameOf = (name: unknown): string => bytesToString((name as ByteHost).bytes).trim()

/** openin / openout 的运行期实现：按名字在 ctx.files 中查找（或新建）并绑定到句柄 */
export const runtimeFileSyscalls: Record<string, SyscallHandler> = {
  'extra.openIn': (ctx, file, name) => {
    const key = fileNameOf(name)
    ctx.debugLog.push('extra.openIn ' + key)
    const p = file as PascalFile
    const store = ctx.files.get(key)
    p.value = store
    if (store !== undefined) {
      store.seek(0)
      store.setMode('inspection')
    }
    return undefined
  },
  'extra.openOut': (ctx, file, name) => {
    const p = file as PascalFile
    const key = fileNameOf(name)
    ctx.debugLog.push('extra.openOut ' + key)
    let store = ctx.files.get(key)
    if (store === undefined) {
      store = createMemoryFileStore() as PascalFileStore
      ctx.files.set(key, store)
    }
    p.value = store
    store.clear()
    store.seek(0)
    store.setMode('generation')
    return undefined
  },
}

export class ConsoleFile implements PascalFileStore {
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

  peekBytes(_size: number): Uint8Array | undefined {
    throw new Error('peekBytes not supported on ConsoleFile')
  }

  advanceBy(_n: number): void {
    throw new Error('advanceBy not supported on ConsoleFile')
  }

  getData(): Uint8Array {
    return stringToBytes(this.getOutput())
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

  /** 当前行是否已有内容且以非 end-of-line 字符结尾（ISO 6.9.5 page 的隐式 writeln 判定） */
  currentLineHasContent(): boolean {
    const last = this.output[this.output.length - 1]
    if (last === undefined || last.length === 0) {
      return false
    }
    const ch = last[last.length - 1]
    return ch !== '\n' && ch !== '\r'
  }
}

export async function getTripChFile() {
  return await readTextFile('./resources/jitex/trip.ch')
}

export function readTextFromState(
  state: RunState,
  key: string,
): string | undefined {
  const value = state.files.get(key)
  if (value === undefined) {
    return undefined
  }
  return bytesToString(value.getData())
}

export function readBytesFromState(
  state: RunState,
  key: string,
): Uint8Array | undefined {
  const value = state.files.get(key)
  if (value === undefined) {
    return undefined
  }
  return value.getData()
}
