// 内置系统调用名（大写）。ProcedureCall/FunctionCall 命中此集合 → 走 sysCall
import type { TypeTable } from './types'
import type { BlockNode, ExpressionNode, IdentifierNode, ProgramNode } from '../ast/types'

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

// 明确无参的内置函数（允许省略括号调用）
export const BUILTIN_NO_ARG = new Set(['EOF', 'EOLN', 'RANDOM'])

// 返回内置函数的返回类型（用于类型推断）
// polymorphic 参数：若 argType 提供，PRED/SUCC/ABS/SQR 跟随参数类型
export function builtinReturnType(name: string, argType?: string): string {
  switch (name) {
    case 'ORD':
    case 'TRUNC':
    case 'ROUND':
    case 'ERSTAT':
      return 'integer'
    case 'ABS':
    case 'SQR':
      // ABS/SQR: integer→integer, real→real
      if (argType === 'real') return 'real'
      return 'integer'
    case 'PRED':
    case 'SUCC':
      // PRED/SUCC: 返回类型跟随参数类型
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

// ============================================================================
// 类型工具
// ============================================================================

export const SCALAR_TYPES = new Set(['integer', 'real', 'boolean', 'char', 'string'])

export function isScalar(typeId: string): boolean {
  return SCALAR_TYPES.has(typeId) || typeId === 'subrange'
}

// ============================================================================
// 作用域
// ============================================================================

export interface VarInfo {
  jsName: string
  typeId: string // 运行时类型（scalarBase 缩并后）
  origTypeId: string // 原始类型（用于 subrange 边界检查/默认值）
  isVar: boolean // var 参数（Phase 4 处理引用语义）
}

export interface WithRecordInfo {
  jsName: string
  typeId: string
}

export class Scope {
  vars = new Map<string, VarInfo>()
  procs = new Map<string, ProcInfo>() // 该作用域可见的过程（嵌套过程注册到父 scope）
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
  // 沿父链收集所有 with-record（内层、后面的优先）
  allWithRecords(): WithRecordInfo[] {
    const result: WithRecordInfo[] = []
    let s: Scope | null = this
    while (s) {
      if (s.withRecords) {
        // 同一层内，后面的 record 优先级更高 → 倒序加入
        for (let i = s.withRecords.length - 1; i >= 0; i--) {
          result.push(s.withRecords[i])
        }
      }
      s = s.parent
    }
    return result // 从内到外，从后到前
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
  name: string // 原始 Pascal 名（大写）
  isFunction: boolean
  returnType: string
  params: { name: string; typeId: string; isVar: boolean }[]
  block: BlockNode | null
  parent: ProcInfo | null // 父过程（嵌套用）
  children: ProcInfo[] // 直接嵌套的子过程
  isForward: boolean // FORWARD 声明（无 block）
  forwardDef?: ProcInfo // FORWARD 实际定义（第二次声明时指向 actual）
}
