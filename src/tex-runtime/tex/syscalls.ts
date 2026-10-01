import { bytesToString, createMemoryFileStore, rtKeys } from '@jitex/runtime'
import type { ByteHost, PascalFile, PascalFileStore, SyscallHandler } from '@jitex/runtime'
import { ConsoleFile } from './console.ts'

const texExternalSyscalls: Record<string, SyscallHandler> = {
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

export const texOpenKeys = {
  openIn: 'extra.openIn',
  openOut: 'extra.openOut',
} as const

const fileNameOf = (name: unknown): string => bytesToString((name as ByteHost).bytes).trim()

const texOpenSyscalls: Record<string, SyscallHandler> = {
  [texOpenKeys.openIn]: (ctx, file, name) => {
    const key = fileNameOf(name)
    ctx.debugLog.push(`${texOpenKeys.openIn} ${key}`)
    const p = file as PascalFile
    const store = ctx.files.get(key)
    p.value = store
    if (store !== undefined) {
      store.seek(0)
      store.setMode('inspection')
    }
    return undefined
  },
  [texOpenKeys.openOut]: (ctx, file, name) => {
    const p = file as PascalFile
    const key = fileNameOf(name)
    ctx.debugLog.push(`${texOpenKeys.openOut} ${key}`)
    let store = ctx.files.get(key)
    if (store === undefined) {
      store = createMemoryFileStore()
      ctx.files.set(key, store)
    }
    p.value = store
    store.clear()
    store.seek(0)
    store.setMode('generation')
    return undefined
  },
}

const eolnSyscall: SyscallHandler = (ctx, file) => {
  const f = file as PascalFile | undefined
  const store: PascalFileStore | undefined = f === undefined ? ctx.files.get('INPUT') : f.value
  if (!store || !store.hasMore()) {
    return 1
  }
  const byte = store.peekByte()
  const isEoln = byte === 10 || byte === 13
  if (isEoln && store instanceof ConsoleFile) {
    store.advance()
  }
  return isEoln ? 1 : 0
}

export interface TexRuntimeSyscallOptions {
  terminal?: boolean
}

export function texRuntimeSyscalls(
  options: TexRuntimeSyscallOptions = {},
): Record<string, SyscallHandler> {
  const syscalls: Record<string, SyscallHandler> = {
    ...texExternalSyscalls,
    ...texOpenSyscalls,
  }
  if (options.terminal ?? true) {
    syscalls[rtKeys.fileEoln] = eolnSyscall
  }
  return syscalls
}
