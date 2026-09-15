import { ExtraCallable, PascalFile, SyscallHandler, TextFile, transform } from '@jitex/pascal-to-js'
import { ConsoleFile, extraSyscalls, normalizeFileOpen, runtimeFileSyscalls } from '../utils.ts'

const texExtraCallables: Record<string, ExtraCallable> = {
  'BREAK': {
    sysCallName: 'extra.break',
    kind: 'procedure',
  },
  'CLOSE': {
    sysCallName: 'extra.close',
    kind: 'procedure',
  },
  'BREAKIN': {
    sysCallName: 'extra.breakIn',
    kind: 'procedure',
  },
  'ERSTAT': {
    sysCallName: 'extra.erStat',
    kind: 'function',
  },
  // 由 normalizeFileOpen 从 reset(f, name, opts) / rewrite(f, name, opts) 改写而来
  'OPENIN': {
    sysCallName: 'extra.openIn',
    kind: 'procedure',
  },
  'OPENOUT': {
    sysCallName: 'extra.openOut',
    kind: 'procedure',
  },
}

/**
 * eoln(f)：ConsoleFile 需要模拟终端对回车键的回显。
 *
 * input_ln 读到行结束符就停下、不消费它；真实终端会把那个换行回显出来，
 * 这里用 advance() 消费并回显。
 */
const eolnSyscall: SyscallHandler = (ctx, file) => {
  const f = file as PascalFile | undefined
  const store = (f === undefined ? ctx.files.get('INPUT') : f.value) as (TextFile | undefined)
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

export const texExtraSyscalls: Record<string, SyscallHandler> = {
  'extra.close': extraSyscalls['extra.close'],
  'extra.breakIn': extraSyscalls['extra.breakIn'],
  'extra.erStat': extraSyscalls['extra.erStat'],
  'extra.break': extraSyscalls['extra.break'],
  'runtime.file.eoln': eolnSyscall,
  ...runtimeFileSyscalls,
}

export function transformTex(texPascalContent: string, debug = true) {
  const jsCode = transform(normalizeFileOpen(texPascalContent), {
    extraCallables: texExtraCallables,
    debug,
  })
  return jsCode
}
