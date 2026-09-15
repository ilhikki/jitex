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
  fieldSlot,
  isByteScalar,
  isObjectRepr,
  isScalar,
  remainingArrayType,
  scalarKindOf,
  setSize,
  sizeOf,
} from './type-layout.ts'
import { bytesGetKey, bytesSetKey, rtKeys } from './runtime-keys.ts'
import type { SyscallRewriteTable } from './rewrite.ts'

// 工具

function sc(key: string, args: JsonCode.Expr[]): JsonCode.Syscall {
  return { kind: 'syscall', key, args }
}

function litInt(v: number): JsonCode.Literal {
  return { kind: 'literal', key: 'integer', arg: String(v) }
}

function litStr(s: string): JsonCode.Literal {
  return { kind: 'literal', key: 'string', arg: s }
}

function litReal(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'real', arg: v }
}

function litChar(ch: string): JsonCode.Literal {
  return { kind: 'literal', key: 'char', arg: ch }
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
  return t?.tag === 'real'
}

function isSet(t: TypeDescriptor | undefined): boolean {
  return t?.tag === 'set'
}

/** 是否为 char 数组（ISO 字符串）：直接当字节序列处理，零转换 */
function isCharArray(t: TypeDescriptor | undefined): boolean {
  return t?.tag === 'array' && t.elem?.tag === 'char'
}

/** 目标文件是否为二进制 record 文件（file of record）—— 只有它走字节转换 */
function isBinaryFile(fileType: TypeDescriptor | undefined): boolean {
  return fileType?.tag === 'file' && fileType.elem?.tag === 'record'
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

// 类型 → 无类型常量的降级

/**
 * 文件的存储形态。
 *
 * 只描述「单位是什么」，不含 Pascal 类型语义：
 *   text   —— 单位是字符（UTF-8 文本，含行结束符语义）
 *   bytes  —— 单位是单个字节
 *   blocks —— 单位是定长字节块
 *
 * runtime 据该标量决定存储实现与读写路径，不做 Pascal 类型判断。
 */
function fileKind(fileType: TypeDescriptor | undefined): string {
  const elem = fileType?.elem
  if (elem?.tag === 'record') {
    return 'blocks'
  }
  if (isByteScalar(elem)) {
    return 'bytes'
  }
  return 'text'
}

/**
 * object 表示的类型的默认值表达式，编译期整棵树展开。
 *
 * 含 file / pointer 的类型无法字节化，值由 JS 对象承载（见 isObjectRepr），
 * 因此默认值必须在编译期展开成构造表达式——运行期不再接收类型描述符。
 */
function defaultValueExpr(td: TypeDescriptor): JsonCode.Expr {
  switch (td.tag) {
    case 'integer':
      // 子界型取下界（ISO 7185 6.4.2.4 的变量初始值约定）
      return litInt(td.low ?? 0)
    case 'enum':
    case 'boolean':
      return litInt(0)
    case 'real':
      return litReal('0')
    case 'char':
      return litChar('\x00')
    case 'set':
      return sc(rtKeys.memoryNew, [litInt(setSize(td))])
    case 'pointer':
      // ISO 7185 6.4.4: 未初始化的指针为 nil-value
      return litNullLiteral()
    case 'file':
      return sc(rtKeys.fileCreate, [litStr(fileKind(td))])
    case 'array':
      return isObjectRepr(td)
        ? sc(
          rtKeys.objectNewArray,
          Array.from({ length: arrayCount(td) }, () => defaultValueExpr(td.elem!)),
        )
        : sc(rtKeys.memoryNew, [litInt(sizeOf(td))])
    case 'record':
      return isObjectRepr(td)
        ? sc(rtKeys.objectNewRecord, recordDefaultArgs(td))
        : sc(rtKeys.memoryNew, [litInt(sizeOf(td))])
    default:
      return litInt(0)
  }
}

/**
 * record 默认值的字段名/值实参序列。
 * variant 各分支字段一并预置（union 语义由赋值方负责）。
 */
function recordDefaultArgs(td: TypeDescriptor): JsonCode.Expr[] {
  const args: JsonCode.Expr[] = []
  for (const f of td.fields ?? []) {
    args.push(litStr(f.name), defaultValueExpr(f.type))
  }
  for (const b of td.variant?.branches ?? []) {
    for (const f of b.fields) {
      args.push(litStr(f.name), defaultValueExpr(f.type))
    }
  }
  return args
}

// 阶段1：算术 / 逻辑 / 比较 / 转换

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
    return sc(lt?.tag === 'integer' ? i32Key : boolKey, [sys.args[0], sys.args[2]])
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
    return sc(t?.tag === 'integer' ? i32Key : otherKey, [sys.args[0]])
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
  const i32Key = isSucc ? rtKeys.int32Add : rtKeys.int32Subtract
  const f32Key = isSucc ? rtKeys.float32Add : rtKeys.float32Subtract
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const t = parseType(sys.args[1])
    const x = sys.args[0]
    // char 即 ord 值 → 直接整数加减（ISO 6.6.6.4）
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

// 阶段2/3：内存 / 文件 / IO

/** 数组元素的字节偏移表达式：Σ (idx_i - low_i) × stride_i */
function offsetExpr(indices: JsonCode.Expr[], lows: number[], strides: number[]): JsonCode.Expr {
  const terms = indices.map((idx, i) => {
    const low = lows[i] ?? 0
    const stride = strides[i] ?? 1
    const base = low === 0 ? idx : sc(rtKeys.int32Subtract, [idx, litInt(low)])
    return stride === 1 ? base : sc(rtKeys.int32Multiply, [base, litInt(stride)])
  })
  return terms.reduce((a, b) => sc(rtKeys.int32Add, [a, b]))
}

/** object 数组的下标表达式：同 offsetExpr，但步长以「元素」为单位（不是字节） */
function elemIndexExpr(td: TypeDescriptor, indices: JsonCode.Expr[]): JsonCode.Expr {
  const dims = arrayDims(td)
  return elementOffset(indices, dims)
}

/** 摊平嵌套数组的所有维度（object 数组用，不涉及字节大小） */
function arrayDims(td: TypeDescriptor): Array<{ low: number; high: number }> {
  const dims: Array<{ low: number; high: number }> = []
  let cur: TypeDescriptor | undefined = td
  while (cur && cur.tag === 'array') {
    for (const d of cur.dims ?? []) {
      dims.push(d)
    }
    cur = cur.elem
  }
  return dims
}

/** 按元素步长计算摊平偏移（用于 object 数组的部分/完全下标） */
function elementOffset(
  indices: JsonCode.Expr[],
  dims: Array<{ low: number; high: number }>,
): JsonCode.Expr {
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
      case 'real':
        return rtKeys.convertFloat32ToBytes
      case 'boolean':
        return rtKeys.convertBooleanToBytes
      default:
        return rtKeys.convertInt32ToBytes
    }
  }
  switch (td?.tag) {
    case 'real':
      return rtKeys.convertFloat32ToText
    case 'boolean':
      return rtKeys.convertBooleanToText
    case 'char':
      return rtKeys.convertInt32ToChar
    default:
      return rtKeys.convertInt32ToText
  }
}

