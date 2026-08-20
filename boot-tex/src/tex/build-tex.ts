import {
  ExtraCallable,
  getPascalStringValue,
  type PascalArray,
  type PascalFile,
  SyscallHandler,
  transform,
} from '@jitex/pascal-to-js'
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
  'extra.close': () => undefined,
  'extra.breakIn': () => undefined,
  'extra.erStat': () => 0,
  'extra.break': extraSyscalls['extra.break'],
  'file.reset': extraSyscalls['file.reset'],
  'file.rewrite': extraSyscalls['file.rewrite'],
}

export function transformTex(texPascalContent: string) {
  const jsCode = transform(texPascalContent, {
    extraCallables: texExtraCallables,
  })
  return jsCode
}
