import { rtKeys } from '../keys.ts'
import type { ByteHost, PascalFile, PascalFileStore, RuntimeContext, SyscallHandler } from '../runtime-type.ts'
import { bytesToString, encodeUtf8 } from '../runtime-util.ts'
import { makeByteHost } from './mem.ts'
import { createMemoryFileStore } from './memory-text-file.ts'

function isBlockFile(f: PascalFile): boolean {
  return f.fileKind === 'blocks'
}

function isByteFile(f: PascalFile): boolean {
  return f.fileKind === 'bytes'
}

function textStore(f: PascalFile): PascalFileStore {
  return f.value as unknown as PascalFileStore
}

function defaultStore(ctx: RuntimeContext, isOutput: boolean): PascalFileStore {
  const store = ctx.files.get(isOutput ? 'OUTPUT' : 'INPUT')
  if (store === undefined) {
    throw new Error(isOutput ? 'OUTPUT not defined' : 'INPUT not defined')
  }
  return store as unknown as PascalFileStore
}

function pick(ctx: RuntimeContext, f: unknown, isOutput: boolean): PascalFileStore {
  return f === undefined ? defaultStore(ctx, isOutput) : textStore(f as PascalFile)
}

function writeStore(ctx: RuntimeContext, f: unknown): PascalFileStore {
  return f === undefined ? defaultStore(ctx, true) : textStore(f as PascalFile)
}

function ensureStore(p: PascalFile): PascalFileStore {
  let store = p.value
  if (store === undefined) {
    store = createMemoryFileStore()
    p.value = store
  }
  return store
}

function readCharUnit(store: PascalFileStore): number {
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

function readTokenUnit(store: PascalFileStore): string {
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

function skipLine(store: PascalFileStore): void {
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
      const p = f as PascalFile
      const store = ensureStore(p)
      store.clear()
      store.seek(0)
      store.setMode('generation')
      p.buffer = undefined
      return undefined
    },

    [rtKeys.fileGet]: (_ctx, f, size) => {
      const p = f as PascalFile
      const store = textStore(p)
      if (!store.hasMore()) {
        throw new Error('get(f) at EOF: pre-assertion violated')
      }
      if (isBlockFile(p)) {
        store.advanceBy(size as number)
        return undefined
      }
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
        const store = textStore(p)
        if (store.getMode() === 'generation') {
          if (p.buffer !== undefined) {
            return p.buffer
          }
          const nb = new Uint8Array((size as number) ?? 0)
          p.buffer = makeByteHost(nb)
          return p.buffer
        }
        const rec = store.peekBytes(size as number)
        if (rec !== undefined) {
          return makeByteHost(rec)
        }
        const buf = new Uint8Array((size as number) ?? 0)
        return makeByteHost(buf)
      }
      const store = textStore(p)
      const b = store.peekByte()
      if (b === undefined) {
        return isByteFile(p) ? 0 : 32
      }
      return b
    },

    [rtKeys.filePut]: (_ctx, f) => {
      const p = f as PascalFile
      if (isBlockFile(p)) {
        const store = textStore(p)
        if (store.getMode() !== 'generation') {
          throw new Error('put(f) before rewrite: pre-assertion violated')
        }
        if (p.buffer !== undefined) {
          store.writeBytes(p.buffer.bytes)
          p.buffer = undefined
        }
      }
      return undefined
    },

    [rtKeys.filePutBufferBlock]: (_ctx, f, unit) => {
      const p = f as PascalFile
      const store = textStore(p)
      if (store.getMode() !== 'generation') {
        throw new Error('f^ := x before rewrite: pre-assertion violated')
      }
      p.buffer = makeByteHost((unit as ByteHost).bytes.slice())
      return undefined
    },

    [rtKeys.filePutBufferByte]: (_ctx, f, unit) => {
      textStore(f as PascalFile).writeByte((unit as number) & 0xff)
      return undefined
    },

    [rtKeys.filePutBufferCharacter]: (_ctx, f, unit) => {
      textStore(f as PascalFile).writeByte((unit as number) & 0xff)
      return undefined
    },

    [rtKeys.filePutBufferText]: (_ctx, f, unit) => {
      writeTextUnit(textStore(f as PascalFile), unit as string)
      return undefined
    },

    [rtKeys.fileReadCharacter]: (ctx, f, size) => {
      if (f === undefined) {
        return readCharUnit(defaultStore(ctx, false))
      }
      const p = f as PascalFile
      const store = textStore(p)
      if (isBlockFile(p)) {
        const rec = store.peekBytes(size as number)
        if (rec !== undefined) {
          store.advanceBy(size as number)
          return makeByteHost(rec)
        }
        return makeByteHost(new Uint8Array(0))
      }
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

    [rtKeys.fileWriteText]: (ctx, f, unit) => {
      writeTextUnit(writeStore(ctx, f), unit as string)
      return undefined
    },
    [rtKeys.fileWriteByte]: (ctx, f, unit) => {
      writeStore(ctx, f).writeByte((unit as number) & 0xff)
      return undefined
    },
    [rtKeys.fileWriteBytes]: (ctx, f, unit) => {
      writeStore(ctx, f).writeBytes((unit as ByteHost).bytes)
      return undefined
    },
    [rtKeys.fileWriteBlock]: (_ctx, f, unit) => {
      textStore(f as PascalFile).writeBytes((unit as ByteHost).bytes)
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
      return textStore(f as PascalFile).hasMore() ? 0 : 1
    },
    [rtKeys.fileEoln]: (ctx, f) => {
      const store = pick(ctx, f, false)
      if (!store.hasMore()) {
        return 1
      }
      const b = store.peekByte()
      return b === 10 || b === 13 ? 1 : 0
    },

    [rtKeys.fileCreate]: (
      _ctx,
      kind,
    ) => ({ kind: 'file', value: undefined, fileKind: kind, buffer: undefined } as PascalFile),
    [rtKeys.fileProgramUrl]: (ctx, f, name) => {
      const p = f as PascalFile
      const key = name as string
      const url = ctx.programFileUrls[key] ?? key
      let fileStore = ctx.files.get(url)
      if (fileStore === undefined) {
        fileStore = createMemoryFileStore()
      }
      p.value = fileStore
      ctx.files.set(key, fileStore)
      return undefined
    },
  }
}

function writeTextUnit(store: PascalFileStore, s: string): void {
  if (s.length === 1) {
    store.writeByte(s.charCodeAt(0) & 0xff)
    return
  }
  store.writeBytes(encodeUtf8(s))
}