/** 文件单位 → 值 的转换 key */
function fromConvertKey(td: TypeDescriptor | undefined, binary: boolean): string {
  if (binary) {
    switch (td?.tag) {
      case 'real':
        return rtKeys.convertBytesToFloat32
      case 'boolean':
        return rtKeys.convertBytesToBoolean
      default:
        return rtKeys.convertBytesToInt32
    }
  }
  switch (td?.tag) {
    case 'real':
      return rtKeys.convertTextToFloat32
    case 'boolean':
      return rtKeys.convertTextToBoolean
    case 'char':
      return rtKeys.convertCharToInt32
    default:
      return rtKeys.convertTextToInt32
  }
}

// 表

export function buildPascalRewriteTable(): SyscallRewriteTable {
  return {
    'lowering.add': binary(rtKeys.int32Add, rtKeys.float32Add, rtKeys.setUnion),
    'lowering.sub': binary(rtKeys.int32Subtract, rtKeys.float32Subtract, rtKeys.setDifference),
    'lowering.mul': binary(rtKeys.int32Multiply, rtKeys.float32Multiply, rtKeys.setIntersection),
    'lowering.div': binaryFixed(rtKeys.float32Divide),
    'lowering.intDiv': binaryFixed(rtKeys.int32Divide),
    'lowering.mod': binaryFixed(rtKeys.int32Modulo),

    'lowering.and': logical(rtKeys.int32And, rtKeys.booleanAnd),
    'lowering.or': logical(rtKeys.int32Or, rtKeys.booleanOr),

    'lowering.neg': unaryFloatOrI32(rtKeys.float32Negate, rtKeys.int32Negate),
    'lowering.not': unaryI32OrOther(rtKeys.int32Not, rtKeys.booleanNot),
    'lowering.abs': unaryFloatOrI32(rtKeys.float32Absolute, rtKeys.int32Absolute),

    'lowering.sqr': (sys) => {
      const t = parseType(sys.args[1])
      const x = sys.args[0]
      return sc(isFloat(t) ? rtKeys.float32Multiply : rtKeys.int32Multiply, [x, x])
    },
    'lowering.sqrt': unary(rtKeys.float32SquareRoot),
    'lowering.sin': unary(rtKeys.float32Sine),
    'lowering.cos': unary(rtKeys.float32Cosine),
    'lowering.exp': unary(rtKeys.float32Exponential),
    'lowering.ln': unary(rtKeys.float32Logarithm),
    'lowering.arctan': unary(rtKeys.float32Arctangent),
    'lowering.odd': unary(rtKeys.int32Odd),

    'lowering.trunc': unary(rtKeys.castFloat32ToInt32),
    'lowering.round': unary(rtKeys.castFloat32ToInt32Round),
    'lowering.ord': ordRewrite,
    'lowering.chr': ordRewrite,
    'lowering.pred': predSucc(false),
    'lowering.succ': predSucc(true),

    'lowering.eq': compare(rtKeys.setEqual, rtKeys.compareEqual),
    'lowering.ne': compare(rtKeys.setNotEqual, rtKeys.compareNotEqual),
    'lowering.lt': compare(undefined, rtKeys.compareLess),
    'lowering.le': compare(rtKeys.setSubset, rtKeys.compareLessOrEqual),
    'lowering.gt': compare(undefined, rtKeys.compareGreater),
    'lowering.ge': compare(rtKeys.setSuperset, rtKeys.compareGreaterOrEqual),

    'lowering.in': (sys) => {
      const st = parseType(sys.args[3])
      return sc(rtKeys.setContains, [sys.args[0], sys.args[2], litInt(setSize(st!))])
    },
    'lowering.ptr.deref': (sys) => sc(rtKeys.pointerDereference, sys.args),
    'lowering.ptr.assign': (sys) => sc(rtKeys.pointerAssign, sys.args),
    'lowering.ptr.dispose.check': (sys) => sc(rtKeys.pointerDisposeCheck, sys.args),

    'lowering.mem.default': (sys) => {
      const td = parseType(sys.args[0])
      if (!td) {
        throw new Error('rewrite: mem.default expects a type descriptor')
      }
      // 含 file / pointer 的类型无法字节化 → 编译期展开为无类型构造表达式（见 isObjectRepr）
      if (isObjectRepr(td)) {
        return defaultValueExpr(td)
      }
      if (td.tag === 'set') {
        return sc(rtKeys.memoryNew, [litInt(setSize(td))])
      }
      return sc(rtKeys.memoryNew, [litInt(sizeOf(td))])
    },
    'lowering.mem.copy': (sys) => {
      const td = parseType(sys.args[3])
      return sc(rtKeys.memoryCopy, [sys.args[0], sys.args[1], sys.args[2], litInt(sizeOf(td!))])
    },

    'lowering.set.empty': (sys) => {
      const td = parseType(sys.args[0])
      return sc(rtKeys.memoryNew, [litInt(setSize(td!))])
    },
    'lowering.set.elem': (sys) => {
      const td = parseType(sys.args[1])
      return sc(rtKeys.setSingleton, [sys.args[0], litInt(setSize(td!))])
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
        return sc(rtKeys.memoryNew, [size])
      }
      return elems.reduce((a, b) => sc(rtKeys.setUnion, [a, b, size]))
    },

    // 类型只用到「文件行为类别」，句柄不携带类型描述符
    'lowering.file.create': (sys) => sc(rtKeys.fileCreate, [litStr(fileKind(parseType(sys.args[0])))]),
    'lowering.file.reset': (sys) => sc(rtKeys.fileReset, [sys.args[0], ...sys.args.slice(2)]),
    'lowering.file.rewrite': (sys) => sc(rtKeys.fileRewrite, [sys.args[0], ...sys.args.slice(2)]),
    'lowering.file.get': (sys) => sc(rtKeys.fileGet, [sys.args[0]]),
    // `f^ := x` 的形态在编译期定死：字符文件走 putCharacter（ord 值转回字符），
    // 其余走 put；`put(f)`（无 unit）也由同一个 put 承担
    'lowering.file.put': (sys) => {
      const [f, fileType, unit] = sys.args
      const characterUnit = unit !== undefined && parseType(fileType)?.elem?.tag === 'char'
      return sc(
        characterUnit ? rtKeys.filePutCharacter : rtKeys.filePut,
        unit === undefined ? [f] : [f, unit],
      )
    },
    'lowering.file.peek': (sys) => {
      const td = parseType(sys.args[1])
      // record 文件：传元素字节大小，供首次分配缓冲区
      if (td?.elem?.tag === 'record') {
        return sc(rtKeys.filePeek, [sys.args[0], litInt(sizeOf(td.elem))])
      }
      return sc(rtKeys.filePeek, [sys.args[0]])
    },
    'lowering.file.eof': (sys) => sc(rtKeys.fileEof, [sys.args[0]]),
    'lowering.file.eoln': (sys) => sc(rtKeys.fileEoln, [sys.args[0]]),
    'lowering.program.fileUrl': (sys) => sc(rtKeys.fileProgramUrl, [sys.args[0], sys.args[1]]),

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
        return sc(rtKeys.fileWrite, [target, sc(rtKeys.convertBytesToTextField, [value, width])])
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
        return sc(rtKeys.fileReadCharacter, [target])
      }
      const binary = isBinaryFile(tt)
      const readKey = binary || vt?.tag === 'char' ? rtKeys.fileReadCharacter : rtKeys.fileReadToken
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

    // ISO 6.6.5.4：pack(a, i, z) / unpack(z, a, i) 按元素字节连续搬移
    'lowering.pack': (sys) => {
      const [src, start, dst, srcType, dstType] = sys.args
      const srcArr = arraySlot(parseType(srcType)!)
      return sc(rtKeys.arrayPack, [
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
      return sc(rtKeys.arrayUnpack, [
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
      if (td && isObjectRepr(td)) {
        // 对象表示的 record / 数组：按值语义深拷贝（pointer / file 拷引用）
        return sc(rtKeys.recordClone, [sys.args[0]])
      }
      return sc(rtKeys.memoryClone, [sys.args[0], litInt(sizeOf(td!))])
    },

    'lowering.cell.create': (sys) => sc(rtKeys.cellNew, [sys.args[0]]),
    'lowering.cell.get': (sys) => sc(rtKeys.cellGet, [sys.args[0]]),
    'lowering.cell.set': (sys) => sc(rtKeys.cellSet, [sys.args[0], sys.args[1]]),
    // 可调用形参的间接调用：callee 为函数值，是个原子操作，无需类型分派
    'lowering.call.indirect': (sys) => sc(rtKeys.callIndirect, sys.args),
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
  if (base.kind === 'syscall' && base.key === rtKeys.viewSubarray) {
    return { base: base.args[0], delta: base.args[1] }
  }
  return { base }
}

/** 把折叠出的内层偏移叠加到当前 offset 上（当前 offset 为 0 时直接用 delta） */
function addOffset(delta: JsonCode.Expr | undefined, offset: JsonCode.Expr): JsonCode.Expr {
  if (delta === undefined) {
    return offset
  }
  if (offset.kind === 'literal' && offset.key === 'integer' && offset.arg === '0') {
    return delta
  }
  return sc(rtKeys.int32Add, [delta, offset])
}

/** 取容器内的槽位（数组元素 / 记录字段），产出标量读或子视图 */
function accessAt(
  base: JsonCode.Expr,
  td: TypeDescriptor,
  indices: JsonCode.Expr[],
  fieldName?: string,
): JsonCode.Expr {
  if (fieldName === undefined && isObjectRepr(td)) {
    // 对象数组：下标数等于维数时取元素；少于维数时返回子数组视图（ISO 6.4.3.2）
    const dims = arrayDims(td)
    if (indices.length < dims.length) {
      const flatOff = elementOffset(indices, dims)
      return sc(rtKeys.arraySublist, [base, flatOff])
    }
    return sc(rtKeys.arrayGetObject, [base, elemIndexExpr(td, indices)])
  }

  const folded = foldViewSub(base)
  let offset: JsonCode.Expr
  let slotType: TypeDescriptor

  if (fieldName !== undefined) {
    if (isObjectRepr(td)) {
      // 对象表示的 record（含 file / pointer 字段）：字段按名字读取
      return sc(rtKeys.recordGetField, [base, litStr(fieldName)])
    }
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
    return sc(bytesGetKey[scalarKindOf(slotType)], [folded.base, offset])
  }
  return sc(rtKeys.viewSubarray, [folded.base, offset, litInt(sizeOf(slotType))])
}

/** 写容器内的槽位 */
function assignAt(
  base: JsonCode.Expr,
  td: TypeDescriptor,
  indices: JsonCode.Expr[],
  value: JsonCode.Expr,
  fieldName?: string,
): JsonCode.Expr {
  if (fieldName === undefined && isObjectRepr(td)) {
    // 对象数组：下标数等于维数时写元素；少于维数时（子数组视图）交由 arraySetObject 处理
    return sc(rtKeys.arraySetObject, [base, elemIndexExpr(td, indices), value])
  }

  const folded = foldViewSub(base)
  let offset: JsonCode.Expr
  let slotType: TypeDescriptor

  if (fieldName !== undefined) {
    if (isObjectRepr(td)) {
      // 对象表示的 record（含 file / pointer 字段）：字段按名字写入
      return sc(rtKeys.recordSetField, [base, litStr(fieldName), value])
    }
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
    return sc(bytesSetKey[scalarKindOf(slotType)], [folded.base, offset, value])
  }
  return sc(rtKeys.memoryCopy, [folded.base, offset, value, litInt(sizeOf(slotType))])
}
