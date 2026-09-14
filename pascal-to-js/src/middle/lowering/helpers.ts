/*
 * IL lowering 辅助构造函数。
 *
 * 纯函数族，无 mutable state。提供 JsonCode 节点的构造便利函数、
 * syscall key 常量表，以及 With 绑定上下文类型。
 *
 * 命名约定：lowering 产出的 key 一律带 `lowering.` 前缀；
 * rewrite 消费类型后产出 `runtime.` 前缀的终态 key。
 */

import * as JsonCode from '@/middle/ir/json-code.ts'
import { TypeInfo } from '@/middle/analysis/analysis-type.ts'

// ============================================================
// With 绑定上下文
// ============================================================

export interface WithBinding {
  tempVarId: number
  /** record 的整体类型（rewrite 算字段 offset 用） */
  typeInfo: TypeInfo
  fields: Map<string, TypeInfo>
}

// ============================================================
// 辅助构造函数
// ============================================================

export function ref(varId: number): JsonCode.Ref {
  return { kind: 'ref', varId }
}

export function litInt(v: number | string): JsonCode.Literal {
  return { kind: 'literal', key: 'i32', arg: String(v) }
}

export function litReal(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'f64', arg: v }
}

export function litStr(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'str', arg: v }
}

/**
 * 字符串字面量 → `Uint8Array` 字面量（ISO 7185 6.1.7：
 * string-literal 的类型是 packed array[1..n] of char）。
 */
export function litBytes(v: string): JsonCode.Literal {
  const bytes = Array.from(v, (c) => c.charCodeAt(0))
  return { kind: 'literal', key: 'bytes', arg: JSON.stringify(bytes) }
}

export function litField(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'field', arg: v }
}

/**
 * char 字面量 → i32 字面量（char 用 ord 值表示，ISO 6.4.2.3）。
 */
export function litChar(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'i32', arg: String(v.charCodeAt(0)) }
}

export function litBool(v: boolean): JsonCode.Literal {
  // boolean 取序数值 0/1（ISO 6.4.2.2）
  return { kind: 'literal', key: 'i32', arg: v ? '1' : '0' }
}

export function litNull(): JsonCode.Literal {
  // ISO 7185 6.4.4: nil-value，JS 中用 undefined 表示
  return { kind: 'literal', key: 'null', arg: 'undefined' }
}

export function syscall(key: SyscallKey, args: JsonCode.Expr[]): JsonCode.Syscall {
  return { kind: 'syscall', key, args }
}

export function callExpr(funcId: number, args: JsonCode.Expr[]): JsonCode.Call {
  return { kind: 'call', functionId: funcId, args }
}

export function labelStmt(id: number): JsonCode.Label {
  return { kind: 'label', labelId: id }
}

export function jumpStmt(id: number): JsonCode.Jmp {
  return { kind: 'jump', labelId: id }
}

export function jumpIfStmt(cond: JsonCode.Expr, then: number, els: number): JsonCode.JumpIf {
  return { kind: 'jumpIf', condition: cond, then, else: els }
}

export function assignStmt(target: JsonCode.Ref, value: JsonCode.Expr): JsonCode.Assign {
  return { kind: 'assign', target, value }
}

export function evalStmt(expr: JsonCode.Expr): JsonCode.Eval {
  return { kind: 'eval', expr }
}

export function returnStmt(value?: JsonCode.Expr): JsonCode.Return {
  return { kind: 'return', value }
}

// ============================================================
// syscall key 常量表
// ============================================================

