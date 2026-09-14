/*
 * runtime syscall key 常量。
 *
 * 由 rewrite 产出、runtime handler 消费。命名约定：一律 'runtime.' 前缀。
 *
 * 与本文件对应的 lowering 侧 key（'lowering.' 前缀）定义在
 * src/middle/lowering/helpers.ts。lowering 产泛型 key + type 参数，
 * rewrite 消费 type 后产出这里的终态 key。
 */

export const rtKeys = {
  // ---------- i32 ----------
  i32Add: 'runtime.i32.add',
  i32Sub: 'runtime.i32.sub',
  i32Mul: 'runtime.i32.mul',
  i32Div: 'runtime.i32.div',
  i32Mod: 'runtime.i32.mod',
  i32Neg: 'runtime.i32.neg',
  i32Abs: 'runtime.i32.abs',
  i32Odd: 'runtime.i32.odd',
  i32And: 'runtime.i32.and',
  i32Or: 'runtime.i32.or',
  i32Not: 'runtime.i32.not',

  // ---------- f32（源码类型系统记为 f64，实际精度为 f32）----------
  f32Add: 'runtime.f32.add',
  f32Sub: 'runtime.f32.sub',
  f32Mul: 'runtime.f32.mul',
  f32Div: 'runtime.f32.div',
  f32Neg: 'runtime.f32.neg',
  f32Abs: 'runtime.f32.abs',
  f32Sqrt: 'runtime.f32.sqrt',
  f32Sin: 'runtime.f32.sin',
  f32Cos: 'runtime.f32.cos',
  f32Exp: 'runtime.f32.exp',
  f32Ln: 'runtime.f32.ln',
  f32Arctan: 'runtime.f32.arctan',

  // ---------- bool ----------
  boolAnd: 'runtime.bool.and',
  boolOr: 'runtime.bool.or',
  boolNot: 'runtime.bool.not',

  // ---------- cmp ----------
  cmpEq: 'runtime.cmp.eq',
  cmpNe: 'runtime.cmp.ne',
  cmpLt: 'runtime.cmp.lt',
  cmpLe: 'runtime.cmp.le',
  cmpGt: 'runtime.cmp.gt',
  cmpGe: 'runtime.cmp.ge',

  // ---------- set ----------
  setUnion: 'runtime.set.union',
  setIntersect: 'runtime.set.intersect',
  setDiff: 'runtime.set.diff',
  setEq: 'runtime.set.eq',
  setNe: 'runtime.set.ne',
  setLe: 'runtime.set.le',
  setGe: 'runtime.set.ge',
  setIn: 'runtime.set.in',

  // ---------- cast ----------
  castCharToI32: 'runtime.cast.char.to.i32',
  castBoolToI32: 'runtime.cast.bool.to.i32',
  castI32ToChar: 'runtime.cast.i32.to.char',
  castF32ToI32: 'runtime.cast.f32.to.i32',
  castF32ToI32Round: 'runtime.cast.f32.to.i32.round',

  // ---------- ptr ----------
  ptrDeref: 'runtime.ptr.deref',
  ptrAssign: 'runtime.ptr.assign',
  ptrDisposeCheck: 'runtime.ptr.dispose.check',

  // ---------- check ----------
  rangeCheck: 'runtime.range.check',

  // ============================================================
  // 阶段 2+3：文件 / 转换 / 内存原语
  // ============================================================

  // ---------- 文件（不接类型参数，按句柄自身状态行事）----------
  fileReset: 'runtime.file.reset',
  fileRewrite: 'runtime.file.rewrite',
  fileGet: 'runtime.file.get',
  filePeek: 'runtime.file.peek',
  filePut: 'runtime.file.put',
  fileReadChar: 'runtime.file.readChar',
  fileReadToken: 'runtime.file.readToken',
  fileWrite: 'runtime.file.write',
  fileReadln: 'runtime.file.readln',
  fileWriteln: 'runtime.file.writeln',
  fileEof: 'runtime.file.eof',
  fileEoln: 'runtime.file.eoln',
  filePage: 'runtime.file.page',
  fileCreate: 'runtime.file.create',
  programFileUrl: 'runtime.program.fileUrl',

  // ---------- 转换（值 ↔ 文件单位）----------
  i32ToStr: 'runtime.convert.i32.To.str',
  i32ToBytes: 'runtime.convert.i32.To.bytes',
  i32ToChar: 'runtime.convert.i32.To.char',
  bytesToStrField: 'runtime.convert.bytes.To.str.field',
  f64ToStr: 'runtime.convert.f64.To.str',
  f64ToBytes: 'runtime.convert.f64.To.bytes',
  boolToStr: 'runtime.convert.bool.To.str',
  boolToBytes: 'runtime.convert.bool.To.bytes',
  strToI32: 'runtime.convert.str.To.i32',
  strToF64: 'runtime.convert.str.To.f64',
  strToBool: 'runtime.convert.str.To.bool',
  bytesToI32: 'runtime.convert.bytes.To.i32',
  bytesToF64: 'runtime.convert.bytes.To.f64',
  bytesToBool: 'runtime.convert.bytes.To.bool',
  charToI32: 'runtime.convert.char.To.i32',

  // ---------- 内存（类型在 get/set 时传入）----------
  memNew: 'runtime.mem.new',
  memCopy: 'runtime.mem.copy',
  memClone: 'runtime.mem.clone',
  numGet: 'runtime.num.get',
  numSet: 'runtime.num.set',
  viewSub: 'runtime.view.sub',

  // ---------- object 数组（元素非字节可寻址，如 file）----------
  arrNew: 'runtime.arr.new',
  arrGet: 'runtime.arr.get',
  arrSet: 'runtime.arr.set',

  // ---------- cell ----------
  cellNew: 'runtime.cell.new',
  cellGet: 'runtime.cell.get',
  cellSet: 'runtime.cell.set',

  // ---------- set（构造类；运算类见上）----------
  setRange: 'runtime.set.range',
  setElem: 'runtime.set.elem',
  setLiteral: 'runtime.set.literal',
} as const
