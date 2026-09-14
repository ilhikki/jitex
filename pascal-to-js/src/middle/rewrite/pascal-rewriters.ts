/*
 * pascal-to-js 编译器自带的 syscall 重写表。
 *
 * 这里是编译期类型翻译、布局计算的归属点：
 *   lowering 侧产「携带类型参数」的 `lowering.*` syscall，
 *   本表消费类型参数，产出 `runtime.*` 终态 key（原语组合，可嵌套）。
 *
 * 每轮调用返回新表，无共享 mutable state。
 */

import type * as JsonCode from '@/middle/ir/json-code.ts'
import type { TypeDescriptor } from '@/middle/lowering/type.ts'
import {
  arrayCount,
  arraySlot,
  codecOf,
  fieldSlot,
  isByteScalar,
  isScalar,
  objectArrayElem,
  remainingArrayType,
  setSize,
  sizeOf,
} from './type-layout.ts'
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

function litStr(s: string): JsonCode.Literal {
  return { kind: 'literal', key: 'str', arg: s }
}

function litType(td: TypeDescriptor): JsonCode.Literal {
  return { kind: 'literal', key: 'type', arg: JSON.stringify(td) }
}

function isNullLit(e: JsonCode.Expr | undefined): boolean {
  return e !== undefined && e.kind === 'literal' && e.key === 'null'
}

/** 解析 type 描述字面量参数 */
function parseType(arg: JsonCode.Expr | undefined): TypeDescriptor | undefined {
  if (!arg || arg.kind !== 'literal' || arg.key !== 'type') {
    return undefined
  }
  return JSON.parse(arg.arg) as TypeDescriptor
}

function isFloat(t: TypeDescriptor | undefined): boolean {
  return t?.tag === 'f64'
}

function isSet(t: TypeDescriptor | undefined): boolean {
  return t?.tag === 'set'
}

/** 是否为 char 数组（ISO 字符串）：直接当字节序列处理，零转换 */
function isCharArray(t: TypeDescriptor | undefined): boolean {
  return t?.tag === 'array' && t.elem?.tag === 'char'
}

/** 目标文件是否为二进制 record 文件（file of rec）—— 只有它走字节转换 */
function isBinaryFile(fileType: TypeDescriptor | undefined): boolean {
  return fileType?.tag === 'file' && fileType.elem?.tag === 'rec'
}

/**
 * 目标文件是否为二进制字节文件（`packed file of byte`）。
 *
 * 元素是单字节标量：值即字节本身，写出/读入零转换（TeX 的 `dvi_file`、
 * `tfm_file` 都是这一类，逐个字节 write / get）。
 */
function isByteFile(fileType: TypeDescriptor | undefined): boolean {
  return fileType?.tag === 'file' && isByteScalar(fileType.elem)
}

// ============================================================
// 阶段1：算术 / 逻辑 / 比较 / 转换
// ============================================================

function binary(i32Key: string, f32Key: string, setKey?: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const lt = parseType(sys.args[1])
    const rt = parseType(sys.args[3])
    const l = sys.args[0]
    const r = sys.args[2]
    if (setKey && isSet(lt)) {
      const size = setSize(lt!)
      return sc(setKey, [l, r, litInt(size)])
    }
    return sc(isFloat(lt) || isFloat(rt) ? f32Key : i32Key, [l, r])
  }
}

function binaryFixed(key: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => sc(key, [sys.args[0], sys.args[1]])
}

function logical(i32Key: string, boolKey: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const lt = parseType(sys.args[1])
    return sc(lt?.tag === 'i32' ? i32Key : boolKey, [sys.args[0], sys.args[2]])
  }
}

function compare(setKey: string | undefined, cmpKey: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const lt = parseType(sys.args[1])
    const l = sys.args[0]
    const r = sys.args[2]
    if (setKey && isSet(lt)) {
      return sc(setKey, [l, r, litInt(setSize(lt!))])
    }
    return sc(cmpKey, [l, r])
  }
}

function unaryI32OrOther(i32Key: string, otherKey: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const t = parseType(sys.args[1])
    return sc(t?.tag === 'i32' ? i32Key : otherKey, [sys.args[0]])
  }
}

