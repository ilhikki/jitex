/*
 * pascal-to-js 编译器自带的 syscall 重写表。
 *
 * 这里是编译期优化、类型分派、指令展开等变换逻辑的归属点。
 *
 * 阶段1：算术 / 逻辑 / 比较 / 转换 / 指针。
 *   lowering 侧产泛型 key + type 参数（如 lowering.add[left, leftType, right, rightType]），
 *   本表消费 type 参数，产出 runtime.* 终态 key（如 runtime.i32.add / runtime.f32.add /
 *   runtime.set.union），并移除 type 参数。
 *
 * 每轮调用返回新表，无共享 mutable state。
 * 尚未迁移的 lowering key（阶段2/3/4）不在表中，走 defaultRewriter 原样透传。
 */

import type * as JsonCode from '@/middle/ir/json-code.ts'
import type { TypeDescriptor } from '@/middle/lowering/type.ts'
import { rtKeys } from './runtime-keys.ts'
import type { SyscallRewriteTable } from './rewrite.ts'

// ============================================================
// 工具
// ============================================================

function sc(key: string, args: JsonCode.Expr[]): JsonCode.Syscall {
  return { kind: 'syscall', key, args }
}

function litInt(v: number): JsonCode.Literal {
  return { kind: 'literal', key: 'i32', arg: String(v) }
}

/** 解析 type 描述字面量参数（lowering 用 typeDescLiteral 产出） */
function parseType(arg: JsonCode.Expr | undefined): TypeDescriptor | undefined {
  if (!arg || arg.kind !== 'literal' || arg.key !== 'type') {
    return undefined
  }
  return JSON.parse(arg.arg) as TypeDescriptor
}

/** 源码类型系统记 f64，实际精度为 f32 */
function isFloat(t: TypeDescriptor | undefined): boolean {
  return t?.tag === 'f64'
}

function isSet(t: TypeDescriptor | undefined): boolean {
  return t?.tag === 'set'
}

// ============================================================
// rewriter 生成器
// ============================================================

/**
 * 二元运算：args = [left, leftType, right, rightType]。
 * set 优先（提供 setKey 且左值为 set）；否则含 f64 走 f32，否则 i32。
 */
function binary(i32Key: string, f32Key: string, setKey?: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const lt = parseType(sys.args[1])
    const rt = parseType(sys.args[3])
    const l = sys.args[0]
    const r = sys.args[2]
    if (setKey && isSet(lt)) {
      return sc(setKey, [l, r])
    }
    return sc(isFloat(lt) || isFloat(rt) ? f32Key : i32Key, [l, r])
  }
}

/** 二元运算（类型固定）：args = [left, right] */
function binaryFixed(key: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => sc(key, [sys.args[0], sys.args[1]])
}

/**
 * 逻辑 / 位运算：args = [left, leftType, right, rightType]。
 * 左值为 i32 → 位运算 key；否则（bool）→ 逻辑 key。
 */
function logical(i32Key: string, boolKey: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const lt = parseType(sys.args[1])
    const l = sys.args[0]
    const r = sys.args[2]
    return sc(lt?.tag === 'i32' ? i32Key : boolKey, [l, r])
  }
}

/** 比较：args = [left, leftType, right, rightType]，set 优先 */
function compare(setKey: string | undefined, cmpKey: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const lt = parseType(sys.args[1])
    const l = sys.args[0]
    const r = sys.args[2]
    return sc(setKey && isSet(lt) ? setKey : cmpKey, [l, r])
  }
}

/** 一元：args = [value, type]，i32 与其它（bool）分流 */
function unaryI32OrOther(i32Key: string, otherKey: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const t = parseType(sys.args[1])
    return sc(t?.tag === 'i32' ? i32Key : otherKey, [sys.args[0]])
  }
}

/** 一元：args = [value, type]，f64 与 i32 分流 */
function unaryFloatOrI32(f32Key: string, i32Key: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const t = parseType(sys.args[1])
    return sc(isFloat(t) ? f32Key : i32Key, [sys.args[0]])
  }
}

/** 一元（类型固定）：args = [value] */
function unary(key: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => sc(key, [sys.args[0]])
}

