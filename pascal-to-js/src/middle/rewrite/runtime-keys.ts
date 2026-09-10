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
} as const