function unaryFloatOrI32(f32Key: string, i32Key: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const t = parseType(sys.args[1])
    return sc(isFloat(t) ? f32Key : i32Key, [sys.args[0]])
  }
}

function unary(key: string) {
  return (sys: JsonCode.Syscall): JsonCode.Expr => sc(key, [sys.args[0]])
}

function predSucc(isSucc: boolean) {
  const i32Key = isSucc ? rtKeys.i32Add : rtKeys.i32Sub
  const f32Key = isSucc ? rtKeys.f32Add : rtKeys.f32Sub
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const t = parseType(sys.args[1])
    const x = sys.args[0]
    // char 即 ord 值 → 直接 i32 加减（ISO 6.6.6.4）
    if (t?.tag === 'char') {
      return sc(i32Key, [x, litInt(1)])
    }
    if (t?.tag === 'enum' && t.enumCount !== undefined) {
      return sc(rtKeys.rangeCheck, [
        sc(i32Key, [x, litInt(1)]),
        litInt(0),
        litInt(t.enumCount - 1),
      ])
    }
    if (t?.low !== undefined && t?.high !== undefined) {
      return sc(rtKeys.rangeCheck, [sc(i32Key, [x, litInt(1)]), litInt(t.low), litInt(t.high)])
    }
    return sc(isFloat(t) ? f32Key : i32Key, [x, litInt(1)])
  }
}

/** ord / chr：char 已用 ord 值表示，两者都退化为 identity */
function ordRewrite(sys: JsonCode.Syscall): JsonCode.Expr {
  return sys.args[0]
}

// ============================================================
// 阶段2/3：内存 / 文件 / IO
// ============================================================

/** 数组元素的字节偏移表达式：Σ (idx_i - low_i) × stride_i */
function offsetExpr(indices: JsonCode.Expr[], lows: number[], strides: number[]): JsonCode.Expr {
  const terms = indices.map((idx, i) => {
    const low = lows[i] ?? 0
    const stride = strides[i] ?? 1
    const base = low === 0 ? idx : sc(rtKeys.i32Sub, [idx, litInt(low)])
    return stride === 1 ? base : sc(rtKeys.i32Mul, [base, litInt(stride)])
  })
  return terms.reduce((a, b) => sc(rtKeys.i32Add, [a, b]))
}

/** object 数组的下标表达式：同 offsetExpr，但步长以「元素」为单位（不是字节） */
function elemIndexExpr(td: TypeDescriptor, indices: JsonCode.Expr[]): JsonCode.Expr {
  const dims: Array<{ low: number; high: number }> = []
  let cur: TypeDescriptor | undefined = td
  while (cur && cur.tag === 'array') {
    for (const d of cur.dims ?? []) {
      dims.push(d)
    }
    cur = cur.elem
  }
  const strides = new Array<number>(dims.length).fill(1)
  for (let i = dims.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * (dims[i + 1].high - dims[i + 1].low + 1)
  }
  return offsetExpr(indices, dims.map((d) => d.low), strides)
}

/** 值 → 文件单位 的转换 key */
function toConvertKey(td: TypeDescriptor | undefined, binary: boolean): string {
  if (binary) {
    switch (td?.tag) {
      case 'f64':
        return rtKeys.f64ToBytes
      case 'bool':
        return rtKeys.boolToBytes
      default:
        return rtKeys.i32ToBytes
    }
  }
  switch (td?.tag) {
    case 'f64':
      return rtKeys.f64ToStr
    case 'bool':
      return rtKeys.boolToStr
    case 'char':
      return rtKeys.i32ToChar
    default:
      return rtKeys.i32ToStr
  }
}

/** 文件单位 → 值 的转换 key */
function fromConvertKey(td: TypeDescriptor | undefined, binary: boolean): string {
  if (binary) {
    switch (td?.tag) {
      case 'f64':
        return rtKeys.bytesToF64
      case 'bool':
        return rtKeys.bytesToBool
      default:
        return rtKeys.bytesToI32
    }
  }
  switch (td?.tag) {
    case 'f64':
      return rtKeys.strToF64
    case 'bool':
      return rtKeys.strToBool
    case 'char':
      return rtKeys.charToI32
    default:
      return rtKeys.strToI32
  }
}

