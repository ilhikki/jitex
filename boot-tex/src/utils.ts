import {
  getPascalStringValue,
  MemoryRecordFile,
  MemoryTextFile,
  PascalArray,
  PascalFile,
  RecordFile,
  SyscallHandler,
  TextFile,
} from '@jitex/pascal-to-js'

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

export const extraSyscalls: Record<string, SyscallHandler> = {
  'extra.break': () => {
  },
  'file.rewrite': (ctx, [file, fileName]) => {
    const pascalFile = file as PascalFile
    if (fileName) {
      const nameText = getPascalStringValue(fileName as PascalArray)?.trim()
      let fileStore = ctx.files.get(nameText)
      if (fileStore === undefined) {
        fileStore = new MemoryTextFile()
        ctx.files.set(nameText, fileStore)
      }
      pascalFile.value = fileStore
    }
    if (!pascalFile.value) {
      throw new Error('file is not init')
    }
    const fileStore = pascalFile.value!
    fileStore.clear()
    fileStore.seek(0)
    fileStore.setMode('generation')
  },
  'file.rec.rewrite': (ctx, args) => {
    const file = args[0] as PascalFile
    let type
    if (args.length === 4) {
      const fileName = getPascalStringValue(args[1] as PascalArray).trim()
      type = args[3]

      let fileStore = ctx.files.get(fileName)
      if (fileStore === undefined) {
        fileStore = new MemoryRecordFile()
        ctx.files.set(fileName, fileStore)
      }
      file.value = fileStore
    } else {
      type = args[1]
    }
    const value = file.value! as RecordFile
    value.clear()
    value.seek(0)
    value.setMode('generation')
    value.setType(type)
    return undefined
  },
  'file.reset': (ctx, [file, fileName]) => {
    const pascalFile = file as PascalFile
    if (fileName) {
      const pascalString = fileName as PascalArray
      const nameText = getPascalStringValue(pascalString)?.trim()
      let fileStore = ctx.files.get(nameText)
      if (fileStore === undefined) {
        fileStore = new MemoryTextFile()
        ctx.files.set(nameText, fileStore)
      }
      ctx.debugLog.push(`==> ${nameText}`)
      pascalFile.value = fileStore
    }
    if (!pascalFile.value) {
      throw new Error('file is not init')
    }
    const fileStore = pascalFile.value!
    fileStore.seek(0)
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
    return this.output.join('')
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
}
