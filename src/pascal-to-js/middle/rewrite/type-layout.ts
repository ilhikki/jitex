/*
 * 类型布局：TypeDescriptor → 字节大小 / 标量种类 / 字段偏移。
 *
 * 纯函数，供 rewrite 在编译期计算。
 * 布局以 runtime 为准（runtime 侧只认这些编译期算好的标量常量）。
 *
 * 布局约定：
 *   array  -- 扁平化为一维字节序列，offset 由各维 low/stride 算出
 *   record -- 固定字段顺序排列，其后是 variant 的 tag（4 字节），再是 variant 区
 *             （各分支共享同一段空间，即 union，取最大值）
 *   set    -- 位图，字节数由基类型范围决定
 */

import type { TypeDescriptor, VariantPartDescriptor } from '@/middle/lowering/type.ts'

/**
 * 标量种类：标量在字节视图中的宽度 + 解释方式。
 *
 * 每个种类对应 `runtime.bytes.get.<kind>` / `runtime.bytes.set.<kind>` 一个终态 key，
 * 不再作为运行期参数传递。
 */
export type ScalarKind = 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'float32'

const SCALAR_WIDTH: Record<ScalarKind, number> = {
  int8: 1,
  uint8: 1,
  int16: 2,
  uint16: 2,
  int32: 4,
  float32: 4,
}

/** variant tag 字段占用的字节数（仅**具名** tag 分配空间） */
const TAG_SIZE = 4

/**
 * variant 的 tag 槽位数。
 *
 * ISO 允许 `case` 不带 tag 字段名；TeX 的 `memory_word` 全是无名 variant，
 * 实际布局就是各分支的 union（无 tag 空间）--旧 boot-tex 实现亦如此。
 */
function tagSize(vp: VariantPartDescriptor | undefined): number {
  return vp?.tagName !== undefined ? TAG_SIZE : 0
}

export function scalarWidth(kind: ScalarKind): number {
  return SCALAR_WIDTH[kind]
}

/** 序数子界的标量种类：按范围取最窄宽度 */
function rangeScalarKind(low: number, high: number): ScalarKind {
  if (low >= -128 && high <= 127) {
    return 'int8'
  }
  if (low >= 0 && high <= 255) {
    return 'uint8'
  }
  if (low >= -32768 && high <= 32767) {
    return 'int16'
  }
  if (low >= 0 && high <= 65535) {
    return 'uint16'
  }
  return 'int32'
}

/**
 * 该类型的值是否需要以「JS 对象」承载（而非字节序列）。
 *
 * file 与 pointer 的值本身就是对象（句柄 / identifying-value），放不进 Uint8Array；
 * 含这类字段的 record（用普通 JS 对象）与含这类元素的 array（用 object[]）逐层如此。
 * rewrite 与 runtime 共用本判据决定表示。
 */
export function isObjectRepr(td: TypeDescriptor): boolean {
  switch (td.tag) {
    case 'file':
    case 'pointer':
      return true
    case 'array':
      return td.elem !== undefined && isObjectRepr(td.elem)
    case 'record':
      for (const f of td.fields ?? []) {
        if (isObjectRepr(f.type)) {
          return true
        }
      }
      return variantHasObject(td.variant)
    default:
      return false
  }
}

function variantHasObject(vp: VariantPartDescriptor | undefined): boolean {
  for (const b of vp?.branches ?? []) {
    for (const f of b.fields) {
      if (isObjectRepr(f.type)) {
        return true
      }
    }
    if (variantHasObject(b.nested)) {
      return true
    }
  }
  return false
}

/** 是否为标量类型 */
export function isScalar(td: TypeDescriptor): boolean {
  switch (td.tag) {
    case 'integer':
    case 'enum':
    case 'real':
    case 'boolean':
    case 'char':
      return true
    default:
      return false
  }
}

/** 数组元素个数（各维长度之积）；非数组返回 1 */
export function arrayCount(td: TypeDescriptor): number {
  return (td.dims ?? []).reduce((n, d) => n * (d.high - d.low + 1), 1)
}

/**
 * 「单字节标量」：`packed file of byte` 这类原始字节文件的元素类型。
 *
 * 只有元素的标量宽度为 1 才算（`0..255` 子界 / 1 字节 enum / boolean）；
 * `file of char` 是文本文件，`file of integer`（4 字节）走文本式单位读写。
 */
export function isByteScalar(td: TypeDescriptor | undefined): boolean {
  if (td === undefined) {
    return false
  }
  switch (td.tag) {
    case 'boolean':
      return true
    case 'enum':
      return (td.enumCount ?? 1) - 1 <= 255
    case 'integer':
      return td.low !== undefined && td.high !== undefined && td.low >= -128 && td.high <= 255
    default:
      return false
  }
}

/** 标量类型的标量种类；非标量抛错 */
export function scalarKindOf(td: TypeDescriptor): ScalarKind {
  switch (td.tag) {
    case 'integer':
      // 带 low/high 视为子界，按范围选宽度
      return td.low !== undefined && td.high !== undefined ? rangeScalarKind(td.low, td.high) : 'int32'
    case 'enum':
      return rangeScalarKind(0, (td.enumCount ?? 1) - 1)
    case 'real':
      return 'float32'
    case 'boolean':
    case 'char':
      return 'uint8'
    default:
      throw new Error(`scalarKindOf: not a scalar type: ${td.tag}`)
  }
}