// ============================================================
// 表
// ============================================================

export function buildPascalRewriteTable(): SyscallRewriteTable {
  return {
    // ---------- 阶段1：二元算术 / 集合 ----------
    'lowering.add': binary(rtKeys.i32Add, rtKeys.f32Add, rtKeys.setUnion),
    'lowering.sub': binary(rtKeys.i32Sub, rtKeys.f32Sub, rtKeys.setDiff),
    'lowering.mul': binary(rtKeys.i32Mul, rtKeys.f32Mul, rtKeys.setIntersect),
    'lowering.div': binaryFixed(rtKeys.f32Div),
    'lowering.intDiv': binaryFixed(rtKeys.i32Div),
    'lowering.mod': binaryFixed(rtKeys.i32Mod),

    // ---------- 阶段1：逻辑 / 位运算 ----------
    'lowering.and': logical(rtKeys.i32And, rtKeys.boolAnd),
    'lowering.or': logical(rtKeys.i32Or, rtKeys.boolOr),

    // ---------- 阶段1：一元 ----------
    'lowering.neg': unaryFloatOrI32(rtKeys.f32Neg, rtKeys.i32Neg),
    'lowering.not': unaryI32OrOther(rtKeys.i32Not, rtKeys.boolNot),
    'lowering.abs': unaryFloatOrI32(rtKeys.f32Abs, rtKeys.i32Abs),

    // ---------- 阶段1：数学函数 ----------
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

    // ---------- 阶段1：转换 ----------
    'lowering.trunc': unary(rtKeys.castF32ToI32),
    'lowering.round': unary(rtKeys.castF32ToI32Round),
    'lowering.ord': ordRewrite,
    'lowering.chr': ordRewrite,
    'lowering.pred': predSucc(false),
    'lowering.succ': predSucc(true),

    // ---------- 阶段1：比较 ----------
    'lowering.eq': compare(rtKeys.setEq, rtKeys.cmpEq),
    'lowering.ne': compare(rtKeys.setNe, rtKeys.cmpNe),
    'lowering.lt': compare(undefined, rtKeys.cmpLt),
    'lowering.le': compare(rtKeys.setLe, rtKeys.cmpLe),
    'lowering.gt': compare(undefined, rtKeys.cmpGt),
    'lowering.ge': compare(rtKeys.setGe, rtKeys.cmpGe),

    // ---------- 阶段1：in / 指针 ----------
    'lowering.in': (sys) => {
      const st = parseType(sys.args[3])
      return sc(rtKeys.setIn, [sys.args[0], sys.args[2], litInt(setSize(st!))])
    },
    'lowering.ptr.new': (sys) => sc(rtKeys.ptrNew, sys.args),
    'lowering.ptr.free': (sys) => sc(rtKeys.ptrFree, sys.args),
    'lowering.ptr.deref': (sys) => sc(rtKeys.ptrDeref, sys.args),
    'lowering.ptr.assign': (sys) => sc(rtKeys.ptrAssign, sys.args),
    'lowering.ptr.dispose.check': (sys) => sc(rtKeys.ptrDisposeCheck, sys.args),

    // ---------- 阶段2/3：内存 ----------
    'lowering.mem.default': (sys) => {
      const td = parseType(sys.args[0])
      if (td?.tag === 'set') {
        return sc(rtKeys.memNew, [litInt(setSize(td))])
      }
      // file 数组：元素是 object，用 JS Array 承载
      const oe = td && objectArrayElem(td)
      if (oe) {
        return sc(rtKeys.arrNew, [litInt(arrayCount(td!)), litType(oe)])
      }
      return sc(rtKeys.memNew, [litInt(sizeOf(td!))])
    },
    'lowering.mem.copy': (sys) => {
      const td = parseType(sys.args[3])
      return sc(rtKeys.memCopy, [sys.args[0], sys.args[1], sys.args[2], litInt(sizeOf(td!))])
    },

    // ---------- 阶段2/3：set ----------
    'lowering.set.empty': (sys) => {
      const td = parseType(sys.args[0])
      return sc(rtKeys.memNew, [litInt(setSize(td!))])
    },
    'lowering.set.elem': (sys) => {
      const td = parseType(sys.args[1])
      return sc(rtKeys.setElem, [sys.args[0], litInt(setSize(td!))])
    },
    'lowering.set.range': (sys) => {
      const td = parseType(sys.args[2])
      return sc(rtKeys.setRange, [sys.args[0], sys.args[1], litInt(setSize(td!))])
    },
    'lowering.set.literal': (sys) => {
      const td = parseType(sys.args[sys.args.length - 1])
      const elems = sys.args.slice(0, -1)
      const size = litInt(setSize(td!))
      if (elems.length === 0) {
        return sc(rtKeys.memNew, [size])
      }
      return elems.reduce((a, b) => sc(rtKeys.setUnion, [a, b, size]))
    },

    // ---------- 阶段2/3：文件 ----------
    'lowering.file.create': (sys) => sc(rtKeys.fileCreate, [sys.args[0]]),
    'lowering.file.reset': (sys) => sc(rtKeys.fileReset, [sys.args[0], ...sys.args.slice(2)]),
    'lowering.file.rewrite': (sys) => sc(rtKeys.fileRewrite, [sys.args[0], ...sys.args.slice(2)]),
    'lowering.file.get': (sys) => sc(rtKeys.fileGet, [sys.args[0]]),
    'lowering.file.put': (sys) => sc(rtKeys.filePut, [sys.args[0], ...sys.args.slice(2)]),
    'lowering.file.peek': (sys) => {
      const td = parseType(sys.args[1])
      // record 文件：传元素字节大小，供首次分配缓冲区
      if (td?.elem?.tag === 'rec') {
        return sc(rtKeys.filePeek, [sys.args[0], litInt(sizeOf(td.elem))])
      }
      return sc(rtKeys.filePeek, [sys.args[0]])
    },
    'lowering.file.eof': (sys) => sc(rtKeys.fileEof, [sys.args[0]]),
    'lowering.file.eoln': (sys) => sc(rtKeys.fileEoln, [sys.args[0]]),
    'lowering.program.fileUrl': (sys) => sc(rtKeys.programFileUrl, [sys.args[0], sys.args[1]]),

    // ---------- 阶段2/3：IO ----------
    'lowering.io.write': (sys) => {
      const [target, targetType, value, valueType, width, prec] = sys.args
      const vt = parseType(valueType)
      const tt = parseType(targetType)
      // 字符串（char 数组）零转换，直接写字节；
      // 字节文件（file of byte）的值本身就是字节，同样零转换
      if (isByteFile(tt)) {
        return sc(rtKeys.fileWrite, [target, value])
      }
      if (isCharArray(vt)) {
        // ISO 6.9.3.6：string 值带字段宽度时须左补空格或截断（与 integer 等类型不同，
        // 后者的字段宽度只保证最小宽度、不截断）
        if (isNullLit(width)) {
          return sc(rtKeys.fileWrite, [target, value])
        }
        return sc(rtKeys.fileWrite, [target, sc(rtKeys.bytesToStrField, [value, width])])
      }
      const binary = isBinaryFile(tt)
      const key = toConvertKey(vt, binary)
      const convArgs: JsonCode.Expr[] = [value]
      if (!isNullLit(width)) {
        convArgs.push(width)
        if (!isNullLit(prec)) {
          convArgs.push(prec)
        }
      }
      return sc(rtKeys.fileWrite, [target, sc(key, convArgs)])
    },
    'lowering.io.writeln': (sys) => sc(rtKeys.fileWriteln, [sys.args[0]]),
    'lowering.io.read': (sys) => {
      const [target, targetType, valueType] = sys.args
      const vt = parseType(valueType)
      const tt = parseType(targetType)
      // 字节文件：读到的就是字节值，零转换
      if (isByteFile(tt)) {
        return sc(rtKeys.fileReadChar, [target])
      }
      const binary = isBinaryFile(tt)
      const readKey = binary || vt?.tag === 'char' ? rtKeys.fileReadChar : rtKeys.fileReadToken
      const raw = sc(readKey, [target])
      if (isCharArray(vt)) {
        return raw
      }
      return sc(fromConvertKey(vt, binary), [raw])
    },
    'lowering.io.readln.skip': (sys) => sc(rtKeys.fileReadln, [sys.args[0]]),
    'lowering.io.page': (sys) => sc(rtKeys.filePage, [sys.args[0]]),
    'lowering.io.eof': () => sc(rtKeys.fileEof, [litNullLiteral()]),
    'lowering.io.eoln': () => sc(rtKeys.fileEoln, [litNullLiteral()]),

    // ---------- 阶段2/3：数组 / 记录 ----------
    // ISO 6.6.5.4：pack(a, i, z) / unpack(z, a, i) 按元素字节连续搬移
    'lowering.pack': (sys) => {
      const [src, start, dst, srcType, dstType] = sys.args
      const srcArr = arraySlot(parseType(srcType)!)
      return sc(rtKeys.packArray, [
        src,
        litInt(srcArr.lows[0] ?? 0),
        litInt(srcArr.elemSize),
        start,
        dst,
        litInt(arrayCount(parseType(dstType)!)),
      ])
    },
    'lowering.unpack': (sys) => {
      const [src, dst, start, srcType, dstType] = sys.args
      const dstArr = arraySlot(parseType(dstType)!)
      return sc(rtKeys.unpackArray, [
        src,
        dst,
        litInt(dstArr.lows[0] ?? 0),
        litInt(dstArr.elemSize),
        start,
        litInt(arrayCount(parseType(srcType)!)),
      ])
    },
    'lowering.array.access': (sys) => {
      const td = parseType(sys.args[sys.args.length - 1])
      const indices = sys.args.slice(0, -1)
      const arr = indices.shift()!
      return accessAt(arr, td!, indices)
    },
    'lowering.array.assign': (sys) => {
      const td = parseType(sys.args[sys.args.length - 1])
      const rest = sys.args.slice(0, -1)
      const arr = rest.shift()!
      const value = rest.pop()!
      return assignAt(arr, td!, rest, value)
    },
    'lowering.rec.access': (sys) => {
      const td = parseType(sys.args[2])
      const name = (sys.args[1] as JsonCode.Literal).arg
      return accessAt(sys.args[0], td!, [], name)
    },
    'lowering.rec.assign': (sys) => {
      const td = parseType(sys.args[3])
      const name = (sys.args[1] as JsonCode.Literal).arg
      return assignAt(sys.args[0], td!, [], sys.args[2], name)
    },
    'lowering.rec.copy': (sys) => {
      const td = parseType(sys.args[1])
      return sc(rtKeys.memClone, [sys.args[0], litInt(sizeOf(td!))])
    },

    // ---------- 阶段2/3：cell / 检查 ----------
    'lowering.cell.create': (sys) => sc(rtKeys.cellNew, [sys.args[0]]),
    'lowering.cell.get': (sys) => sc(rtKeys.cellGet, [sys.args[0]]),
    'lowering.cell.set': (sys) => sc(rtKeys.cellSet, [sys.args[0], sys.args[1]]),
    'lowering.range.check': (sys) => sc(rtKeys.rangeCheck, sys.args),
    'lowering.steps.check': () => sc('runtime.steps.check', []),
    'lowering.hook.function.enter': () => sc('runtime.hook.function.enter', []),
  }
}

