import { bytesToString, rtKeys } from '@jitex/runtime'
import type { RunState } from '@jitex/runtime'
import type { SyscallRewriteTable } from '@jitex/pascal-to-js'
import { texOpenKeys } from '@jitex/tex-runtime'

export function readTextFile(path: string): Promise<string> {
  return Deno.readTextFile(path)
}

export function readFile(path: string): Promise<Uint8Array> {
  return Deno.readFile(path)
}

export const fileOpenRewriters: SyscallRewriteTable = {
  ['lowering.call.reset']: (sys) => {
    if (sys.args.length === 2) {
      return { kind: 'syscall', key: rtKeys.fileReset, args: [sys.args[0]] }
    }
    return { kind: 'syscall', key: texOpenKeys.openIn, args: [sys.args[0], sys.args[2]] }
  },
  ['lowering.call.rewrite']: (sys) => {
    if (sys.args.length === 2) {
      return { kind: 'syscall', key: rtKeys.fileRewrite, args: [sys.args[0]] }
    }
    return { kind: 'syscall', key: texOpenKeys.openOut, args: [sys.args[0], sys.args[2]] }
  },
}

export async function getTripChFile() {
  return await readTextFile('./resources/jitex/trip.ch')
}

export function readTextFromState(
  state: RunState,
  key: string,
): string | undefined {
  const value = state.files.get(key)
  if (value === undefined) {
    return undefined
  }
  return bytesToString(value.getData())
}

export function readBytesFromState(
  state: RunState,
  key: string,
): Uint8Array | undefined {
  const value = state.files.get(key)
  if (value === undefined) {
    return undefined
  }
  return value.getData()
}
