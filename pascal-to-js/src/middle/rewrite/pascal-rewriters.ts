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
import type { ExtraCallable } from '@/middle/analysis/analysis-type.ts'
import { syscallKeys } from '@/middle/lowering/helpers.ts'
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
  return { kind: 'literal', key: 'number', arg: String(v) }
}

function litStr(s: string): JsonCode.Literal {
  return { kind: 'literal', key: 'string', arg: s }
}

function litReal(v: string): JsonCode.Literal {
  return { kind: 'literal', key: 'number', arg: v }
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
      // char 是字节序数，与 integer 同表示（具体宿主形态由 runtime 决定）
      return litInt(0)
    case 'set':
      return sc(rtKeys.bytesAlloc, [litInt(setSize(td))])
    case 'pointer':
      // ISO 7185 6.4.4: 未初始化的指针为 nil-value
      return litNullLiteral()
    case 'file':
      return sc(rtKeys.fileCreate, [litStr(fileKind(td))])
    case 'array':
      return isObjectRepr(td)
        ? sc(
          rtKeys.objectArrayNew,
          Array.from({ length: arrayCount(td) }, () => defaultValueExpr(td.elem!)),
        )
        : sc(rtKeys.bytesAlloc, [litInt(sizeOf(td))])
    case 'record':
      return isObjectRepr(td)
        ? sc(rtKeys.objectNew, recordDefaultArgs(td))
        : sc(rtKeys.bytesAlloc, [litInt(sizeOf(td))])
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

function predSucc(isSucc: boolean, debug: boolean) {
  const i32Key = isSucc ? rtKeys.int32Add : rtKeys.int32Subtract
  const f32Key = isSucc ? rtKeys.float32Add : rtKeys.float32Subtract
  // 结果须落在类型范围内（ISO 6.6.6.4）；非 debug 构建不产出检查
  const checked = (expr: JsonCode.Expr, lo: number, hi: number): JsonCode.Expr =>
    debug ? sc(rtKeys.debugRangeCheck, [expr, litInt(lo), litInt(hi)]) : expr
  return (sys: JsonCode.Syscall): JsonCode.Expr => {
    const t = parseType(sys.args[1])
    const x = sys.args[0]
    // char 即 ord 值 → 直接整数加减（ISO 6.6.6.4）
    if (t?.tag === 'char') {
      return sc(i32Key, [x, litInt(1)])
    }
    if (t?.tag === 'enum' && t.enumCount !== undefined) {
      return checked(sc(i32Key, [x, litInt(1)]), 0, t.enumCount - 1)
    }
    if (t?.low !== undefined && t?.high !== undefined) {
      return checked(sc(i32Key, [x, litInt(1)]), t.low, t.high)
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

/**
 * ISO 7185 6.6.5.2 形态检查：reset(f) / rewrite(f) 只有一个 file-variable 实参。
 *
 * 检查落在 rewrite —— 实参形态属于内置语义，lowering 只做结构翻译与类型描述过境，
 * 不判定。实参多于 ISO 形态即为非标形式（带 file-name），此处报错；使用方若要
 * 以 rewrite 扩展表达该方言，覆盖同名 lowering.* key 即可，本检查随之让位。
 *
 * 实参布局由 lowering 产出：args = [f, 类型描述, ...方言实参]。
 */
function requireIsoFileActuals(sys: JsonCode.Syscall, name: string): void {
  if (sys.args.length !== 2) {
    throw new Error(
      `ISO 7185 6.6.5.2: ${name}(f) shall have exactly one actual-parameter, a file-variable; a file-name is not an ISO 7185 form`,
    )
  }
}

/**
 * `put(f)` 与 `f^ := x` 的翻译。
 *
 * 实参布局 = [f, 文件类型描述, 值?, 值类型描述?]；值缺失即无值形式的 put(f)。
 * 值的宿主形态在编译期定死：
 *   blocks + 值 → put.buffer.block      值缺失 → put（仅块存储需要落盘）
 *   bytes  + 值 → put.buffer.byte
 *   text   + 值 → put.buffer.character（elem 为 char）/ put.buffer.text（其余元素）
 */
function filePutRewrite(sys: JsonCode.Syscall): JsonCode.Expr {
  const [f, fileType, unit] = sys.args
  if (unit === undefined) {
    return sc(rtKeys.filePut, [f])
  }
  const tt = parseType(fileType)
  const kind = fileKind(tt)
  if (kind === 'blocks') {
    return sc(rtKeys.filePutBufferBlock, [f, unit])
  }
  if (kind === 'bytes') {
    return sc(rtKeys.filePutBufferByte, [f, unit])
  }
  if (tt?.elem?.tag === 'char') {
    return sc(rtKeys.filePutBufferCharacter, [f, unit])
  }
  // 其余文本单位：按元素类型的文本表示写出（与 write(f, x) 同规则）
  return sc(rtKeys.filePutBufferText, [f, sc(toConvertKey(tt?.elem, false), [unit])])
}

// 无本体调用：实参按 (值, 类型描述) 平铺，形态解释都在本层

interface ActualPair {
  value: JsonCode.Expr
  td: JsonCode.Expr
}

/** 把平铺实参切成 (值, 类型描述) 对 */
function actualPairs(args: JsonCode.Expr[]): ActualPair[] {
  const out: ActualPair[] = []
  for (let i = 0; i + 1 < args.length; i += 2) {
    out.push({ value: args[i], td: args[i + 1] })
  }
  return out
}

/** 首实参是文件变量时把它当写出/读入目标，其余为项；否则目标缺省（标准输入输出） */
function splitFileTarget(pairs: ActualPair[]): {
  target: JsonCode.Expr
  fileType: TypeDescriptor | undefined
  rest: ActualPair[]
} {
  const first = pairs[0]
  const firstType = first ? parseType(first.td) : undefined
  if (first && firstType?.tag === 'file') {
    return { target: first.value, fileType: firstType, rest: pairs.slice(1) }
  }
  return { target: litNullLiteral(), fileType: undefined, rest: pairs }
}

/** 解开 `x:w:p` 的专用翻译（lowering.widthspec）：值 / 类型 / 宽度 / 精度 */
function unpackWidthSpec(e: JsonCode.Expr): {
  value: JsonCode.Expr
  valueType: JsonCode.Expr | undefined
  width: JsonCode.Expr | undefined
  prec: JsonCode.Expr | undefined
} {
  if (e.kind === 'syscall' && e.key === syscallKeys.widthSpec) {
    const a = e.args
    return { value: a[0], valueType: a[1], width: a[2], prec: a[4] }
  }
  return { value: e, valueType: undefined, width: undefined, prec: undefined }
}

/** 单个写出项 → 一条写入表达式（值的宿主表示在编译期定死，见原 write 注释） */
function writeItem(
  target: JsonCode.Expr,
  fileType: TypeDescriptor | undefined,
  pair: ActualPair,
): JsonCode.Expr {
  const spec = unpackWidthSpec(pair.value)
  const value = spec.value
  const vt = parseType(spec.valueType ?? pair.td)
  const width = spec.width
  const prec = spec.prec
  if (fileKind(fileType) === 'blocks') {
    return sc(rtKeys.fileWriteBlock, [target, value])
  }
  if (isByteFile(fileType)) {
    return sc(rtKeys.fileWriteByte, [target, value])
  }
  if (isCharArray(vt)) {
    // ISO 6.9.3.6：string 值带字段宽度时须左补空格或截断
    if (width === undefined) {
      return sc(rtKeys.fileWriteBytes, [target, value])
    }
    return sc(rtKeys.fileWriteText, [target, sc(rtKeys.convertBytesToTextField, [value, width])])
  }
  const binary = isBinaryFile(fileType)
  const convArgs: JsonCode.Expr[] = [value]
  if (width !== undefined) {
    convArgs.push(width)
    if (prec !== undefined) {
      convArgs.push(prec)
    }
  }
  const converted = sc(toConvertKey(vt, binary), convArgs)
  return binary
    ? sc(rtKeys.fileWriteBytes, [target, converted])
    : sc(rtKeys.fileWriteText, [target, converted])
}

/** write / writeln：逐项写入，多项用闭包串成一条表达式 */
function writeCall(sys: JsonCode.Syscall, newline: boolean): JsonCode.Expr {
  const { target, fileType, rest } = splitFileTarget(actualPairs(sys.args))
  const writes = rest.map((p) => writeItem(target, fileType, p))
  if (newline) {
    writes.push(sc(rtKeys.fileWriteln, [target]))
  }
  if (writes.length === 1) {
    return writes[0]
  }
  if (writes.length === 0) {
    return sc(rtKeys.fileWriteln, [target])
  }
  return sc(rtKeys.closureNoValue, writes)
}

/** 单个读入项 → 读到的值 */
function readOne(
  target: JsonCode.Expr,
  fileType: TypeDescriptor | undefined,
  valueType: JsonCode.Expr,
): JsonCode.Expr {
  const vt = parseType(valueType)
  if (isByteFile(fileType)) {
    return sc(rtKeys.fileReadCharacter, [target])
  }
  const binary = isBinaryFile(fileType)
  const readKey = binary || vt?.tag === 'char' ? rtKeys.fileReadCharacter : rtKeys.fileReadToken
  const raw = sc(readKey, [target])
  if (isCharArray(vt)) {
    return raw
  }
  return sc(fromConvertKey(vt, binary), [raw])
}

/**
 * 写回一个位置。
 *
 * 位置只可能是 variable-access 的翻译结果：变量槽（ref）或数组元素
 * （lowering.array.access）。
 */
function writeBack(loc: JsonCode.Expr, value: JsonCode.Expr, _debug: boolean): JsonCode.Expr {
  // 变量槽
  if (loc.kind === 'ref') {
    return sc(rtKeys.assign, [loc, value])
  }
  if (loc.kind === 'syscall') {
    // 位置的表达式在 post-order 中已被本层重写为「读」的 runtime key。
    // 写回即换成成对的「写」key，并把值追加为最后一个实参（读写布局一致）。
    switch (loc.key) {
      case rtKeys.cellGet:
        return sc(rtKeys.cellSet, [loc.args[0], value])
      case rtKeys.pointerDereference:
        return sc(rtKeys.pointerAssign, [loc.args[0], value])
      case rtKeys.objectGet:
        return sc(rtKeys.objectSet, [...loc.args, value])
      case rtKeys.objectArrayGet:
        return sc(rtKeys.objectArraySet, [...loc.args, value])
      default:
        break
    }
  }
  throw new Error(
    `rewrite: 写回目标必须是变量 / 变量参数 / 数组元素 / 记录字段 / 解引用（实际：${loc.kind}${
      loc.kind === 'syscall' ? ':' + loc.key : ''
    }）`,
  )
}

/** read / readln：逐项读入并写回，多项用闭包串成一条表达式 */
function readCall(sys: JsonCode.Syscall, skipLine: boolean, debug: boolean): JsonCode.Expr {
  const { target, fileType, rest } = splitFileTarget(actualPairs(sys.args))
  const ops = rest.map((p) => writeBack(p.value, readOne(target, fileType, p.td), debug))
  if (skipLine) {
    ops.push(sc(rtKeys.fileReadln, [target]))
  }
  if (ops.length === 1) {
    return ops[0]
  }
  if (ops.length === 0) {
    return sc(rtKeys.fileReadln, [target])
  }
  return sc(rtKeys.closureNoValue, ops)
}

/**
 * 为注入的 callable 生成重写项：`lowering.call.<名>` → 使用方指定的 syscall 名。
 *
 * 注入只是"声明这个名字存在并给出实现"，实参布局由 lowering 统一为平铺的
 * (值, 类型描述)——还原成纯值后交给使用方的 syscall（其 handler 只面对值）。
 */
export function buildExtraCallableRewriters(
  extraCallables?: Record<string, ExtraCallable>,
): SyscallRewriteTable {
  const table: SyscallRewriteTable = {}
  if (!extraCallables) {
    return table
  }
  for (const [name, spec] of Object.entries(extraCallables)) {
    table[`lowering.call.${name.toLowerCase()}`] = (sys) =>
      sc(spec.sysCallName, actualPairs(sys.args).map((p) => p.value))
  }
  return table
}

/**
 * 构建 Pascal → runtime 的 IR 重写表。
 *
 * `debug` 决定是否产出 `runtime.debug.*` 检查（边界 / 步数 / 除零 / 视图断言）。
 */
export function buildPascalRewriteTable(debug: boolean): SyscallRewriteTable {
  return {
    'lowering.add': binary(rtKeys.int32Add, rtKeys.float32Add, rtKeys.bitmapUnion),
    'lowering.sub': binary(rtKeys.int32Subtract, rtKeys.float32Subtract, rtKeys.bitmapDifference),
    'lowering.mul': binary(rtKeys.int32Multiply, rtKeys.float32Multiply, rtKeys.bitmapIntersection),
    'lowering.div': binaryFixed(rtKeys.float32Divide),
    // ISO 6.7.2.2：i div j / i mod j 在 j 为 0（mod 还要求 j > 0）时是 error。
    // 除数检查只在 debug 构建里产出（见 runtime.debug.divide/modulo.check）。
    'lowering.intDiv': (sys) =>
      sc(rtKeys.int32Divide, [
        sys.args[0],
        debug ? sc(rtKeys.debugDivideCheck, [sys.args[1]]) : sys.args[1],
      ]),
    'lowering.mod': (sys) =>
      sc(rtKeys.int32Modulo, [
        sys.args[0],
        debug ? sc(rtKeys.debugModuloCheck, [sys.args[1]]) : sys.args[1],
      ]),

    'lowering.and': logical(rtKeys.int32And, rtKeys.booleanAnd),
    'lowering.or': logical(rtKeys.int32Or, rtKeys.booleanOr),

    'lowering.neg': unaryFloatOrI32(rtKeys.float32Negate, rtKeys.int32Negate),
    'lowering.not': unaryI32OrOther(rtKeys.int32Not, rtKeys.booleanNot),
    // 内置函数调用：lowering 只把名字拼进 key（lowering.call.<名>），
    // 翻译与类型分派都在本层；实参布局 = (值, 类型描述)
    'lowering.call.abs': unaryFloatOrI32(rtKeys.float32Absolute, rtKeys.int32Absolute),
    'lowering.call.sqr': (sys) => {
      const t = parseType(sys.args[1])
      const x = sys.args[0]
      return sc(isFloat(t) ? rtKeys.float32Multiply : rtKeys.int32Multiply, [x, x])
    },
    'lowering.call.sqrt': unary(rtKeys.float32SquareRoot),
    'lowering.call.sin': unary(rtKeys.float32Sine),
    'lowering.call.cos': unary(rtKeys.float32Cosine),
    'lowering.call.exp': unary(rtKeys.float32Exponential),
    'lowering.call.ln': unary(rtKeys.float32Logarithm),
    'lowering.call.arctan': unary(rtKeys.float32Arctangent),
    'lowering.call.odd': unary(rtKeys.int32Odd),
    'lowering.call.trunc': unary(rtKeys.castFloat32ToInt32),
    'lowering.call.round': unary(rtKeys.castFloat32ToInt32Round),
    'lowering.call.ord': ordRewrite,
    'lowering.call.chr': ordRewrite,
    'lowering.call.pred': predSucc(false, debug),
    'lowering.call.succ': predSucc(true, debug),

    'lowering.eq': compare(rtKeys.bitmapEqual, rtKeys.compareEqual),
    'lowering.ne': compare(rtKeys.bitmapNotEqual, rtKeys.compareNotEqual),
    'lowering.lt': compare(undefined, rtKeys.compareLess),
    'lowering.le': compare(rtKeys.bitmapSubset, rtKeys.compareLessOrEqual),
    'lowering.gt': compare(undefined, rtKeys.compareGreater),
    'lowering.ge': compare(rtKeys.bitmapSuperset, rtKeys.compareGreaterOrEqual),

    'lowering.in': (sys) => {
      const st = parseType(sys.args[3])
      return sc(rtKeys.bitmapContains, [sys.args[0], sys.args[2], litInt(setSize(st!))])
    },
    'lowering.ptr.deref': (sys) => sc(rtKeys.pointerDereference, sys.args),
    'lowering.ptr.assign': (sys) => sc(rtKeys.pointerAssign, sys.args),
    'lowering.ptr.dispose.check': (sys) => sc(rtKeys.pointerDisposeCheck, sys.args),

    // 槽赋值：目标槽与值的宿主表示都在编译期定死，codegen 内联为 (x = v)
    'lowering.assign': (sys) => sc(rtKeys.assign, sys.args),

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
        return sc(rtKeys.bytesAlloc, [litInt(setSize(td))])
      }
      return sc(rtKeys.bytesAlloc, [litInt(sizeOf(td))])
    },
    'lowering.mem.copy': (sys) => {
      const td = parseType(sys.args[3])
      return sc(rtKeys.bytesCopy, [sys.args[0], sys.args[1], sys.args[2], litInt(sizeOf(td!))])
    },

    'lowering.set.empty': (sys) => {
      const td = parseType(sys.args[0])
      return sc(rtKeys.bytesAlloc, [litInt(setSize(td!))])
    },
    'lowering.set.elem': (sys) => {
      const td = parseType(sys.args[1])
      return sc(rtKeys.bitmapSingleton, [sys.args[0], litInt(setSize(td!))])
    },
    'lowering.set.range': (sys) => {
      const td = parseType(sys.args[2])
      return sc(rtKeys.bitmapRange, [sys.args[0], sys.args[1], litInt(setSize(td!))])
    },
    'lowering.set.literal': (sys) => {
      const td = parseType(sys.args[sys.args.length - 1])
      const elems = sys.args.slice(0, -1)
      const size = litInt(setSize(td!))
      if (elems.length === 0) {
        return sc(rtKeys.bytesAlloc, [size])
      }
      return elems.reduce((a, b) => sc(rtKeys.bitmapUnion, [a, b, size]))
    },

    // 类型只用到「文件行为类别」，句柄不携带类型描述符。
    // reset / rewrite 的实参形态是本层的职责：ISO 形式即「file-variable + 类型描述」，
    // 其余形式在此报错；使用方覆盖同名 key 即可接管方言形式（如 reset(f, name, opts)）。
    'lowering.file.create': (sys) => sc(rtKeys.fileCreate, [litStr(fileKind(parseType(sys.args[0])))]),
    'lowering.call.reset': (sys) => {
      requireIsoFileActuals(sys, 'reset')
      return sc(rtKeys.fileReset, [sys.args[0]])
    },
    'lowering.call.rewrite': (sys) => {
      requireIsoFileActuals(sys, 'rewrite')
      return sc(rtKeys.fileRewrite, [sys.args[0]])
    },
    'lowering.call.get': (sys) => sc(rtKeys.fileGet, [sys.args[0]]),
    // put 有两条来源：调用 `put(f)` / `put(f, x)`，以及赋值 `f^ := x`
    'lowering.call.put': filePutRewrite,
    'lowering.file.put': filePutRewrite,
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

    // 无本体调用：io 系列。实参由 lowering 平铺为 (值, 类型描述)；谁是目标、项是什么
    // 形态，都由本层按类型/结构解释。
    'lowering.call.write': (sys) => writeCall(sys, false),
    'lowering.call.writeln': (sys) => writeCall(sys, true),
    'lowering.call.read': (sys) => readCall(sys, false, debug),
    'lowering.call.readln': (sys) => readCall(sys, true, debug),
    'lowering.call.page': (sys) => {
      const pairs = actualPairs(sys.args)
      return sc(rtKeys.filePage, [pairs.length > 0 ? pairs[0].value : litNullLiteral()])
    },
    'lowering.call.eof': (sys) => {
      const pairs = actualPairs(sys.args)
      return sc(rtKeys.fileEof, [pairs.length > 0 ? pairs[0].value : litNullLiteral()])
    },
    'lowering.call.eoln': (sys) => {
      const pairs = actualPairs(sys.args)
      return sc(rtKeys.fileEoln, [pairs.length > 0 ? pairs[0].value : litNullLiteral()])
    },

    // new(p) / dispose(p)：ISO 7185 6.6.5.3。p 是一个位置（变量槽 / 数组元素 / 变量
    // 参数 / 记录字段），由本层写回；new 出来的变量其值未定义（ISO 不要求初始值），
    // dispose 要先检查 p 不是 nil。
    'lowering.call.new': (sys) => {
      const [p, ptd] = sys.args
      const pt = parseType(ptd)
      if (pt?.tag !== 'pointer' || !pt.elem) {
        throw new Error('ISO 7185 6.6.5.3: new(p) 的实参须为 pointer 类型的变量')
      }
      // 新变量的宿主表示 = 领域类型的默认表示（指针描述符带一层领域布局）
      const domain = pt.elem
      const inner = isObjectRepr(domain)
        ? defaultValueExpr(domain)
        : sc(rtKeys.bytesAlloc, [litInt(sizeOf(domain))])
      return writeBack(p, sc(rtKeys.cellNew, [inner]), debug)
    },
    'lowering.call.dispose': (sys) => {
      const [p, ptd] = sys.args
      if (parseType(ptd)?.tag !== 'pointer') {
        throw new Error('ISO 7185 6.6.5.3: dispose(p) 的实参须为 pointer 类型的变量')
      }
      return sc(rtKeys.closureNoValue, [
        sc(rtKeys.pointerDisposeCheck, [p]),
        writeBack(p, litNullLiteral(), debug),
      ])
    },

    // ISO 6.6.5.4：pack(a, i, z) / unpack(z, a, i) 按元素字节连续搬移。
    // 实参布局为平铺的 (值, 类型描述)。
    'lowering.call.pack': (sys) => {
      const [src, srcTd, start, , dst, dstTd] = sys.args
      const srcArr = arraySlot(parseType(srcTd)!)
      return sc(rtKeys.bytesPack, [
        src,
        litInt(srcArr.lows[0] ?? 0),
        litInt(srcArr.elemSize),
        start,
        dst,
        litInt(arrayCount(parseType(dstTd)!)),
      ])
    },
    'lowering.call.unpack': (sys) => {
      const [src, srcTd, dst, dstTd, start] = sys.args
      const dstArr = arraySlot(parseType(dstTd)!)
      return sc(rtKeys.bytesUnpack, [
        src,
        dst,
        litInt(dstArr.lows[0] ?? 0),
        litInt(dstArr.elemSize),
        start,
        litInt(arrayCount(parseType(srcTd)!)),
      ])
    },
    'lowering.array.access': (sys) => {
      const td = parseType(sys.args[sys.args.length - 1])
      const indices = sys.args.slice(0, -1)
      const arr = indices.shift()!
      return accessAt(arr, td!, indices, undefined, debug)
    },
    'lowering.array.assign': (sys) => {
      const td = parseType(sys.args[sys.args.length - 1])
      const rest = sys.args.slice(0, -1)
      const arr = rest.shift()!
      const value = rest.pop()!
      return assignAt(arr, td!, rest, value, undefined, debug)
    },
    'lowering.rec.access': (sys) => {
      const td = parseType(sys.args[2])
      const name = (sys.args[1] as JsonCode.Literal).arg
      return accessAt(sys.args[0], td!, [], name, debug)
    },
    'lowering.rec.assign': (sys) => {
      const td = parseType(sys.args[3])
      const name = (sys.args[1] as JsonCode.Literal).arg
      return assignAt(sys.args[0], td!, [], sys.args[2], name, debug)
    },
    'lowering.rec.copy': (sys) => {
      const td = parseType(sys.args[1])
      if (td && isObjectRepr(td)) {
        // clone 与 create 一一对应：object 表示用同域的 clone key。
        // 值参数只可能是 record / array（file / pointer 是引用语义，不会走到这里）
        return sc(
          td.tag === 'array' ? rtKeys.objectArrayClone : rtKeys.objectClone,
          [sys.args[0]],
        )
      }
      return sc(rtKeys.bytesClone, [sys.args[0], litInt(sizeOf(td!))])
    },

    'lowering.cell.create': (sys) => sc(rtKeys.cellNew, [sys.args[0]]),
    'lowering.cell.get': (sys) => sc(rtKeys.cellGet, [sys.args[0]]),
    'lowering.cell.set': (sys) => sc(rtKeys.cellSet, [sys.args[0], sys.args[1]]),
    // 可调用形参的间接调用：callee 为函数值，是个原子操作，无需类型分派
    'lowering.call.indirect': (sys) => sc(rtKeys.callIndirect, sys.args),
    // 这三条只在 debug 构建由 lowering 生成（"是否生成"已由 lowering 决定），
    // 因此此处无条件翻译 —— rewrite 不再需要"删除语句"的能力
    'lowering.range.check': (sys) => sc(rtKeys.debugRangeCheck, sys.args),
    'lowering.steps.check': () => sc(rtKeys.debugStepsCheck, []),
    'lowering.hook.function.enter': () => sc(rtKeys.hookFunctionEnter, []),
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
  if (offset.kind === 'literal' && offset.key === 'number' && offset.arg === '0') {
    return delta
  }
  return sc(rtKeys.int32Add, [delta, offset])
}

/**
 * debug 构建下为字节视图实参加断言（runtime.debug.assert.view）。
 *
 * 非 debug 时原样返回视图，断言完全不进入生成的代码。
 */
function checkedView(view: JsonCode.Expr, key: string, debug: boolean): JsonCode.Expr {
  return debug ? sc(rtKeys.debugAssertView, [view, litStr(key)]) : view
}

/** 取容器内的槽位（数组元素 / 记录字段），产出标量读或子视图 */
function accessAt(
  base: JsonCode.Expr,
  td: TypeDescriptor,
  indices: JsonCode.Expr[],
  fieldName: string | undefined,
  debug: boolean,
): JsonCode.Expr {
  if (fieldName === undefined && isObjectRepr(td)) {
    // 对象数组：下标数等于维数时取元素；少于维数时返回子数组视图（ISO 6.4.3.2）
    const dims = arrayDims(td)
    if (indices.length < dims.length) {
      const flatOff = elementOffset(indices, dims)
      return sc(rtKeys.objectArraySublist, [base, flatOff])
    }
    return sc(rtKeys.objectArrayGet, [base, elemIndexExpr(td, indices)])
  }

  const folded = foldViewSub(base)
  let offset: JsonCode.Expr
  let slotType: TypeDescriptor

  if (fieldName !== undefined) {
    if (isObjectRepr(td)) {
      // 对象表示的 record（含 file / pointer 字段）：字段按名字读取
      return sc(rtKeys.objectGet, [base, litStr(fieldName)])
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
    const key = bytesGetKey[scalarKindOf(slotType)]
    return sc(key, [checkedView(folded.base, key, debug), offset])
  }
  return sc(rtKeys.viewSubarray, [folded.base, offset, litInt(sizeOf(slotType))])
}

/** 写容器内的槽位 */
function assignAt(
  base: JsonCode.Expr,
  td: TypeDescriptor,
  indices: JsonCode.Expr[],
  value: JsonCode.Expr,
  fieldName: string | undefined,
  debug: boolean,
): JsonCode.Expr {
  if (fieldName === undefined && isObjectRepr(td)) {
    // 对象数组：下标数等于维数时写元素；少于维数时（子数组视图）交由 objectarray.set 处理
    return sc(rtKeys.objectArraySet, [base, elemIndexExpr(td, indices), value])
  }

  const folded = foldViewSub(base)
  let offset: JsonCode.Expr
  let slotType: TypeDescriptor

  if (fieldName !== undefined) {
    if (isObjectRepr(td)) {
      // 对象表示的 record（含 file / pointer 字段）：字段按名字写入
      return sc(rtKeys.objectSet, [base, litStr(fieldName), value])
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
    const key = bytesSetKey[scalarKindOf(slotType)]
    return sc(key, [checkedView(folded.base, key, debug), offset, value])
  }
  return sc(rtKeys.bytesCopy, [folded.base, offset, value, litInt(sizeOf(slotType))])
}