function litNullLiteral(): JsonCode.Literal {
  return { kind: 'literal', key: 'null', arg: 'null' }
}

/**
 * 折叠 `view.sub` 前缀。
 *
 * `mem[i].field` 的 IR 形如 `num.get(view.sub(mem, iOff, size), fOff, codec)`：
 * view.sub 只是把后续访问的基址前移 iOff。这里把内层偏移提取出来，让上层直接
 * 把它叠加进自己的 offset，省掉一层子视图（一次 syscall 调用 + 一次 subarray
 * 分配）。折叠后读写的绝对位置不变，语义等价。
 */
function foldViewSub(base: JsonCode.Expr): { base: JsonCode.Expr; delta?: JsonCode.Expr } {
  if (base.kind === 'syscall' && base.key === rtKeys.viewSub) {
    return { base: base.args[0], delta: base.args[1] }
  }
  return { base }
}

/** 把折叠出的内层偏移叠加到当前 offset 上（当前 offset 为 0 时直接用 delta） */
function addOffset(delta: JsonCode.Expr | undefined, offset: JsonCode.Expr): JsonCode.Expr {
  if (delta === undefined) {
    return offset
  }
  if (offset.kind === 'literal' && offset.key === 'i32' && offset.arg === '0') {
    return delta
  }
  return sc(rtKeys.i32Add, [delta, offset])
}