/** 类型占用的字节数 */
export function sizeOf(td: TypeDescriptor): number {
  if (isScalar(td)) {
    return scalarWidth(scalarKindOf(td))
  }
  switch (td.tag) {
    case 'array': {
      let count = 1
      for (const d of td.dims ?? []) {
        count *= d.high - d.low + 1
      }
      return count * sizeOf(td.elem!)
    }
    case 'record':
      return recordSize(td)
    case 'set':
      return setSize(td)
    case 'pointer':
      return 4
    default:
      throw new Error(`sizeOf: unsupported type ${td.tag}`)
  }
}

/**
 * set 位图的字节数。
 *
 * 统一按 256 位（0..255）分配：位下标即序数值（绝对位），
 * 这样「set 表达式」与「set 变量」的 size 一定一致，
 * 也覆盖 char 全域。超出 255 的基类型不支持（与 ISO 实现定义上限一致）。
 */
export function setSize(_td: TypeDescriptor): number {
  return 32
}

function recordSize(td: TypeDescriptor): number {
  let offset = 0
  for (const f of td.fields ?? []) {
    offset += sizeOf(f.type)
  }
  if (td.variant) {
    offset += tagSize(td.variant)
    offset += variantSize(td.variant)
  }
  return offset
}

/** variant 区大小：各分支取最大值（union） */
function variantSize(vp: VariantPartDescriptor): number {
  let max = 0
  for (const b of vp.branches) {
    let size = 0
    for (const f of b.fields) {
      size += sizeOf(f.type)
    }
    if (b.nested) {
      size += tagSize(b.nested) + variantSize(b.nested)
    }
    if (size > max) {
      max = size
    }
  }
  return max
}

// 字段槽位

export interface FieldSlot {
  offset: number
  size: number
  type: TypeDescriptor
  /** 是否为 variant 的 tag 字段 */
  isTag: boolean
}

/** 取 record 字段的槽位；不存在返回 undefined */
export function fieldSlot(td: TypeDescriptor, name: string): FieldSlot | undefined {
  let offset = 0
  for (const f of td.fields ?? []) {
    if (f.name === name) {
      return { offset, size: sizeOf(f.type), type: f.type, isTag: false }
    }
    offset += sizeOf(f.type)
  }
  if (td.variant) {
    const tagOff = offset
    if (td.variant.tagName === name) {
      return { offset: tagOff, size: TAG_SIZE, type: { tag: 'integer' }, isTag: true }
    }
    return variantFieldSlot(td.variant, name, tagOff + tagSize(td.variant))
  }
  return undefined
}

function variantFieldSlot(
  vp: VariantPartDescriptor,
  name: string,
  start: number,
): FieldSlot | undefined {
  for (const b of vp.branches) {
    let off = start
    for (const f of b.fields) {
      if (f.name === name) {
        return { offset: off, size: sizeOf(f.type), type: f.type, isTag: false }
      }
      off += sizeOf(f.type)
    }
    if (b.nested) {
      if (b.nested.tagName === name) {
        return { offset: off, size: TAG_SIZE, type: { tag: 'integer' }, isTag: true }
      }
      const nested = variantFieldSlot(b.nested, name, off + tagSize(b.nested))
      if (nested) {
        return nested
      }
    }
  }
  return undefined
}

// 数组槽位

export interface ArraySlot {
  /** 最内层元素类型 */
  elemType: TypeDescriptor
  /** 最内层元素字节大小 */
  elemSize: number
  /** 各维下界 */
  lows: number[]
  /** 各维步长（字节） */
  strides: number[]
  /** 摊平后的各维范围，供部分下标切分剩余维度 */
  dims: { low: number; high: number }[]
}

/** 把（可能嵌套的）数组类型摊平成维度 + 步长 */
export function arraySlot(td: TypeDescriptor): ArraySlot {
  const dims: { low: number; high: number }[] = []
  let cur = td
  while (cur.tag === 'array') {
    for (const d of cur.dims ?? []) {
      dims.push(d)
    }
    cur = cur.elem!
  }
  const elemSize = sizeOf(cur)
  const strides = new Array<number>(dims.length).fill(elemSize)
  for (let i = dims.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * (dims[i + 1].high - dims[i + 1].low + 1)
  }
  return { elemType: cur, elemSize, lows: dims.map((d) => d.low), strides, dims }
}

/**
 * 部分下标时的槽位类型。
 *
 * `a[i]`（二维数组）只给一个下标时，槽位不是最内层元素，而是「剩余维度构成的数组」。
 * ISO 6.4.3.2 / 6.5.3.2 要求缩写形式 a[i,j] 与全形式 a[i][j] 等价：全形式正是靠这一步
 * 拿到中间层的数组视图，内层再取下标才成立。
 */
export function remainingArrayType(
  arr: ArraySlot,
  indexCount: number,
): TypeDescriptor | undefined {
  if (indexCount >= arr.dims.length) {
    return undefined
  }
  return { tag: 'array', dims: arr.dims.slice(indexCount), elem: arr.elemType }
}
