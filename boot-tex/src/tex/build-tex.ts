import {
  ExtraCallable,
  getPascalStringValue,
  type PascalArray,
  type PascalFile,
  SyscallHandler,
  transform,
} from '@jitex/pascal-to-js'
// noinspection SpellCheckingInspection
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
  'extra.break': () => undefined,
  'extra.close': () => undefined,
  'extra.breakIn': () => undefined,
  'extra.erStat': () => 0,
  'file.rewrite': (_ctx, [f, name]) => {
    const file = f as PascalFile
    file.url = getPascalStringValue(name as PascalArray<string>)
    file.offset = 0
    file.writable = true
    file.eof = false
  },
  'file.reset': (_ctx, [f, name]) => {
    const file = f as PascalFile
    const url = getPascalStringValue(name as PascalArray<string>)
    file.url = url
    file.eof = false
    file.writable = true
    file.offset = 0
  },
}

export function transformTex(texPascalContent: string) {
  const jsCode = transform(texPascalContent, {
    extraCallables: texExtraCallables,
  })
  return jsCode
}