/** 取容器内的槽位（数组元素 / 记录字段），产出标量读或子视图 */
function accessAt(
  base: JsonCode.Expr,
  td: TypeDescriptor,
  indices: JsonCode.Expr[],
  fieldName?: string,
): JsonCode.Expr {
  if (fieldName === undefined && objectArrayElem(td)) {
    return sc(rtKeys.arrGet, [base, elemIndexExpr(td, indices)])
  }

  const folded = foldViewSub(base)
  let offset: JsonCode.Expr
  let slotType: TypeDescriptor

  if (fieldName !== undefined) {
    const slot = fieldSlot(td, fieldName)
    if (!slot) {
      const fixed = (td.fields ?? []).map((f) => f.name).join(',')
      const branches = (td.variant?.branches ?? [])
        .map((b) => `[${b.fields.map((f) => f.name).join(',')}]`)
        .join('')
      throw new Error(
        `rewrite: record has no field ${fieldName} (tag=${td.tag}; fixed=${fixed}; variant=${branches})`,
      )
    }
    offset = litInt(slot.offset)
    slotType = slot.type
  } else {
    const arr = arraySlot(td)
    offset = offsetExpr(indices, arr.lows, arr.strides)
    // 部分下标（如二维数组的 a[i]）产出剩余维度的子数组视图，而非最内层元素
    slotType = remainingArrayType(arr, indices.length) ?? arr.elemType
  }

  offset = addOffset(folded.delta, offset)
  if (isScalar(slotType)) {
    return sc(rtKeys.numGet, [folded.base, offset, litStr(codecOf(slotType))])
  }
  return sc(rtKeys.viewSub, [folded.base, offset, litInt(sizeOf(slotType))])
}

