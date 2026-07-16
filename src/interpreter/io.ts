/**
 * Pascal 抽象 IO 层
 *
 * - PascalFile：仅含 url 和 offset 的抽象句柄
 * - PascalConsole：控制台 IO
 * - PascalFileOps：文件操作，通过 state.io.file 调用
 * - PascalIO：包含 file 和 console 字段的运行时 IO
 *
 * createDefaultIO() 全部方法抛异常，必须自定义才能使用。
 * createRecordFileOps(files) 接受用户自定义的 Map<string, Uint8Array>。
 *   用户可以提前定义文件内容，程序执行后 Map 会被更新以反映写入结果。
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
  assign(file: PascalFile, name: string): void
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
  throw new Error(
    `IO.${method} is not implemented. Customize state.io to provide an implementation.`
  )
}

function createDefaultFileOps(): PascalFileOps {
  return {
    reset() {
      throwNotImplemented('file.reset')
    },
    rewrite() {
      throwNotImplemented('file.rewrite')
    },
    get() {
      throwNotImplemented('file.get')
    },
    put() {
      throwNotImplemented('file.put')
    },
    close() {
      throwNotImplemented('file.close')
    },
    assign() {
      throwNotImplemented('file.assign')
    },
    bufferChar() {
      throwNotImplemented('file.bufferChar')
    },
    eof() {
      throwNotImplemented('file.eof')
    },
    eoln() {
      throwNotImplemented('file.eoln')
    },
    readln() {
      throwNotImplemented('file.readln')
    },
    write() {
      throwNotImplemented('file.write')
    },
    writeln() {
      throwNotImplemented('file.writeln')
    },
  }
}

function createDefaultConsole(): PascalConsole {
  return {
    write() {
      throwNotImplemented('console.write')
    },
    writeln() {
      throwNotImplemented('console.writeln')
    },
    read() {
      throwNotImplemented('console.read')
    },
    readln() {
      throwNotImplemented('console.readln')
    },
    eof() {
      throwNotImplemented('console.eof')
    },
    eoln() {
      throwNotImplemented('console.eoln')
    },
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
// Record 模式文件实现：用户提供 Map<string, Uint8Array>
// key = file.url, value = 文件原始字节内容
// 写入时自动回写到 Map
// ============================================================================

interface RecordFileState {
  offset: number
  eof: boolean
  writable: boolean
  lines: string[]
  currentLine: string
}

export function createRecordFileOps(files: Map<string, Uint8Array>): PascalFileOps {
  const handleState = new WeakMap<PascalFile, RecordFileState>()

  function getState(file: PascalFile): RecordFileState {
    let s = handleState.get(file)
    if (!s) {
      const content = files.get(file.url) || new Uint8Array(0)
      s = { offset: 0, eof: content.length === 0, writable: false, lines: [], currentLine: '' }
      handleState.set(file, s)
    }
    return s
  }

  function currentContent(file: PascalFile): Uint8Array {
    return files.get(file.url) || new Uint8Array(0)
  }

  function writeBack(file: PascalFile): void {
    const s = getState(file)
    const text = s.lines.join('\n') + (s.lines.length > 0 ? '\n' : '')
    files.set(file.url, new TextEncoder().encode(text))
  }

  return {
    reset(file: PascalFile): void {
      const s = getState(file)
      const content = files.get(file.url) || new Uint8Array(0)
      s.offset = 0
      s.eof = content.length === 0
      s.writable = false
      s.currentLine = ''
    },

    rewrite(file: PascalFile): void {
      const s = getState(file)
      files.set(file.url, new Uint8Array(0))
      s.offset = 0
      s.eof = true
      s.writable = true
      s.lines = []
      s.currentLine = ''
    },

    get(file: PascalFile): void {
      const s = getState(file)
      if (s.eof) return
      const content = currentContent(file)
      s.offset++
      if (s.offset >= content.length) {
        s.eof = true
      }
    },

    put(_file: PascalFile): void {},

    close(file: PascalFile): void {
      const s = getState(file)
      if (s.currentLine.length > 0) {
        s.lines.push(s.currentLine)
        s.currentLine = ''
      }
      writeBack(file)
    },

    assign(file: PascalFile, name: string): void {
      file.url = name
      handleState.delete(file)
    },

    bufferChar(file: PascalFile): number {
      const s = getState(file)
      const content = currentContent(file)
      if (s.eof || s.offset >= content.length) return 0
      return content[s.offset] & 0xff
    },

    eof(file: PascalFile): boolean {
      return getState(file).eof
    },

    eoln(file: PascalFile): boolean {
      const s = getState(file)
      const content = currentContent(file)
      if (s.eof || s.offset >= content.length) return true
      return content[s.offset] === 10
    },

    readln(file: PascalFile): void {
      const s = getState(file)
      if (s.eof) return
      const content = currentContent(file)
      while (s.offset < content.length) {
        const ch = content[s.offset]
        s.offset++
        if (ch === 10) break
      }
      if (s.offset >= content.length) {
        s.eof = true
      }
    },

    write(file: PascalFile, text: string): void {
      const s = getState(file)
      if (!s.writable) {
        throw new Error('Cannot write to file that is not opened for writing (use REWRITE first)')
      }
      s.currentLine += text
    },

    writeln(file: PascalFile): void {
      const s = getState(file)
      if (!s.writable) {
        throw new Error('Cannot write to file that is not opened for writing (use REWRITE first)')
      }
      s.lines.push(s.currentLine)
      s.currentLine = ''
      writeBack(file)
    },
  }
}

// ============================================================================
// 回调模式控制台实现：两个回调函数
// ============================================================================

export function createCallbackConsole(
  onWrite: (text: string) => void,
  onRead: () => string
): PascalConsole {
  return {
    write(text: string) {
      onWrite(text)
    },
    writeln() {
      onWrite('\n')
    },
    read() {
      return onRead()
    },
    readln() {
      return onRead()
    },
    eof() {
      return false
    },
    eoln() {
      return false
    },
  }
}
