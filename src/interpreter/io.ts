/**
 * Pascal 抽象 IO 层
 *
 * - PascalFile：仅含 url 和 offset 的抽象句柄
 * - PascalConsole：控制台 IO
 * - PascalFileOps：文件操作，通过 state.io.file 调用
 * - PascalIO：包含 file 和 console 字段的运行时 IO
 *
 * createDefaultIO() 全部方法抛异常，必须自定义才能使用。
 * createRecordFileOps() 使用 Map<url, Uint8Array> 存储文件数据。
 * createCallbackConsole() 控制台底层依赖两个回调函数。
 */

// ============================================================================
// 抽象 PascalFile 句柄
// ============================================================================

export interface PascalFile {
  url: string
  offset: number
}

// ============================================================================
// 控制台 IO 接口
// ============================================================================

export interface PascalConsole {
  write(text: string): void
  writeln(): void
  read(): string
  readln(): string
  eof(): boolean
  eoln(): boolean
}

// ============================================================================
// 文件操作接口
// ============================================================================

export interface PascalFileOps {
  reset(file: PascalFile): void
  rewrite(file: PascalFile): void
  get(file: PascalFile): void
  put(file: PascalFile): void
  close(file: PascalFile): void
  bufferChar(file: PascalFile): number
  eof(file: PascalFile): boolean
  eoln(file: PascalFile): boolean
  readln(file: PascalFile): void
  write(file: PascalFile, text: string): void
  writeln(file: PascalFile): void
}

// ============================================================================
// 运行时 IO
// ============================================================================

export interface PascalIO {
  file: PascalFileOps
  console: PascalConsole
}

// ============================================================================
// 默认实现：全部抛异常（必须自定义才能使用）
// ============================================================================

function throwNotImplemented(method: string): never {
  throw new Error(`IO.${method} is not implemented. Customize state.io to provide an implementation.`)
}

function createDefaultFileOps(): PascalFileOps {
  return {
    reset() { throwNotImplemented('file.reset') },
    rewrite() { throwNotImplemented('file.rewrite') },
    get() { throwNotImplemented('file.get') },
    put() { throwNotImplemented('file.put') },
    close() { throwNotImplemented('file.close') },
    bufferChar() { throwNotImplemented('file.bufferChar') },
    eof() { throwNotImplemented('file.eof') },
    eoln() { throwNotImplemented('file.eoln') },
    readln() { throwNotImplemented('file.readln') },
    write() { throwNotImplemented('file.write') },
    writeln() { throwNotImplemented('file.writeln') },
  }
}

function createDefaultConsole(): PascalConsole {
  return {
    write() { throwNotImplemented('console.write') },
    writeln() { throwNotImplemented('console.writeln') },
    read() { throwNotImplemented('console.read') },
    readln() { throwNotImplemented('console.readln') },
    eof() { throwNotImplemented('console.eof') },
    eoln() { throwNotImplemented('console.eoln') },
  }
}

export function createDefaultIO(): PascalIO {
  return {
    file: createDefaultFileOps(),
    console: createDefaultConsole(),
  }
}

// ============================================================================
// 工具：创建空文件句柄
// ============================================================================

export function createEmptyFile(): PascalFile {
  return { url: '', offset: 0 }
}

export function createDefaultFileHandle(url: string): PascalFile {
  return { url, offset: 0 }
}

// ============================================================================
// Record 模式文件实现：底层是 Map<string, Uint8Array>
// key = file.url, value = 文件原始字节内容
// ============================================================================

interface RecordFileState {
  /** 文件原始字节 */
  content: Uint8Array
  /** 当前读取位置（按行抽象，实际按字节推进） */
  offset: number
  /** 是否已到达文件末尾 */
  eof: boolean
  /** 是否可写 */
  writable: boolean
  /** 写入缓冲区（按行追加） */
  lines: string[]
  /** 当前正在累积的行 */
  currentLine: string
}

const recordFileStore = new Map<string, RecordFileState>()

function getRecordState(file: PascalFile): RecordFileState {
  let state = recordFileStore.get(file.url)
  if (!state) {
    state = { content: new Uint8Array(0), offset: 0, eof: true, writable: false, lines: [], currentLine: '' }
    recordFileStore.set(file.url, state)
  }
  return state
}

export function setRecordFileContent(url: string, content: Uint8Array): void {
  const state = getRecordState({ url, offset: 0 })
  state.content = content
  state.eof = content.length === 0
}

export function getRecordFileLines(url: string): string[] {
  const state = recordFileStore.get(url)
  return state ? state.lines : []
}

export function createRecordFileHandle(url: string): PascalFile {
  return { url, offset: 0 }
}

export function createRecordFileOps(): PascalFileOps {
  return {
    reset(file: PascalFile): void {
      const s = getRecordState(file)
      s.offset = 0
      s.eof = s.content.length === 0
      s.writable = false
      s.currentLine = ''
    },

    rewrite(file: PascalFile): void {
      const s = getRecordState(file)
      s.content = new Uint8Array(0)
      s.offset = 0
      s.eof = true
      s.writable = true
      s.lines = []
      s.currentLine = ''
    },

    get(file: PascalFile): void {
      const s = getRecordState(file)
      if (s.eof) return
      s.offset++
      if (s.offset >= s.content.length) {
        s.eof = true
      }
    },

    put(_file: PascalFile): void {
    },

    close(file: PascalFile): void {
      const s = getRecordState(file)
      if (s.currentLine.length > 0) {
        s.lines.push(s.currentLine)
        s.currentLine = ''
      }
    },

    bufferChar(file: PascalFile): number {
      const s = getRecordState(file)
      if (s.eof || s.offset >= s.content.length) return 0
      return s.content[s.offset] & 0xFF
    },

    eof(file: PascalFile): boolean {
      return getRecordState(file).eof
    },

    eoln(file: PascalFile): boolean {
      const s = getRecordState(file)
      if (s.eof || s.offset >= s.content.length) return true
      return s.content[s.offset] === 10 // '\n'
    },

    readln(file: PascalFile): void {
      const s = getRecordState(file)
      if (s.eof) return
      while (s.offset < s.content.length) {
        const ch = s.content[s.offset]
        s.offset++
        if (ch === 10) break // '\n'
      }
      if (s.offset >= s.content.length) {
        s.eof = true
      }
    },

    write(file: PascalFile, text: string): void {
      const s = getRecordState(file)
      if (!s.writable) {
        throw new Error('Cannot write to file that is not opened for writing (use REWRITE first)')
      }
      s.currentLine += text
    },

    writeln(file: PascalFile): void {
      const s = getRecordState(file)
      if (!s.writable) {
        throw new Error('Cannot write to file that is not opened for writing (use REWRITE first)')
      }
      s.lines.push(s.currentLine)
      s.currentLine = ''
    },
  }
}

// ============================================================================
// 回调模式控制台实现：两个回调函数
// ============================================================================

export function createCallbackConsole(
  onWrite: (text: string) => void,
  onRead: () => string,
): PascalConsole {
  return {
    write(text: string) { onWrite(text) },
    writeln() { onWrite('\n') },
    read() { return onRead() },
    readln() { return onRead() },
    eof() { return false },
    eoln() { return false },
  }
}
