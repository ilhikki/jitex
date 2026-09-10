/*
 * IL lowering 辅助构造函数。
 *
 * 纯函数族，无 mutable state。提供 JsonCode 节点的构造便利函数、
 * syscall key 常量表，以及 With 绑定上下文类型。
 */

import * as JsonCode from '@/middle/ir/json-code.ts'
import { TypeInfo } from '@/middle/analysis/analysis-type.ts'

// ============================================================
// With 绑定上下文
// ============================================================

export interface WithBinding {
  tempVarId: number
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

export function litField(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'field', arg: v }
}

export function litChar(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'char', arg: v }
}

export function litBool(v: boolean): JsonCode.Literal {
  return { kind: 'literal', key: 'bool', arg: v ? 'true' : 'false' }
}

export function litNull(): JsonCode.Literal {
  // ISO 7185 6.4.4: nil-value，JS 中用 null 表示
  return { kind: 'literal', key: 'null', arg: 'null' }
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
  hookFunctionEnter: 'hook.function.enter',
  // mem
  memDefaultArray: 'mem.default.array',
  memDefaultRec: 'mem.default.rec',
  // set（构造类，阶段3 处理；运算类已由 lowering.* 泛型化）
  setEmpty: 'set.empty',
  setRange: 'set.range',
  setElem: 'set.elem',
  setLiteral: 'set.literal',
  // file
  fileCreate: 'file.create',
  fileReset: 'file.reset',
  fileRewrite: 'file.rewrite',
  fileGet: 'file.get',
  fileGetChar: 'file.get.char',
  filePut: 'file.put',
  fileEof: 'file.eof',
  fileEoln: 'file.eoln',
  filePeek: 'file.peek',
  filePeekChar: 'file.peek.char',
  fileRecReset: 'file.rec.reset',
  fileRecRewrite: 'file.rec.rewrite',
  fileRecGet: 'file.rec.get',
  fileRecPut: 'file.rec.put',
  fileRecSetbuf: 'file.rec.setbuf',
  fileRecEof: 'file.rec.eof',
  fileRecPeek: 'file.rec.peek',
  // rec
  recCopy: 'rec.copy',
  recSet: 'rec.set',
  recField: 'rec.field',
  // cell
  cellCreate: 'cell.create',
  cellGet: 'cell.get',
  cellSet: 'cell.set',
  // array
  arrayGet: 'array.get',
  arraySet: 'array.set',
  // str.to.char.array：字符串字面量 → 1-based packed array[1..n] of char
  strToCharArray: 'str.to.char.array',
  // array.char.resize：char 数组边界转换（目标 low≠1 时使用）
  arrayCharResize: 'array.char.resize',
  // range / steps / program
  rangeCheck: 'range.check',
  stepsCheck: 'steps.check',
  programFileUrl: 'program.fileUrl',
  // io
  ioPage: 'io.page',
  ioEof: 'io.eof',
  ioEoln: 'io.eoln',
  ioWritelnFile: 'io.writeln.file',
  ioWriteln: 'io.writeln',
  ioReadlnSkipFile: 'io.readln.skip.file',
  ioReadlnSkip: 'io.readln.skip',
  // io.write.${suffix}
  ioWritei32: 'io.write.i32',
  ioWriteF64: 'io.write.f64',
  ioWriteBool: 'io.write.bool',
  ioWriteChar: 'io.write.char',
  ioWriteCharArray: 'io.write.char.array',
  ioWriteSet: 'io.write.set',
  // io.write.${suffix}.file
  ioWritei32File: 'io.write.i32.file',
  ioWriteF64File: 'io.write.f64.file',
  ioWriteBoolFile: 'io.write.bool.file',
  ioWriteCharFile: 'io.write.char.file',
  ioWriteCharArrayFile: 'io.write.char.array.file',
  ioWriteSetFile: 'io.write.set.file',
  // io.write.${suffix}.fmt
  ioWritei32Fmt: 'io.write.i32.fmt',
  ioWriteF64Fmt: 'io.write.f64.fmt',
  ioWriteBoolFmt: 'io.write.bool.fmt',
  ioWriteCharFmt: 'io.write.char.fmt',
  ioWriteCharArrayFmt: 'io.write.char.array.fmt',
  ioWriteSetFmt: 'io.write.set.fmt',
  // io.write.${suffix}.fmt.file
  ioWritei32FmtFile: 'io.write.i32.fmt.file',
  ioWriteF64FmtFile: 'io.write.f64.fmt.file',
  ioWriteBoolFmtFile: 'io.write.bool.fmt.file',
  ioWriteCharFmtFile: 'io.write.char.fmt.file',
  ioWriteCharArrayFmtFile: 'io.write.char.array.fmt.file',
  ioWriteSetFmtFile: 'io.write.set.fmt.file',
  // io.read.${suffix}
  ioReadi32: 'io.read.i32',
  ioReadF64: 'io.read.f64',
  ioReadBool: 'io.read.bool',
  ioReadChar: 'io.read.char',
  ioReadCharArray: 'io.read.char.array',
  ioReadSet: 'io.read.set',
  // io.read.${suffix}.file
  ioReadi32File: 'io.read.i32.file',
  ioReadF64File: 'io.read.f64.file',
  ioReadBoolFile: 'io.read.bool.file',
  ioReadCharFile: 'io.read.char.file',
  ioReadCharArrayFile: 'io.read.char.array.file',
  ioReadSetFile: 'io.read.set.file',
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
} as const
export type SyscallKey = (typeof syscallKeys)[keyof typeof syscallKeys]
