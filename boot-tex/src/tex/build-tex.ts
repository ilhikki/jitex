import { ExtraCallable, SyscallHandler, transform } from '@jitex/pascal-to-js'
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
  'file.eoln': (ctx, [file]) => {
    const f = file as PascalFile
    const store = f.value
    if (!store || !store.hasMore()) {
      return true
    }
    const byte = store.peekByte()
    const isEoln = byte === 10 || byte === 13
    // ConsoleFile: simulate terminal echo of the return key.
    // input_ln stops at eoln without consuming it; the real terminal would
    // echo the newline. advance() consumes and echoes it.
    if (isEoln && store instanceof ConsoleFile) {
      store.advance()
    }
    return isEoln
  },
}

export function transformTex(texPascalContent: string) {
  const jsCode = transform(texPascalContent, {
    extraCallables: texExtraCallables,
  })
  return jsCode
}