/** 写容器内的槽位 */
function assignAt(
  base: JsonCode.Expr,
  td: TypeDescriptor,
  indices: JsonCode.Expr[],
  value: JsonCode.Expr,
  fieldName?: string,
): JsonCode.Expr {
  if (fieldName === undefined && objectArrayElem(td)) {
    return sc(rtKeys.arrSet, [base, elemIndexExpr(td, indices), value])
  }

  const folded = foldViewSub(base)
  let offset: JsonCode.Expr
  let slotType: TypeDescriptor

  if (fieldName !== undefined) {
    const slot = fieldSlot(td, fieldName)
    if (!slot) {
      const fixed = (td.fields ?? []).map((f) => f.name).join(',')
      const branches = (td.variant?.branches ?? [])
        .map((b) => `[${b.fields.map((f) => f.name).join(',')}]`)
        .join('')
      throw new Error(
        `rewrite: record has no field ${fieldName} (tag=${td.tag}; fixed=${fixed}; variant=${branches})`,
      )
    }
    offset = litInt(slot.offset)
    slotType = slot.type
  } else {
    const arr = arraySlot(td)
    offset = offsetExpr(indices, arr.lows, arr.strides)
    // 部分下标（如二维数组的 a[i]）产出剩余维度的子数组视图，而非最内层元素
    slotType = remainingArrayType(arr, indices.length) ?? arr.elemType
  }

  offset = addOffset(folded.delta, offset)
  if (isScalar(slotType)) {
    return sc(rtKeys.numSet, [folded.base, offset, litStr(codecOf(slotType)), value])
  }
  return sc(rtKeys.memCopy, [folded.base, offset, value, litInt(sizeOf(slotType))])
}
