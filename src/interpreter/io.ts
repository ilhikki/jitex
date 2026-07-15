/**
 * Pascal 抽象 IO 层
 *
 * - PascalFile：仅含 url 和 offset 的抽象句柄
 * - PascalConsole：控制台 IO
 * - PascalFileOps：文件操作，通过 state.io.file 调用
 * - PascalIO：包含 file 和 console 字段的运行时 IO
 *
 * createDefaultIO() 使用内存实现，console 默认 write/writeln 抛异常，read/readln 返回空。
 * createRecordFileOps() 文件底层依赖 PascalRecord。
 * createCallbackConsole() 控制台底层依赖两个回调函数。
 */

import { makeInteger, makeBoolean, makeString } from './types/pascal-value'
import type { PascalValue } from './types/pascal-value'

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
// 默认控制台实现：read 返回空，write 抛异常
// ============================================================================

function createDefaultConsole(): PascalConsole {
  return {
    write() { throw new Error('Console write is not implemented. Set state.io.console to use console output.') },
    writeln() { throw new Error('Console writeln is not implemented. Set state.io.console to use console output.') },
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
    },

    close(file: PascalFile): void {
      const s = getState(file)
      if (s.writeBuffer.length > 0) {
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
      if (!s.writable) {
        throw new Error('Cannot write to file that is not opened for writing (use REWRITE first)')
      }
      s.writeBuffer += text
    },

    writeln(file: PascalFile): void {
      const s = getState(file)
      if (!s.writable) {
        throw new Error('Cannot write to file that is not opened for writing (use REWRITE first)')
      }
      s.lines.push(s.writeBuffer)
      s.writeBuffer = ''
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
// Record 模式文件实现：底层是一个 PascalRecord，字段存储文件状态
// ============================================================================

const recordFileStates = new WeakMap<PascalFile, PascalValue>()

function getRecordFileState(file: PascalFile): PascalValue | undefined {
  return recordFileStates.get(file)
}

function setRecordFileState(file: PascalFile, rec: PascalValue): void {
  recordFileStates.set(file, rec)
}

export function createRecordFileHandle(url: string): PascalFile {
  return { url, offset: 0 }
}

export function createRecordFileOps(): PascalFileOps {
  return {
    reset(file: PascalFile): void {
      const rec = getRecordFileState(file)
      if (!rec) return
      const fields = (rec.rawValue as any).fields as Map<string, PascalValue>
      fields.set('CURRENTLINE', makeInteger(0))
      fields.set('CURRENTCHAR', makeInteger(0))
      const lines = fields.get('LINES')
      const lineCount = lines && lines.type.kind === 'array' ? (lines.rawValue as any).elements.length : 0
      fields.set('EOF', makeBoolean(lineCount === 0))
      fields.set('WRITABLE', makeBoolean(false))
      fields.set('WRITEBUFFER', makeString(''))
    },

    rewrite(file: PascalFile): void {
      const rec = getRecordFileState(file)
      if (!rec) return
      const fields = (rec.rawValue as any).fields as Map<string, PascalValue>
      fields.set('CURRENTLINE', makeInteger(0))
      fields.set('CURRENTCHAR', makeInteger(0))
      fields.set('EOF', makeBoolean(true))
      fields.set('WRITABLE', makeBoolean(true))
      fields.set('WRITEBUFFER', makeString(''))
      const lines = fields.get('LINES')
      if (lines && lines.type.kind === 'array') {
        ;(lines.rawValue as any).elements = []
      }
    },

    get(file: PascalFile): void {
      const rec = getRecordFileState(file)
      if (!rec) return
      const fields = (rec.rawValue as any).fields as Map<string, PascalValue>
      const eofVal = fields.get('EOF')
      if (eofVal && eofVal.rawValue === 1) return
      const currentLine = (fields.get('CURRENTLINE')?.rawValue as number) || 0
      const currentChar = (fields.get('CURRENTCHAR')?.rawValue as number) || 0
      const lines = fields.get('LINES')
      if (!lines || lines.type.kind !== 'array') return
      const elements = (lines.rawValue as any).elements as PascalValue[]
      if (currentLine >= elements.length) return
      const lineVal = elements[currentLine]
      const lineStr = String.fromCharCode(...((lineVal.rawValue as number[]) || []))
      const newChar = currentChar + 1
      if (newChar > lineStr.length) {
        fields.set('CURRENTLINE', makeInteger(currentLine + 1))
        fields.set('CURRENTCHAR', makeInteger(0))
        if (currentLine + 1 >= elements.length) {
          fields.set('EOF', makeBoolean(true))
        }
      } else {
        fields.set('CURRENTCHAR', makeInteger(newChar))
      }
    },

    put(_file: PascalFile): void {
    },

    close(file: PascalFile): void {
      const rec = getRecordFileState(file)
      if (!rec) return
      const fields = (rec.rawValue as any).fields as Map<string, PascalValue>
      const writeBuffer = (fields.get('WRITEBUFFER')?.rawValue as number[]) || []
      const lines = fields.get('LINES')
      if (writeBuffer.length > 0 && lines && lines.type.kind === 'array') {
        ;(lines.rawValue as any).elements.push(makeString(String.fromCharCode(...writeBuffer)))
        fields.set('WRITEBUFFER', makeString(''))
      }
    },

    bufferChar(file: PascalFile): number {
      const rec = getRecordFileState(file)
      if (!rec) return 0
      const fields = (rec.rawValue as any).fields as Map<string, PascalValue>
      const eofVal = fields.get('EOF')
      if (eofVal && eofVal.rawValue === 1) return 0
      const currentLine = (fields.get('CURRENTLINE')?.rawValue as number) || 0
      const currentChar = (fields.get('CURRENTCHAR')?.rawValue as number) || 0
      const lines = fields.get('LINES')
      if (!lines || lines.type.kind !== 'array') return 0
      const elements = (lines.rawValue as any).elements as PascalValue[]
      if (currentLine >= elements.length) return 0
      const lineVal = elements[currentLine]
      const chars = (lineVal.rawValue as number[]) || []
      if (currentChar >= chars.length) return 0
      return chars[currentChar] & 0xFF
    },

    eof(file: PascalFile): boolean {
      const rec = getRecordFileState(file)
      if (!rec) return true
      const fields = (rec.rawValue as any).fields as Map<string, PascalValue>
      const eofVal = fields.get('EOF')
      return eofVal ? eofVal.rawValue === 1 : true
    },

    eoln(file: PascalFile): boolean {
      const rec = getRecordFileState(file)
      if (!rec) return true
      const fields = (rec.rawValue as any).fields as Map<string, PascalValue>
      const eofVal = fields.get('EOF')
      if (eofVal && eofVal.rawValue === 1) return true
      const currentLine = (fields.get('CURRENTLINE')?.rawValue as number) || 0
      const currentChar = (fields.get('CURRENTCHAR')?.rawValue as number) || 0
      const lines = fields.get('LINES')
      if (!lines || lines.type.kind !== 'array') return true
      const elements = (lines.rawValue as any).elements as PascalValue[]
      if (currentLine >= elements.length) return true
      const lineVal = elements[currentLine]
      const chars = (lineVal.rawValue as number[]) || []
      return currentChar >= chars.length
    },

    readln(file: PascalFile): void {
      const rec = getRecordFileState(file)
      if (!rec) return
      const fields = (rec.rawValue as any).fields as Map<string, PascalValue>
      const eofVal = fields.get('EOF')
      if (eofVal && eofVal.rawValue === 1) return
      const currentLine = (fields.get('CURRENTLINE')?.rawValue as number) || 0
      const lines = fields.get('LINES')
      if (!lines || lines.type.kind !== 'array') return
      const elements = (lines.rawValue as any).elements as PascalValue[]
      const newLine = currentLine + 1
      fields.set('CURRENTLINE', makeInteger(newLine))
      fields.set('CURRENTCHAR', makeInteger(0))
      if (newLine >= elements.length) {
        fields.set('EOF', makeBoolean(true))
      }
    },

    write(file: PascalFile, text: string): void {
      const rec = getRecordFileState(file)
      if (!rec) {
        throw new Error('Cannot write to file: record file not initialized')
      }
      const fields = (rec.rawValue as any).fields as Map<string, PascalValue>
      const writable = fields.get('WRITABLE')
      if (!writable || writable.rawValue !== 1) {
        throw new Error('Cannot write to file that is not opened for writing (use REWRITE first)')
      }
      const existing = (fields.get('WRITEBUFFER')?.rawValue as number[]) || []
      const newChars: number[] = []
      for (let i = 0; i < text.length; i++) {
        newChars.push(text.charCodeAt(i) & 0xFF)
      }
      fields.set('WRITEBUFFER', makeString(String.fromCharCode(...existing, ...newChars)))
    },

    writeln(file: PascalFile): void {
      const rec = getRecordFileState(file)
      if (!rec) {
        throw new Error('Cannot write to file: record file not initialized')
      }
      const fields = (rec.rawValue as any).fields as Map<string, PascalValue>
      const writable = fields.get('WRITABLE')
      if (!writable || writable.rawValue !== 1) {
        throw new Error('Cannot write to file that is not opened for writing (use REWRITE first)')
      }
      const writeBuffer = (fields.get('WRITEBUFFER')?.rawValue as number[]) || []
      const lines = fields.get('LINES')
      if (lines && lines.type.kind === 'array') {
        ;(lines.rawValue as any).elements.push(makeString(String.fromCharCode(...writeBuffer)))
        fields.set('WRITEBUFFER', makeString(''))
      }
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
