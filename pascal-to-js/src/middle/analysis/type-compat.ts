/*
 * 类型同一性与兼容性判定（ISO 7185 6.4.1 / 6.4.5 / 6.4.6）。
 *
 * 纯函数，不依赖分析状态。判定约定：
 * - new-type（array / record / set / file / pointer / enum）的每次出现都是互不相同的类型（6.4.1），
 *   而同一 type-definition 的所有引用共享同一 TypeInfo 对象（Pass 1 的 placeholder 机制），
 *   因此按对象身份判定同一性。
 * - 简单类型（integer / real / boolean / char）按 tag 判定。
 * - subrange-type 按区间与 host-type 判定。
 * - string-type 按分量数判定（6.1.7、6.4.5 d）；非标扩展 string 以 dims.high === 0 表示
 *   任意长度，参与比较时通配。
 */

import { TypeInfo } from './analysis-type.ts'

/** ISO 6.4.2.1：ordinal-type = 枚举型、子界型、char、boolean、integer */
export function isOrdinalType(t: TypeInfo): boolean {
  switch (t.tag) {
    case 'integer':
    case 'boolean':
    case 'char':
    case 'enum':
    case 'subrange':
      return true
    default:
      return false
  }
}

/**
 * ISO 6.4.3.2：packed array[1..n] of char（n > 1）为 string-type。
 * 非标扩展 string 以 high === 0 表示任意长度，一并按 string-type 处理。
 */
export function isStringType(t: TypeInfo): boolean {
  if (t.tag !== 'array' || t.elem?.tag !== 'char') {
    return false
  }
  const dims = t.dims
  if (!dims || dims.length !== 1) {
    return false
  }
  return dims[0].low === 1 && (dims[0].high > 1 || dims[0].high === 0)
}

/** string-type 的分量数；0 表示非标 string 扩展（任意长度），参与比较时通配 */
function stringLength(t: TypeInfo): number {
  return t.dims?.[0].high ?? 0
}

/** ordinal-type 的值域闭区间，供 6.4.5 b) 判定「是否为子界」使用 */
function intervalOf(t: TypeInfo): { low: number; high: number } | undefined {
  switch (t.tag) {
    case 'integer':
      return { low: -2147483648, high: 2147483647 }
    case 'char':
      return { low: 0, high: 255 }
    case 'boolean':
      return { low: 0, high: 1 }
    case 'enum':
      return { low: 0, high: (t.enumCount ?? 1) - 1 }
    case 'subrange':
      return t.low !== undefined && t.high !== undefined ? { low: t.low, high: t.high } : undefined
    default:
      return undefined
  }
}

/** ISO 6.4.5 a)：T1 与 T2 是同一类型 */
export function isSameType(a: TypeInfo, b: TypeInfo): boolean {
  if (isStringType(a) && isStringType(b)) {
    const la = stringLength(a)
    const lb = stringLength(b)
    return la === 0 || lb === 0 || la === lb
  }
  if (a.tag !== b.tag) {
    return false
  }
  if (a.tag === 'integer' || a.tag === 'real' || a.tag === 'boolean' || a.tag === 'char') {
    return true
  }
  if (a.tag === 'subrange') {
    return a.low === b.low && a.high === b.high && a.baseTag === b.baseTag
  }
  // new-type：同一 type-definition 的引用共享同一对象，对象身份即类型同一
  return a === b
}

/** ISO 6.4.5 b)：T1 是 T2 的子界、或 T2 是 T1 的子界、或两者是同一 host-type 的子界 */
export function isCompatibleOrdinal(a: TypeInfo, b: TypeInfo): boolean {
  if (!isOrdinalType(a) || !isOrdinalType(b)) {
    return false
  }
  if (isSameType(a, b)) {
    return true
  }
  if (a.tag === 'subrange' && b.tag === 'subrange' && a.baseTag === b.baseTag) {
    return true
  }
  const ia = intervalOf(a)
  const ib = intervalOf(b)
  if (!ia || !ib) {
    return false
  }
  // 「is a subrange of」要求一侧确为 subrange-type，另一方为其宿主类型或更宽的区间
  if (a.tag === 'subrange' && ia.low >= ib.low && ia.high <= ib.high) {
    return true
  }
  if (b.tag === 'subrange' && ib.low >= ia.low && ib.high <= ia.high) {
    return true
  }
  return false
}

/**
 * ISO 6.4.5 c)：兼容的 set-type。
 * packed 修饰符的差异属 designated error（D.50），不在类型层面判定。
 */
export function isCompatibleSet(a: TypeInfo, b: TypeInfo): boolean {
  if (a.tag !== 'set' || b.tag !== 'set') {
    return false
  }
  // 集合构造器与集合运算的结果类型不含 base-type 信息，无法进一步判定
  if (!a.setBase || !b.setBase) {
    return true
  }
  return isCompatibleOrdinal(a.setBase, b.setBase)
}

/**
 * ISO 6.4.6：类型 T2 的值对类型 T1 是否赋值兼容。
 * 6.4.6 c)/d) 中「值落在闭区间内」的部分属运行期或 designated error（D.49/D.50），
 * 此处只判类型层面的兼容性。
 */
export function isAssignCompatible(target: TypeInfo, value: TypeInfo): boolean {
  // a)
  if (isSameType(target, value)) {
    return true
  }
  // b) real-type ← integer-type
  if (target.tag === 'real' && value.tag === 'integer') {
    return true
  }
  // ISO 6.4.4 NOTE 2：nil-value 不含单一类型，可适配任意 pointer-type
  if (target.tag === 'pointer' && value.tag === 'nil') {
    return true
  }
  // c) 兼容的 ordinal-types
  if (isCompatibleOrdinal(target, value)) {
    return true
  }
  // d) 兼容的 set-types
  if (isCompatibleSet(target, value)) {
    return true
  }
  // e) 兼容的 string-types 等价于分量数相同的 string-type，已由 a) 的 isSameType 覆盖
  return false
}
