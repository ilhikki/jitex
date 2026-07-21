import type { BlockNode } from '../../ast/types'

export const BUILTIN_SYSCALLS = new Set([
  'WRITE',
  'WRITELN',
  'READ',
  'READLN',
  'PAGE',
  'ORD',
  'CHR',
  'ABS',
  'SQR',
  'PRED',
  'SUCC',
  'ODD',
  'EOF',
  'EOLN',
  'RESET',
  'REWRITE',
  'CLOSE',
  'GET',
  'PUT',
  'ASSIGN',
  'BUFFER_CHAR',
  'BREAK',
  'BREAKIN',
  'ERSTAT',
  'WRITE_FILE',
  'TRUNC',
  'ROUND',
  'SIN',
  'COS',
  'EXP',
  'LN',
  'SQRT',
  'ARCTAN',
  'NEW',
  'DISPOSE',
  'PACK',
  'UNPACK',
  'RANDOM',
])

export const BUILTIN_NO_ARG = new Set(['EOF', 'EOLN', 'RANDOM'])

export function builtinReturnType(name: string, argType?: string): string {
  switch (name) {
    case 'ORD':
    case 'TRUNC':
    case 'ROUND':
    case 'ERSTAT':
      return 'integer'
    case 'ABS':
    case 'SQR':
      if (argType === 'real') return 'real'
      return 'integer'
    case 'PRED':
    case 'SUCC':
      if (argType === 'char') return 'char'
      if (argType === 'boolean') return 'boolean'
      if (argType === 'real') return 'real'
      return 'integer'
    case 'ODD':
    case 'EOF':
    case 'EOLN':
      return 'boolean'
    case 'CHR':
      return 'char'
    case 'SIN':
    case 'COS':
    case 'EXP':
    case 'LN':
    case 'SQRT':
    case 'ARCTAN':
      return 'real'
    case 'RANDOM':
      return 'real'
    default:
      return 'integer'
  }
}

export const SCALAR_TYPES = new Set(['integer', 'real', 'boolean', 'char', 'string'])

export function isScalar(typeId: string): boolean {
  return SCALAR_TYPES.has(typeId) || typeId === 'subrange'
}

export interface VarInfo {
  jsName: string
  typeId: string
  origTypeId: string
  isVar: boolean
}

export interface WithRecordInfo {
  jsName: string
  typeId: string
}

export class Scope {
  vars = new Map<string, VarInfo>()
  procs = new Map<string, ProcInfo>()
  withRecords: WithRecordInfo[] | null = null
  parent: Scope | null
  constructor(parent: Scope | null = null) {
    this.parent = parent
  }
  lookup(name: string): VarInfo | null {
    const key = name.toUpperCase()
    const v = this.vars.get(key)
    if (v) return v
    return this.parent ? this.parent.lookup(name) : null
  }
  lookupProc(name: string): ProcInfo | null {
    const key = name.toUpperCase()
    const p = this.procs.get(key)
    if (p) return p
    return this.parent ? this.parent.lookupProc(name) : null
  }
  allWithRecords(): WithRecordInfo[] {
    const result: WithRecordInfo[] = []
    let s: Scope | null = this
    while (s) {
      if (s.withRecords) {
        for (let i = s.withRecords.length - 1; i >= 0; i--) {
          result.push(s.withRecords[i])
        }
      }
      s = s.parent
    }
    return result
  }
  declare(name: string, typeId: string, isVar = false, origTypeId?: string): VarInfo {
    const key = name.toUpperCase()
    const existing = this.vars.get(key)
    if (existing) return existing
    const info: VarInfo = { jsName: name, typeId, origTypeId: origTypeId ?? typeId, isVar }
    this.vars.set(key, info)
    return info
  }
}

export interface ProcInfo {
  jsName: string
  name: string
  isFunction: boolean
  returnType: string
  params: { name: string; typeId: string; isVar: boolean }[]
  block: BlockNode | null
  parent: ProcInfo | null
  children: ProcInfo[]
  isForward: boolean
  forwardDef?: ProcInfo
}
