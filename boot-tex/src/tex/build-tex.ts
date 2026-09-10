import { ExtraCallable, PascalFile, SyscallHandler, TextFile, transform } from '@jitex/pascal-to-js'
import { ConsoleFile, extraSyscalls } from '../utils.ts'

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
}

/**
 * eoln(f)：ConsoleFile 需要模拟终端对回车键的回显。
 *
 * input_ln 读到行结束符就停下、不消费它；真实终端会把那个换行回显出来，
 * 这里用 advance() 消费并回显。
 */
const eolnSyscall: SyscallHandler = (ctx, [file]) => {
  const f = file as PascalFile | null | undefined
  const store = (f === null || f === undefined ? ctx.files.get('INPUT') : f.value) as
    | (TextFile | undefined)
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
  'file.reset': extraSyscalls['file.reset'],
  'file.rewrite': extraSyscalls['file.rewrite'],
  'file.peek': extraSyscalls['file.peek'],
  'file.rec.rewrite': extraSyscalls['file.rec.rewrite'],
  'file.rec.reset': extraSyscalls['file.rec.reset'],
  'factory.createHandler': extraSyscalls['factory.createHandler'],
  'factory.createRecHandler': extraSyscalls['factory.createRecHandler'],
  'io.write.i32.file': extraSyscalls['io.write.i32.file'],
  'file.eoln': eolnSyscall,
  // 新链路（runtime.* 前缀）下的同语义覆盖
  'runtime.file.eoln': eolnSyscall,
}

export function transformTex(texPascalContent: string) {
  const jsCode = transform(texPascalContent, {
    extraCallables: texExtraCallables,
  })
  return jsCode
}
