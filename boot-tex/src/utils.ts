import {
  ByteBlockFile,
  type ByteHost,
  MemoryTextFile,
  PascalFile,
  PascalFileStore,
  SyscallHandler,
  TextFile,
} from '@jitex/pascal-to-js'
import { runTanglePascal, transformTangle } from './tangle/build-tangle.ts'
import { createStageOfGetTangleJs } from './tex/build-tex.ts'

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
  'extra.erStat': (_ctx, file) => {
    const pascalFile = file as PascalFile
    return pascalFile.value !== undefined ? 0 : 1
  },
}

// 具名文件打开（TeX 方言的 reset(f, name, opts) / rewrite(f, name, opts)）
//
// ISO 7185 6.6.5.2 的 reset / rewrite 只接受文件变量、不带 file-name，因此这类调用
// 在送入编译器前由 normalizeFileOpen 改写成下面两个注入过程，名字绑定在宿主侧完成。

const isLetter = (c: string): boolean => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
const isDigit = (c: string): boolean => c >= '0' && c <= '9'
const isAlphaNum = (c: string): boolean => isLetter(c) || isDigit(c) || c === '_'
const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r'

/** 跳过 { } 或 (* *) 注释，返回其后位置 */
function skipComment(src: string, from: number): number {
  const parenForm = src[from] === '('
  let i = parenForm ? from + 2 : from + 1
  while (i < src.length && src[i] !== '}' && !(src[i] === '*' && src[i + 1] === ')')) {
    i++
  }
  if (i >= src.length) {
    return src.length
  }
  return src[i] === '}' ? i + 1 : i + 2
}

/** 跳过 '...' 字符串字面量（内部 '' 为转义），返回其后位置 */
function skipString(src: string, from: number): number {
  let i = from + 1
  while (i < src.length) {
    if (src[i] === "'") {
      if (src[i + 1] === "'") {
        i += 2
        continue
      }
      return i + 1
    }
    i++
  }
  return src.length
}

/** 从 '(' 起拆分顶层实参，返回 [右括号之后的位置, 实参文本表] */
function splitActuals(src: string, openParen: number): [number, string[]] {
  const args: string[] = []
  let depth = 0
  let start = openParen + 1
  let i = openParen + 1
  while (i < src.length) {
    const c = src[i]
    if (c === '{' || (c === '(' && src[i + 1] === '*')) {
      i = skipComment(src, i)
      continue
    }
    if (c === "'") {
      i = skipString(src, i)
      continue
    }
    if (c === '(' || c === '[') {
      depth++
    } else if (c === ']') {
      depth--
    } else if (c === ')') {
      if (depth === 0) {
        args.push(src.slice(start, i).trim())
        return [i + 1, args.filter((a) => a.length > 0)]
      }
      depth--
    } else if (c === ',' && depth === 0) {
      args.push(src.slice(start, i).trim())
      start = i + 1
    }
    i++
  }
  return [src.length, args]
}

/**
 * 把 TeX 方言的 `reset(f, name, opts)` / `rewrite(f, name, opts)` 改写为
 * 注入的 `openin(f, name)` / `openout(f, name)`（多余的选项实参丢弃），
 * 使 pascal-to-js 只需处理 ISO 形式的单实参 reset / rewrite。
 */
export function normalizeFileOpen(source: string): string {
  let out = ''
  let i = 0
  while (i < source.length) {
    const c = source[i]
    if (c === '{' || (c === '(' && source[i + 1] === '*')) {
      const next = skipComment(source, i)
      out += source.slice(i, next)
      i = next
      continue
    }
    if (c === "'") {
      const next = skipString(source, i)
      out += source.slice(i, next)
      i = next
      continue
    }
    if (isLetter(c)) {
      let j = i
      while (j < source.length && isAlphaNum(source[j])) {
        j++
      }
      const word = source.slice(i, j)
      const lower = word.toLowerCase()
      if (lower === 'reset' || lower === 'rewrite') {
        let k = j
        while (k < source.length && isSpace(source[k])) {
          k++
        }
        if (source[k] === '(') {
          const [after, args] = splitActuals(source, k)
          if (args.length >= 2) {
            const target = lower === 'reset' ? 'openin' : 'openout'
            out += `${target}${source.slice(j, k)}(${args[0]}, ${args[1]})`
            i = after
            continue
          }
        }
      }
      out += word
      i = j
      continue
    }
    out += c
    i++
  }
  return out
}

const fileNameOf = (name: unknown): string => bytesToString((name as ByteHost).bytes).trim()

/** openin / openout 的运行期实现：按名字在 ctx.files 中查找（或新建）并绑定到句柄 */
export const runtimeFileSyscalls: Record<string, SyscallHandler> = {
  'extra.openIn': (ctx, file, name) => {
    const p = file as PascalFile
    const store = ctx.files.get(fileNameOf(name))
    // 输入文件不存在即打开失败：句柄保持未定义，由 erstat(f) 报告
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
    let store = ctx.files.get(key)
    if (store === undefined) {
      store = (p.fileKind === 'blocks' ? new ByteBlockFile() : new MemoryTextFile()) as PascalFileStore
      ctx.files.set(key, store)
    }
    p.value = store
    store.clear()
    store.seek(0)
    store.setMode('generation')
    return undefined
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
  state: ReturnType<typeof runJs>,
  key: string,
): string | undefined {
  const value = state.files.get(key)
  if (value === undefined) {
    return undefined
  }
  return bytesToString((value as MemoryTextFile).getData())
}

export function readBytesFromState(
  state: ReturnType<typeof runJs>,
  key: string,
): Uint8Array | undefined {
  const value = state.files.get(key)
  if (value === undefined) {
    return undefined
  }
  return (value as MemoryTextFile).getData()
}