export const syscallKeys = {
  // ---------- 调试 / 检查 ----------
  hookFunctionEnter: 'lowering.hook.function.enter', // [id, name]
  stepsCheck: 'lowering.steps.check', // []
  rangeCheck: 'lowering.range.check', // [v, lo, hi]

  // ---------- 内存 ----------
  memDefault: 'lowering.mem.default', // [typeDesc]
  memCopy: 'lowering.mem.copy', // [dst, dstOffset, src, typeDesc]

  // ---------- set ----------
  setEmpty: 'lowering.set.empty', // [typeDesc]
  setRange: 'lowering.set.range', // [lo, hi, typeDesc]
  setElem: 'lowering.set.elem', // [v, typeDesc]
  setLiteral: 'lowering.set.literal', // [...elems, typeDesc]

  // ---------- 文件 ----------
  fileCreate: 'lowering.file.create', // [typeDesc]
  fileReset: 'lowering.file.reset', // [f, typeDesc, ...src]
  fileRewrite: 'lowering.file.rewrite', // [f, typeDesc, ...src]
  fileGet: 'lowering.file.get', // [f, typeDesc]
  filePut: 'lowering.file.put', // [f, typeDesc, value?]
  filePeek: 'lowering.file.peek', // [f, typeDesc]
  fileEof: 'lowering.file.eof', // [f, typeDesc]
  fileEoln: 'lowering.file.eoln', // [f]
  programFileUrl: 'lowering.program.fileUrl', // [f, name, typeDesc]

  // ---------- io ----------
  ioWrite: 'lowering.io.write', // [target, targetType, value, valueType, width, prec]
  ioWriteln: 'lowering.io.writeln', // [target, targetType]
  ioRead: 'lowering.io.read', // [target, targetType, valueType]
  ioReadlnSkip: 'lowering.io.readln.skip', // [target, targetType]
  ioPage: 'lowering.io.page', // [target, targetType]
  ioEof: 'lowering.io.eof', // []
  ioEoln: 'lowering.io.eoln', // []

  // ---------- 记录 / 数组 / cell ----------
  recAccess: 'lowering.rec.access', // [rec, name, typeDesc]
  recAssign: 'lowering.rec.assign', // [rec, name, value, typeDesc]
  recCopy: 'lowering.rec.copy', // [rec, typeDesc]
  arrayAccess: 'lowering.array.access', // [arr, ...indices, typeDesc]
  arrayAssign: 'lowering.array.assign', // [arr, ...indices, value, typeDesc]
  cellCreate: 'lowering.cell.create', // [value]
  cellGet: 'lowering.cell.get', // [cell]
  cellSet: 'lowering.cell.set', // [cell, value]

  // ============================================================
  // 阶段1：算术 / 逻辑 / 比较 / 转换（泛型，rewrite 消费 type 分发）
  // ============================================================

  // 二元运算，args = [left, leftType, right, rightType]
  add: 'lowering.add',
  sub: 'lowering.sub',
  mul: 'lowering.mul',
  and: 'lowering.and',
  or: 'lowering.or',
  // 二元运算（类型固定），args = [left, right]
  div: 'lowering.div',
  intDiv: 'lowering.intDiv',
  mod: 'lowering.mod',
  // 一元运算，args = [value, type]
  neg: 'lowering.neg',
  not: 'lowering.not',
  abs: 'lowering.abs',
  // 数学函数
  sqr: 'lowering.sqr', // [value, type]
  sqrt: 'lowering.sqrt', // [value]
  sin: 'lowering.sin',
  cos: 'lowering.cos',
  exp: 'lowering.exp',
  ln: 'lowering.ln',
  arctan: 'lowering.arctan',
  odd: 'lowering.odd', // [value]
  // 转换
  trunc: 'lowering.trunc', // [value]
  round: 'lowering.round', // [value]
  ord: 'lowering.ord', // [value, type]
  chr: 'lowering.chr', // [value]
  pred: 'lowering.pred', // [value, type]
  succ: 'lowering.succ', // [value, type]
  // 比较，args = [left, leftType, right, rightType]
  eq: 'lowering.eq',
  ne: 'lowering.ne',
  lt: 'lowering.lt',
  le: 'lowering.le',
  gt: 'lowering.gt',
  ge: 'lowering.ge',
  in: 'lowering.in', // [value, valueType, set, setType]
  // 指针
  ptrDeref: 'lowering.ptr.deref',
  ptrAssign: 'lowering.ptr.assign',
  ptrDisposeCheck: 'lowering.ptr.dispose.check',
  // 数组整体搬移（ISO 6.6.5.4）
  pack: 'lowering.pack',
  unpack: 'lowering.unpack',
} as const
export type SyscallKey = (typeof syscallKeys)[keyof typeof syscallKeys]
