import * as JsonCode from '@/middle/ir/json-code.ts'
import { TypeInfo } from '@/middle/analysis/analysis-type.ts'

export interface WithBinding {
  tempVarId: number

  typeInfo: TypeInfo
  fields: Map<string, TypeInfo>
}

export class AssertionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssertionError'
  }
}

export function ref(varId: number): JsonCode.Ref {
  return { kind: 'ref', varId }
}

export function litInt(v: number | string): JsonCode.Literal {
  return { kind: 'literal', key: 'number', arg: String(v) }
}

export function litReal(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'number', arg: v }
}

export function litStr(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'string', arg: v }
}

export function litBytes(v: string): JsonCode.Literal {
  const bytes = Array.from(v, (c) => c.charCodeAt(0))
  return { kind: 'literal', key: 'bytes', arg: JSON.stringify(bytes) }
}

export function litField(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'field', arg: v }
}

export function litChar(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'number', arg: String(v.charCodeAt(0)) }
}

export function litBool(v: boolean): JsonCode.Literal {
  return { kind: 'literal', key: 'number', arg: v ? '1' : '0' }
}

export function litNull(): JsonCode.Literal {
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

export function assignStmt(target: JsonCode.Ref, value: JsonCode.Expr): JsonCode.Eval {
  return evalStmt(syscall(syscallKeys.assign, [target, value]))
}

export function evalStmt(expr: JsonCode.Expr): JsonCode.Eval {
  return { kind: 'eval', expr }
}

export function returnStmt(value?: JsonCode.Expr): JsonCode.Return {
  return { kind: 'return', value }
}

export const syscallKeys = {
  hookFunctionEnter: 'lowering.hook.function.enter',
  stepsCheck: 'lowering.steps.check',
  rangeCheck: 'lowering.range.check',

  assign: 'lowering.assign',

  callPrefix: 'lowering.call.',

  widthSpec: 'lowering.widthspec',

  memDefault: 'lowering.mem.default',
  memCopy: 'lowering.mem.copy',

  setEmpty: 'lowering.set.empty',
  setRange: 'lowering.set.range',
  setElem: 'lowering.set.elem',
  setLiteral: 'lowering.set.literal',

  fileCreate: 'lowering.file.create',
  fileReset: 'lowering.file.reset',
  fileRewrite: 'lowering.file.rewrite',
  fileGet: 'lowering.file.get',
  filePut: 'lowering.file.put',
  filePeek: 'lowering.file.peek',
  fileEof: 'lowering.file.eof',
  fileEoln: 'lowering.file.eoln',
  programFileUrl: 'lowering.program.fileUrl',

  ioWrite: 'lowering.io.write',
  ioWriteln: 'lowering.io.writeln',
  ioRead: 'lowering.io.read',
  ioReadlnSkip: 'lowering.io.readln.skip',
  ioPage: 'lowering.io.page',
  ioEof: 'lowering.io.eof',
  ioEoln: 'lowering.io.eoln',

  recAccess: 'lowering.rec.access',
  recAssign: 'lowering.rec.assign',
  recCopy: 'lowering.rec.copy',
  arrayAccess: 'lowering.array.access',
  arrayAssign: 'lowering.array.assign',
  cellCreate: 'lowering.cell.create',
  cellGet: 'lowering.cell.get',
  cellSet: 'lowering.cell.set',

  add: 'lowering.add',
  sub: 'lowering.sub',
  mul: 'lowering.mul',
  and: 'lowering.and',
  or: 'lowering.or',

  div: 'lowering.div',
  intDiv: 'lowering.intDiv',
  mod: 'lowering.mod',

  neg: 'lowering.neg',
  not: 'lowering.not',
  abs: 'lowering.abs',

  sqr: 'lowering.sqr',
  sqrt: 'lowering.sqrt',
  sin: 'lowering.sin',
  cos: 'lowering.cos',
  exp: 'lowering.exp',
  ln: 'lowering.ln',
  arctan: 'lowering.arctan',
  odd: 'lowering.odd',

  trunc: 'lowering.trunc',
  round: 'lowering.round',
  ord: 'lowering.ord',
  chr: 'lowering.chr',
  pred: 'lowering.pred',
  succ: 'lowering.succ',

  eq: 'lowering.eq',
  ne: 'lowering.ne',
  lt: 'lowering.lt',
  le: 'lowering.le',
  gt: 'lowering.gt',
  ge: 'lowering.ge',
  in: 'lowering.in',

  ptrDeref: 'lowering.ptr.deref',
  ptrAssign: 'lowering.ptr.assign',
  ptrDisposeCheck: 'lowering.ptr.dispose.check',

  callIndirect: 'lowering.call.indirect',

  pack: 'lowering.pack',
  unpack: 'lowering.unpack',
} as const
export type SyscallKey = (typeof syscallKeys)[keyof typeof syscallKeys]
