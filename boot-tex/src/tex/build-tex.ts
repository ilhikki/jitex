import { ExtraCallable, SyscallHandler, transform } from '@jitex/pascal-to-js'
import { extraSyscalls } from '../utils.ts'

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
  'factory.createHandler': extraSyscalls['factory.createHandler'],
}

export function transformTex(texPascalContent: string) {
  const jsCode = transform(texPascalContent, {
    extraCallables: texExtraCallables,
  })
  return jsCode
}
