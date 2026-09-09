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
  // set
  setEmpty: 'set.empty',
  setUnion: 'set.union',
  setIntersect: 'set.intersect',
  setDiff: 'set.diff',
  setEq: 'set.eq',
  setNe: 'set.ne',
  setLe: 'set.le',
  setGe: 'set.ge',
  setRange: 'set.range',
  setElem: 'set.elem',
  setLiteral: 'set.literal',
  setIn: 'set.in',
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
  // cell / ptr
  cellCreate: 'cell.create',
  cellGet: 'cell.get',
  cellSet: 'cell.set',
  ptrAssign: 'ptr.assign',
  ptrDeref: 'ptr.deref',
  ptrDisposeCheck: 'ptr.dispose.check',
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
  // cmp
  cmpEq: 'cmp.eq',
  cmpNe: 'cmp.ne',
  cmpLt: 'cmp.lt',
  cmpLe: 'cmp.le',
  cmpGt: 'cmp.gt',
  cmpGe: 'cmp.ge',
  // i32
  i32Add: 'i32.add',
  i32Sub: 'i32.sub',
  i32Mul: 'i32.mul',
  i32Div: 'i32.div',
  i32Mod: 'i32.mod',
  i32And: 'i32.and',
  i32Or: 'i32.or',
  i32Not: 'i32.not',
  i32Neg: 'i32.neg',
  i32Abs: 'i32.abs',
  i32Odd: 'i32.odd',
  // f64
  f64Add: 'f64.add',
  f64Sub: 'f64.sub',
  f64Mul: 'f64.mul',
  f64Div: 'f64.div',
  f64Neg: 'f64.neg',
  f64Abs: 'f64.abs',
  f64Sqrt: 'f64.sqrt',
  f64Sin: 'f64.sin',
  f64Cos: 'f64.cos',
  f64Exp: 'f64.exp',
  f64Ln: 'f64.ln',
  f64Arctan: 'f64.arctan',
  // bool
  boolAnd: 'bool.and',
  boolOr: 'bool.or',
  boolNot: 'bool.not',
  // cast
  castCharToi32: 'cast.char.to.i32',
  castBoolToi32: 'cast.bool.to.i32',
  casti32ToChar: 'cast.i32.to.char',
  castF64Toi32: 'cast.f64.to.i32',
  castF64Toi32Round: 'cast.f64.to.i32.round',
} as const
export type SyscallKey = (typeof syscallKeys)[keyof typeof syscallKeys]
