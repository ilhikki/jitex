export interface PascalFile {
  url: string
  offset: number
}

export interface PascalConsole {
  write(text: string): Promise<void> | void
  writeln(): Promise<void> | void
  read(): Promise<string>
  readln(): Promise<string>
  eof(): Promise<boolean>
  eoln(): Promise<boolean>
}

export interface PascalFileOps {
  reset(file: PascalFile): Promise<void>
  rewrite(file: PascalFile): Promise<void>
  get(file: PascalFile): Promise<void>
  put(file: PascalFile): Promise<void>
  close(file: PascalFile): Promise<void>
  assign(file: PascalFile, name: string): Promise<void>
  bufferChar(file: PascalFile): Promise<number>
  eof(file: PascalFile): Promise<boolean>
  eoln(file: PascalFile): Promise<boolean>
  readln(file: PascalFile): Promise<void>
  write(file: PascalFile, text: string): Promise<void>
  writeln(file: PascalFile): Promise<void>
}

export interface PascalIO {
  file: PascalFileOps
  console: PascalConsole
}

export function createDefaultIO(inputQueue: string[]): PascalIO {
  return {
    file: createThrowFileOps(),
    console: createQueueConsole(inputQueue),
  }
}

function createThrowFileOps(): PascalFileOps {
  const notImpl = (m: string): never => {
    throw new Error(
      `IO.file.${m} is not implemented. Pass a files Map to runVM to enable file IO.`
    )
  }
  return {
    reset: (_f: PascalFile) => Promise.resolve(notImpl('reset')),
    rewrite: (_f: PascalFile) => Promise.resolve(notImpl('rewrite')),
    get: (_f: PascalFile) => Promise.resolve(notImpl('get')),
    put: (_f: PascalFile) => Promise.resolve(notImpl('put')),
    close: (_f: PascalFile) => Promise.resolve(notImpl('close')),
    assign: (_f: PascalFile, _n: string) => Promise.resolve(notImpl('assign')),
    bufferChar: (_f: PascalFile) => Promise.resolve(notImpl('bufferChar')),
    eof: (_f: PascalFile) => Promise.resolve(notImpl('eof')),
    eoln: (_f: PascalFile) => Promise.resolve(notImpl('eoln')),
    readln: (_f: PascalFile) => Promise.resolve(notImpl('readln')),
    write: (_f: PascalFile, _t: string) => Promise.resolve(notImpl('write')),
    writeln: (_f: PascalFile) => Promise.resolve(notImpl('writeln')),
  }
}

function createQueueConsole(inputQueue: string[]): PascalConsole {
  return {
    async write() {},
    async writeln() {},
    async read() {
      const v = inputQueue.shift()
      return v ?? ''
    },
    async readln() {
      const v = inputQueue.shift()
      return v ?? ''
    },
    async eof() {
      return inputQueue.length === 0
    },
    async eoln() {
      return inputQueue.length === 0
    },
  }
}

export function createEmptyFile(): PascalFile {
  return { url: '', offset: 0 }
}

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
      s = {
        offset: 0,
        eof: content.length === 0,
        writable: false,
        lines: [],
        currentLine: '',
      }
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
    async reset(file: PascalFile): Promise<void> {
      const s = getState(file)
      const content = files.get(file.url) || new Uint8Array(0)
      s.offset = 0
      s.eof = content.length === 0
      s.writable = false
      s.currentLine = ''
    },

    async rewrite(file: PascalFile): Promise<void> {
      const s = getState(file)
      files.set(file.url, new Uint8Array(0))
      s.offset = 0
      s.eof = true
      s.writable = true
      s.lines = []
      s.currentLine = ''
    },

    async get(file: PascalFile): Promise<void> {
      const s = getState(file)
      if (s.eof) return
      const content = currentContent(file)
      s.offset++
      if (s.offset >= content.length) {
        s.eof = true
      }
    },

    async put(_file: PascalFile): Promise<void> {
    },

    async close(file: PascalFile): Promise<void> {
      const s = getState(file)
      if (s.currentLine.length > 0) {
        s.lines.push(s.currentLine)
        s.currentLine = ''
      }
      writeBack(file)
    },

    async assign(file: PascalFile, name: string): Promise<void> {
      file.url = name
      handleState.delete(file)
    },

    async bufferChar(file: PascalFile): Promise<number> {
      const s = getState(file)
      const content = currentContent(file)
      if (s.eof || s.offset >= content.length) return 0
      return content[s.offset] & 0xff
    },

    async eof(file: PascalFile): Promise<boolean> {
      return getState(file).eof
    },

    async eoln(file: PascalFile): Promise<boolean> {
      const s = getState(file)
      const content = currentContent(file)
      if (s.eof || s.offset >= content.length) return true
      return content[s.offset] === 10
    },

    async readln(file: PascalFile): Promise<void> {
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

    async write(file: PascalFile, text: string): Promise<void> {
      const s = getState(file)
      if (!s.writable) {
        throw new Error('Cannot write to file that is not opened for writing (use REWRITE first)')
      }
      s.currentLine += text
    },

    async writeln(file: PascalFile): Promise<void> {
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

export function createCallbackConsole(
  onWrite: (text: string) => void,
  onRead: () => Promise<string> | string
): PascalConsole {
  return {
    async write(text: string) {
      onWrite(text)
    },
    async writeln() {
      onWrite('\n')
    },
    async read() {
      return await onRead()
    },
    async readln() {
      return await onRead()
    },
    async eof() {
      return false
    },
    async eoln() {
      return false
    },
  }
}