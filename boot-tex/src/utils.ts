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

import {
  ExtraCallable,
  getPascalStringValue,
  MemoryTextFile,
  PascalArray,
  PascalFile,
  PascalFileStore,
  runJs,
  RunState,
  SyscallHandler,
  transform,
} from '@jitex/pascal-to-js'
import { assert, assertEquals, attach, attachText, log, Stage, stage, UnwrapAll } from '@jitex/integration'

export const extraSyscalls: Record<string, SyscallHandler> = {
  'extra.break': () => {
  },
  'file.rewrite': (ctx, [file, fileName]) => {
    const pascalFile = file as PascalFile
    if (fileName) {
      const nameText = getPascalStringValue(fileName as PascalArray)
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
  'file.reset': (ctx, [file, fileName, mode]) => {
    const pascalFile = file as PascalFile
    if (fileName) {
      const pascalString = fileName as PascalArray
      const nameText = getPascalStringValue(pascalString)

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
    fileStore.seek(0)
  },
}