/** pred / succ：args = [value, type] */
function predSucc(isSucc: boolean) {
  const i32Key = isSucc ? rtKeys.i32Add : rtKeys.i32Sub
  const f32Key = isSucc ? rtKeys.f32Add : rtKeys.f32Sub
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const t = parseType(sys.args[1])
    const x = sys.args[0]
    // char：转 i32 运算后转回 char
    if (t?.tag === 'char') {
      return sc(rtKeys.castI32ToChar, [
        sc(i32Key, [sc(rtKeys.castCharToI32, [x]), litInt(1)]),
      ])
    }
    // enum：序数范围 0..enumCount-1，越界报错
    if (t?.tag === 'enum' && t.enumCount !== undefined) {
      return sc(rtKeys.rangeCheck, [
        sc(i32Key, [x, litInt(1)]),
        litInt(0),
        litInt(t.enumCount - 1),
      ])
    }
    // subrange：按上下界报错
    if (t?.tag === 'subrange' && t.low !== undefined && t.high !== undefined) {
      return sc(rtKeys.rangeCheck, [
        sc(i32Key, [x, litInt(1)]),
        litInt(t.low),
        litInt(t.high),
      ])
    }
    // f64 / i32
    return sc(isFloat(t) ? f32Key : i32Key, [x, litInt(1)])
  }
}

/** ord(x)：args = [value, type]；char/bool 需转换，序数类型原样返回 */
function ordRewrite(sys: JsonCode.Syscall): JsonCode.Expr {
  const t = parseType(sys.args[1])
  const x = sys.args[0]
  if (t?.tag === 'char') {
    return sc(rtKeys.castCharToI32, [x])
  }
  if (t?.tag === 'bool') {
    return sc(rtKeys.castBoolToI32, [x])
  }
  // integer / enum / subrange：已是 i32
  return x
}

// ============================================================
// 表
// ============================================================

export function buildPascalRewriteTable(): SyscallRewriteTable {
  return {
    // ---------- 二元算术 / 集合 ----------
    'lowering.add': binary(rtKeys.i32Add, rtKeys.f32Add, rtKeys.setUnion),
    'lowering.sub': binary(rtKeys.i32Sub, rtKeys.f32Sub, rtKeys.setDiff),
    'lowering.mul': binary(rtKeys.i32Mul, rtKeys.f32Mul, rtKeys.setIntersect),
    'lowering.div': binaryFixed(rtKeys.f32Div),
    'lowering.intDiv': binaryFixed(rtKeys.i32Div),
    'lowering.mod': binaryFixed(rtKeys.i32Mod),

    // ---------- 逻辑 / 位运算 ----------
    'lowering.and': logical(rtKeys.i32And, rtKeys.boolAnd),
    'lowering.or': logical(rtKeys.i32Or, rtKeys.boolOr),

    // ---------- 一元 ----------
    'lowering.neg': unaryFloatOrI32(rtKeys.f32Neg, rtKeys.i32Neg),
    'lowering.not': unaryI32OrOther(rtKeys.i32Not, rtKeys.boolNot),
    'lowering.abs': unaryFloatOrI32(rtKeys.f32Abs, rtKeys.i32Abs),

    // ---------- 数学函数 ----------
    'lowering.sqr': (sys) => {
      const t = parseType(sys.args[1])
      const x = sys.args[0]
      return sc(isFloat(t) ? rtKeys.f32Mul : rtKeys.i32Mul, [x, x])
    },
    'lowering.sqrt': unary(rtKeys.f32Sqrt),
    'lowering.sin': unary(rtKeys.f32Sin),
    'lowering.cos': unary(rtKeys.f32Cos),
    'lowering.exp': unary(rtKeys.f32Exp),
    'lowering.ln': unary(rtKeys.f32Ln),
    'lowering.arctan': unary(rtKeys.f32Arctan),
    'lowering.odd': unary(rtKeys.i32Odd),

    // ---------- 转换 ----------
    'lowering.trunc': unary(rtKeys.castF32ToI32),
    'lowering.round': unary(rtKeys.castF32ToI32Round),
    'lowering.ord': ordRewrite,
    'lowering.chr': unary(rtKeys.castI32ToChar),
    'lowering.pred': predSucc(false),
    'lowering.succ': predSucc(true),

    // ---------- 比较 ----------
    'lowering.eq': compare(rtKeys.setEq, rtKeys.cmpEq),
    'lowering.ne': compare(rtKeys.setNe, rtKeys.cmpNe),
    'lowering.lt': compare(undefined, rtKeys.cmpLt),
    'lowering.le': compare(rtKeys.setLe, rtKeys.cmpLe),
    'lowering.gt': compare(undefined, rtKeys.cmpGt),
    'lowering.ge': compare(rtKeys.setGe, rtKeys.cmpGe),

    // ---------- in ----------
    'lowering.in': (sys) => sc(rtKeys.setIn, [sys.args[0], sys.args[2]]),

    // ---------- 指针 ----------
    'lowering.ptr.deref': (sys) => sc(rtKeys.ptrDeref, sys.args),
    'lowering.ptr.assign': (sys) => sc(rtKeys.ptrAssign, sys.args),
    'lowering.ptr.dispose.check': (sys) => sc(rtKeys.ptrDisposeCheck, sys.args),
  }
}
