/**
 * Pascal 抽象 IO 层
 *
 * - PascalFile：仅含 url 和 offset 的抽象句柄
 * - PascalConsole：控制台 IO，默认无操作
 * - PascalFileOps：文件操作，通过 state.io.file 调用
 * - PascalIO：包含 file 和 console 字段的运行时 IO
 *
 * createDefaultIO() 使用内存实现，可随时替换为网络文件或本地文件。
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
// 默认控制台实现（无操作）
// ============================================================================

function createDefaultConsole(): PascalConsole {
  return {
    write() {},
    writeln() {},
    read() { return '' },
    readln() { return '' },
    eof() { return true },
    eoln() { return true },
  }
}

// ============================================================================
// 默认内存文件实现
// ============================================================================

interface MemoryFileState {
  lines: string[]
  currentLine: number
  currentChar: number
  eof: boolean
  writable: boolean
  writeBuffer: string
}

const fileStates = new WeakMap<PascalFile, MemoryFileState>()

function getState(file: PascalFile): MemoryFileState {
  let state = fileStates.get(file)
  if (!state) {
    state = { lines: [], currentLine: 0, currentChar: 0, eof: true, writable: false, writeBuffer: '' }
    fileStates.set(file, state)
  }
  return state
}

export function createDefaultFileHandle(url: string): PascalFile {
  return { url, offset: 0 }
}

export function createEmptyFile(): PascalFile {
  return { url: '', offset: 0 }
}

export function setMemoryFileContent(file: PascalFile, lines: string[], writable = false): void {
  const state = getState(file)
  state.lines = lines
  state.writable = writable
}

export function getMemoryFileLines(file: PascalFile): string[] {
  return getState(file).lines
}

function createDefaultFileOps(): PascalFileOps {
  return {
    reset(file: PascalFile): void {
      const s = getState(file)
      s.currentLine = 0
      s.currentChar = 0
      s.eof = s.lines.length === 0
      s.writable = false
    },

    rewrite(file: PascalFile): void {
      const s = getState(file)
      s.lines = []
      s.currentLine = 0
      s.currentChar = 0
      s.eof = true
      s.writable = true
      s.writeBuffer = ''
    },

    get(file: PascalFile): void {
      const s = getState(file)
      if (s.eof) return
      s.currentChar++
      if (s.currentChar > s.lines[s.currentLine].length) {
        s.currentLine++
        s.currentChar = 0
        if (s.currentLine >= s.lines.length) {
          s.eof = true
        }
      }
    },

    put(_file: PascalFile): void {
      // PUT 在文本文件中不常用，默认忽略
    },

    close(file: PascalFile): void {
      const s = getState(file)
      if (s.writable && s.writeBuffer.length > 0) {
        s.lines.push(s.writeBuffer)
        s.writeBuffer = ''
      }
    },

    bufferChar(file: PascalFile): number {
      const s = getState(file)
      if (s.eof || s.currentLine >= s.lines.length) return 0
      const line = s.lines[s.currentLine]
      if (s.currentChar >= line.length) return 0
      return line.charCodeAt(s.currentChar) & 0xFF
    },

    eof(file: PascalFile): boolean {
      return getState(file).eof
    },

    eoln(file: PascalFile): boolean {
      const s = getState(file)
      if (s.eof || s.currentLine >= s.lines.length) return true
      return s.currentChar >= s.lines[s.currentLine].length
    },

    readln(file: PascalFile): void {
      const s = getState(file)
      if (s.eof) return
      s.currentLine++
      s.currentChar = 0
      if (s.currentLine >= s.lines.length) {
        s.eof = true
      }
    },

    write(file: PascalFile, text: string): void {
      const s = getState(file)
      if (s.writable) {
        s.writeBuffer += text
      }
    },

    writeln(file: PascalFile): void {
      const s = getState(file)
      if (s.writable) {
        s.lines.push(s.writeBuffer)
        s.writeBuffer = ''
      }
    },
  }
}

export function createDefaultIO(): PascalIO {
  return {
    file: createDefaultFileOps(),
    console: createDefaultConsole(),
  }
}
