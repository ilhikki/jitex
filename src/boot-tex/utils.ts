import { bytesToString, rtKeys } from '@jitex/runtime'
import type { RunState } from '@jitex/runtime'
import type { SyscallRewriteTable } from '@jitex/pascal-to-js'
import { texOpenKeys } from '@jitex/tex-runtime'

/*
 * Host-side utilities for boot-tex.
 *
 * Only two things live here: Deno-related file reading, and **compile-time**
 * dialect declarations (rewrite tables). Runtime parts -- TTY terminal, TeX's
 * extra/open syscalls, filename area conventions -- now belong to
 * @jitex/tex-runtime; this directory no longer keeps its own copy.
 */

export function readTextFile(path: string): Promise<string> {
  return Deno.readTextFile(path)
}

export function readFile(path: string): Promise<Uint8Array> {
  return Deno.readFile(path)
}

// Named file open (TeX dialect's reset(f, name, opts) / rewrite(f, name, opts))
//
// ISO 7185 6.6.5.2 reset/rewrite accept only one file-variable argument, no
// file-name. The file-name form is taken over by the rewrite extension
// (overriding the matching lowering.* key):
//   - ISO form (file-variable + type descriptor) falls back to the internal
//     terminal key;
//   - dialect form is rewritten to host-injected openin/openout (option args
//     are discarded).
// The compiler's internal table errors on non-ISO forms by default; this
// override legalizes the dialect form.
//
// This table is **compile-time** (fed to transform as syscallRewriters); the
// keys it produces are consumed by the runtime implementation in
// @jitex/tex-runtime, so the keys are taken from texOpenKeys exported there.

export const fileOpenRewriters: SyscallRewriteTable = {
  // key is the lowering-produced `lowering.call.<lowercase name>`; arg layout =
  // (value, type descriptor) flattened, so the ISO single-arg form has length
  // 2 and the dialect form (with file-name) has length > 2.
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
