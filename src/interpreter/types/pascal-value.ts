/**
 * Pascal 类型系统核心
 *
 * 每个 PascalValue 都是带类型的 boxed 对象
 * 内部表示尽量贴近 Pascal 内存模型，减少依赖 JS 原生类型
 *
 * 约定：
 * - 整数：小整数用 number，LONGINT/LONGWORD 用 bigint
 * - 实数：用 number（IEEE 754），但意识到精度限制
 * - 字符：用 number (ASCII code 0..255)，不是 JS string
 * - 布尔：用 number (0/1)，不是 JS boolean
 * - 字符串/PACKED ARRAY OF CHAR：用 number[] (ASCII 数组)
 * - 数组：用 PascalArray
 * - 记录：用 PascalRecord
 * - 文件：用 PascalFile（抽象句柄，来自 io.ts）
 */

import { createEmptyFile } from '../io'

// ============================================================================
// PascalValue - 带类型的值
// ============================================================================

export interface PascalValue {
  readonly type: PascalType
  readonly rawValue: unknown
}

// ============================================================================
// PascalType - 类型接口
// ============================================================================

export type PascalTypeKind =
  | 'integer'
  | 'real'
  | 'char'
  | 'boolean'
  | 'string'
  | 'subrange'
  | 'array'
  | 'record'
  | 'file'
  | 'set'

export interface PascalType {
  readonly name: string
  readonly kind: PascalTypeKind

  // 检查数值是否在此类型范围内 (仅对数值类型有意义)
  checkRange(value: number | bigint): boolean

  // 类型兼容性检查
  isAssignableFrom(other: PascalType): boolean

  // 算术运算
  add?(other: PascalType, left: PascalValue, right: PascalValue): PascalValue
  sub?(other: PascalType, left: PascalValue, right: PascalValue): PascalValue
  mul?(other: PascalType, left: PascalValue, right: PascalValue): PascalValue
  div?(other: PascalType, left: PascalValue, right: PascalValue): PascalValue
  intDiv?(other: PascalType, left: PascalValue, right: PascalValue): PascalValue
  mod?(other: PascalType, left: PascalValue, right: PascalValue): PascalValue

  // 比较运算
  eq?(other: PascalType, left: PascalValue, right: PascalValue): PascalValue
  ne?(other: PascalType, left: PascalValue, right: PascalValue): PascalValue
  lt?(other: PascalType, left: PascalValue, right: PascalValue): PascalValue
  le?(other: PascalType, left: PascalValue, right: PascalValue): PascalValue
  gt?(other: PascalType, left: PascalValue, right: PascalValue): PascalValue
  ge?(other: PascalType, left: PascalValue, right: PascalValue): PascalValue
}

// ============================================================================
// 底层取值辅助函数
// ============================================================================

export function getNum(v: PascalValue): number {
  if (typeof v.rawValue === 'bigint') {
    return Number(v.rawValue)
  }
  return v.rawValue as number
}

export function getBigInt(v: PascalValue): bigint {
  if (typeof v.rawValue === 'bigint') {
    return v.rawValue
  }
  return BigInt(v.rawValue as number)
}

export function getCharCode(v: PascalValue): number {
  return v.rawValue as number
}

export function getBoolValue(v: PascalValue): boolean {
  return (v.rawValue as number) !== 0
}

export function getStringChars(v: PascalValue): number[] {
  return v.rawValue as number[]
}

// ============================================================================
// 整数类型
// ============================================================================

export abstract class IntegerType implements PascalType {
  readonly kind = 'integer' as const
  abstract readonly name: string
  abstract readonly min: number | bigint
  abstract readonly max: number | bigint
  abstract readonly useBigInt: boolean

  checkRange(value: number | bigint): boolean {
    const num = typeof value === 'bigint' ? Number(value) : value
    const min = typeof this.min === 'bigint' ? Number(this.min) : this.min
    const max = typeof this.max === 'bigint' ? Number(this.max) : this.max
    return num >= min && num <= max && Number.isInteger(num)
  }

  isAssignableFrom(other: PascalType): boolean {
    return other.kind === 'integer' || other.kind === 'subrange'
  }

  make(value: number | bigint): PascalValue {
    if (this.useBigInt) {
      const b = typeof value === 'bigint' ? value : BigInt(value)
      return { type: this, rawValue: this.truncateBigInt(b) }
    }
    return { type: this, rawValue: this.truncateNumber(Number(value)) }
  }

  protected truncateNumber(value: number): number {
    const min = Number(this.min)
    const max = Number(this.max)
    const range = max - min + 1
    if (value > max) {
      return min + ((value - min) % range)
    }
    if (value < min) {
      return max - ((min - value - 1) % range)
    }
    return value
  }

  protected truncateBigInt(value: bigint): bigint {
    const min = typeof this.min === 'bigint' ? this.min : BigInt(this.min)
    const max = typeof this.max === 'bigint' ? this.max : BigInt(this.max)
    const range = max - min + BigInt(1)
    if (value > max) {
      return min + ((value - min) % range)
    }
    if (value < min) {
      return max - ((min - value - BigInt(1)) % range)
    }
    return value
  }

  add(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    if (this.useBigInt) {
      return this.make(getBigInt(left) + getBigInt(right))
    }
    return this.make(getNum(left) + getNum(right))
  }

  sub(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    if (this.useBigInt) {
      return this.make(getBigInt(left) - getBigInt(right))
    }
    return this.make(getNum(left) - getNum(right))
  }

  mul(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    if (this.useBigInt) {
      return this.make(getBigInt(left) * getBigInt(right))
    }
    return this.make(getNum(left) * getNum(right))
  }

  div(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const r = getNum(right)
    if (r === 0) throw new Error('Division by zero')
    if (this.useBigInt) {
      const l = getBigInt(left)
      const rr = BigInt(r)
      // 向零截断
      const result = l / rr
      return this.make(result)
    }
    return this.make(Math.trunc(getNum(left) / r))
  }

  intDiv(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.div(other, left, right)
  }

  mod(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const r = getNum(right)
    if (r === 0) throw new Error('Modulo by zero')
    if (this.useBigInt) {
      const l = getBigInt(left)
      const rr = BigInt(r)
      const result = l - (l / rr) * rr
      return this.make(result)
    }
    const l = getNum(left)
    return this.make(l - Math.trunc(l / r) * r)
  }

  eq(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) === getNum(right))
  }

  ne(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) !== getNum(right))
  }

  lt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) < getNum(right))
  }

  le(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) <= getNum(right))
  }

  gt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) > getNum(right))
  }

  ge(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) >= getNum(right))
  }
}

class Integer16Type extends IntegerType {
  readonly name = 'INTEGER16'
  readonly min = -32768
  readonly max = 32767
  readonly useBigInt = false
}

class Integer32Type extends IntegerType {
  readonly name = 'INTEGER'
  readonly min = -2147483648
  readonly max = 2147483647
  readonly useBigInt = false
}

class SmallIntType extends IntegerType {
  readonly name = 'SMALLINT'
  readonly min = -128
  readonly max = 127
  readonly useBigInt = false
}

class LongIntType extends IntegerType {
  readonly name = 'LONGINT'
  readonly min = BigInt('-2147483648')
  readonly max = BigInt('2147483647')
  readonly useBigInt = true
}

class LongWordType extends IntegerType {
  readonly name = 'LONGWORD'
  readonly min = BigInt(0)
  readonly max = BigInt('4294967295')
  readonly useBigInt = true
}

class ByteType extends IntegerType {
  readonly name = 'BYTE'
  readonly min = 0
  readonly max = 255
  readonly useBigInt = false
}

class WordType extends IntegerType {
  readonly name = 'WORD'
  readonly min = 0
  readonly max = 65535
  readonly useBigInt = false
}

// ============================================================================
// 实数类型
// ============================================================================

class RealType implements PascalType {
  readonly name = 'REAL'
  readonly kind = 'real' as const

  checkRange(value: number | bigint): boolean {
    return true
  }

  isAssignableFrom(other: PascalType): boolean {
    return other.kind === 'integer' || other.kind === 'real' || other.kind === 'subrange'
  }

  add(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeReal(getNum(left) + getNum(right))
  }

  sub(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeReal(getNum(left) - getNum(right))
  }

  mul(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeReal(getNum(left) * getNum(right))
  }

  div(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const r = getNum(right)
    if (r === 0) throw new Error('Division by zero')
    return makeReal(getNum(left) / r)
  }

  eq(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) === getNum(right))
  }

  ne(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) !== getNum(right))
  }

  lt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) < getNum(right))
  }

  le(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) <= getNum(right))
  }

  gt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) > getNum(right))
  }

  ge(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) >= getNum(right))
  }
}

// ============================================================================
// 字符类型
// ============================================================================

class CharType implements PascalType {
  readonly name = 'CHAR'
  readonly kind = 'char' as const

  checkRange(value: number | bigint): boolean {
    const num = typeof value === 'bigint' ? Number(value) : value
    return num >= 0 && num <= 255
  }

  isAssignableFrom(other: PascalType): boolean {
    return other.kind === 'char'
  }

  eq(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getCharCode(left) === getCharCode(right))
  }

  ne(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getCharCode(left) !== getCharCode(right))
  }

  lt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getCharCode(left) < getCharCode(right))
  }

  le(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getCharCode(left) <= getCharCode(right))
  }

  gt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getCharCode(left) > getCharCode(right))
  }

  ge(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getCharCode(left) >= getCharCode(right))
  }
}

// ============================================================================
// 布尔类型
// ============================================================================

class BooleanType implements PascalType {
  readonly name = 'BOOLEAN'
  readonly kind = 'boolean' as const

  checkRange(value: number | bigint): boolean {
    const num = typeof value === 'bigint' ? Number(value) : value
    return num === 0 || num === 1
  }

  isAssignableFrom(other: PascalType): boolean {
    return other.kind === 'boolean'
  }

  eq(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getBoolValue(left) === getBoolValue(right))
  }

  ne(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getBoolValue(left) !== getBoolValue(right))
  }

  lt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) < getNum(right))
  }

  le(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) <= getNum(right))
  }

  gt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) > getNum(right))
  }

  ge(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(getNum(left) >= getNum(right))
  }
}

// ============================================================================
// 子界类型
// ============================================================================

export class SubrangeType implements PascalType {
  readonly kind = 'subrange' as const

  constructor(
    readonly name: string,
    readonly baseType: PascalType,
    readonly min: number,
    readonly max: number
  ) {}

  checkRange(value: number | bigint): boolean {
    const num = typeof value === 'bigint' ? Number(value) : value
    return num >= this.min && num <= this.max && Number.isInteger(num)
  }

  isAssignableFrom(other: PascalType): boolean {
    return other.kind === 'integer' || other.kind === 'subrange'
  }

  add(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.baseType.add!(other, left, right)
  }

  sub(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.baseType.sub!(other, left, right)
  }

  mul(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.baseType.mul!(other, left, right)
  }

  div(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.baseType.div!(other, left, right)
  }

  intDiv(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.baseType.intDiv!(other, left, right)
  }

  mod(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.baseType.mod!(other, left, right)
  }

  eq(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.baseType.eq!(other, left, right)
  }

  ne(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.baseType.ne!(other, left, right)
  }

  lt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.baseType.lt!(other, left, right)
  }

  le(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.baseType.le!(other, left, right)
  }

  gt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.baseType.gt!(other, left, right)
  }

  ge(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.baseType.ge!(other, left, right)
  }
}

// ============================================================================
// 数组类型
// ============================================================================

export interface PascalArray {
  // 用一维数组存储，通过索引函数访问
  elements: PascalValue[]
  // 每个维度的下标范围
  dimensions: { low: number; high: number }[]
  elementType: PascalType
}

export class ArrayType implements PascalType {
  readonly kind = 'array' as const

  constructor(
    readonly name: string,
    readonly elementType: PascalType,
    readonly dimensions: { low: number; high: number }[]
  ) {}

  checkRange(value: number | bigint): boolean {
    return true
  }

  isAssignableFrom(other: PascalType): boolean {
    // 数组之间一般不能整体赋值（除非完全相同）
    return false
  }
}

// ============================================================================
// 记录类型
// ============================================================================

export interface PascalRecord {
  fields: Map<string, PascalValue>
}

export class RecordType implements PascalType {
  readonly kind = 'record' as const
  readonly fieldTypes: Map<string, PascalType> = new Map()

  constructor(
    readonly name: string,
    fields: { name: string; type: PascalType }[]
  ) {
    for (const f of fields) {
      this.fieldTypes.set(f.name.toUpperCase(), f.type)
    }
  }

  checkRange(value: number | bigint): boolean {
    return true
  }

  isAssignableFrom(other: PascalType): boolean {
    return false
  }
}

// ============================================================================
// 文件类型
// ============================================================================

export class FileType implements PascalType {
  readonly kind = 'file' as const

  constructor(
    readonly name: string,
    readonly elementType: PascalType | null = null
  ) {}

  checkRange(value: number | bigint): boolean {
    return true
  }

  isAssignableFrom(other: PascalType): boolean {
    return other.kind === 'file'
  }
}

// ============================================================================
// 集合类型
// ============================================================================

/**
 * Pascal SET 类型。
 * rawValue 使用 Set<number> 存储「元素的序数值」（整数用其数值，字符用 ASCII 码）。
 * baseType 是元素类型（通常为 SubrangeType 或 CharType）。
 * min/max 是合法元素的序数范围，用于运行时范围检查。
 */
export class SetType implements PascalType {
  readonly kind = 'set' as const

  constructor(
    readonly name: string,
    readonly baseType: PascalType,
    readonly min: number,
    readonly max: number
  ) {}

  checkRange(value: number | bigint): boolean {
    const num = typeof value === 'bigint' ? Number(value) : value
    return num >= this.min && num <= this.max
  }

  isAssignableFrom(other: PascalType): boolean {
    // 同为集合类型即可互相赋值（兼容的元素类型在 coerceToType 中做范围检查）
    return other.kind === 'set'
  }

  /** 检查元素序数值是否在集合的合法范围内 */
  checkElement(ord: number): void {
    if (ord < this.min || ord > this.max) {
      throw new Error(`Set element ${ord} out of range ${this.min}..${this.max}`)
    }
  }

  add(_other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const ls = left.rawValue as Set<number>
    const rs = right.rawValue as Set<number>
    const result = new Set<number>(ls)
    for (const v of rs) result.add(v)
    return { type: left.type, rawValue: result }
  }

  sub(_other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const ls = left.rawValue as Set<number>
    const rs = right.rawValue as Set<number>
    const result = new Set<number>()
    for (const v of ls) {
      if (!rs.has(v)) result.add(v)
    }
    return { type: left.type, rawValue: result }
  }

  mul(_other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const ls = left.rawValue as Set<number>
    const rs = right.rawValue as Set<number>
    const result = new Set<number>()
    for (const v of ls) {
      if (rs.has(v)) result.add(v)
    }
    return { type: left.type, rawValue: result }
  }

  eq(_other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const ls = left.rawValue as Set<number>
    const rs = right.rawValue as Set<number>
    if (ls.size !== rs.size) return makeBoolean(false)
    for (const v of ls) if (!rs.has(v)) return makeBoolean(false)
    return makeBoolean(true)
  }

  ne(_other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return makeBoolean(!getBoolValue(this.eq(_other, left, right)))
  }

  /** 子集：left <= right */
  le(_other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const ls = left.rawValue as Set<number>
    const rs = right.rawValue as Set<number>
    for (const v of ls) if (!rs.has(v)) return makeBoolean(false)
    return makeBoolean(true)
  }

  /** 超集：left >= right */
  ge(_other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const ls = left.rawValue as Set<number>
    const rs = right.rawValue as Set<number>
    for (const v of rs) if (!ls.has(v)) return makeBoolean(false)
    return makeBoolean(true)
  }
}

// ============================================================================
// 类型单例
// ============================================================================

export const INTEGER_TYPE: PascalType = new Integer32Type()
export const SMALLINT_TYPE: PascalType = new SmallIntType()
export const LONGINT_TYPE: PascalType = new LongIntType()
export const LONGWORD_TYPE: PascalType = new LongWordType()
export const BYTE_TYPE: PascalType = new ByteType()
export const WORD_TYPE: PascalType = new WordType()
export const REAL_TYPE: PascalType = new RealType()
export const CHAR_TYPE: PascalType = new CharType()
export const BOOLEAN_TYPE: PascalType = new BooleanType()

// ============================================================================
// 工厂函数
// ============================================================================

export function makeInteger(value: number): PascalValue {
  const type = INTEGER_TYPE as IntegerType
  return type.make(value)
}

export function makeLongInt(value: bigint | number): PascalValue {
  const type = LONGINT_TYPE as IntegerType
  const b = typeof value === 'bigint' ? value : BigInt(value)
  return type.make(b)
}

export function makeReal(value: number): PascalValue {
  return { type: REAL_TYPE, rawValue: value }
}

export function makeChar(value: number | string): PascalValue {
  if (typeof value === 'string') {
    return { type: CHAR_TYPE, rawValue: value.charCodeAt(0) }
  }
  return { type: CHAR_TYPE, rawValue: value & 0xff }
}

export function makeBoolean(value: boolean): PascalValue {
  return { type: BOOLEAN_TYPE, rawValue: value ? 1 : 0 }
}

export function makeDefaultValue(type: PascalType): PascalValue {
  switch (type.kind) {
    case 'integer':
      return type === LONGINT_TYPE || type === LONGWORD_TYPE
        ? { type, rawValue: BigInt(0) }
        : { type, rawValue: 0 }
    case 'real':
      return { type, rawValue: 0 }
    case 'char':
      return { type, rawValue: 0 }
    case 'boolean':
      return { type, rawValue: 0 }
    case 'string':
      return { type, rawValue: [] }
    case 'subrange':
      return { type, rawValue: (type as SubrangeType).min }
    case 'array':
      return createEmptyArray(type as ArrayType)
    case 'record':
      return createEmptyRecord(type as RecordType)
    case 'file':
      return { type, rawValue: createEmptyFile() }
    case 'set':
      return { type, rawValue: new Set<number>() }
    default:
      return { type: INTEGER_TYPE, rawValue: 0 }
  }
}

export function createEmptyArray(arrayType: ArrayType): PascalValue {
  const totalSize = arrayType.dimensions.reduce((acc, d) => acc * (d.high - d.low + 1), 1)
  const elements: PascalValue[] = []
  for (let i = 0; i < totalSize; i++) {
    elements.push(makeDefaultValue(arrayType.elementType))
  }
  const arr: PascalArray = {
    elements,
    dimensions: arrayType.dimensions,
    elementType: arrayType.elementType,
  }
  return { type: arrayType, rawValue: arr }
}

export function createEmptyRecord(recordType: RecordType): PascalValue {
  const fields = new Map<string, PascalValue>()
  recordType.fieldTypes.forEach((type, name) => {
    fields.set(name, makeDefaultValue(type))
  })
  return { type: recordType, rawValue: { fields } }
}

// 文件操作函数已移至 io.ts

// ============================================================================
// 类型查找表
// ============================================================================

const TYPE_TABLE: Record<string, PascalType> = {
  INTEGER: INTEGER_TYPE,
  SMALLINT: SMALLINT_TYPE,
  LONGINT: LONGINT_TYPE,
  LONGWORD: LONGWORD_TYPE,
  BYTE: BYTE_TYPE,
  WORD: WORD_TYPE,
  REAL: REAL_TYPE,
  CHAR: CHAR_TYPE,
  BOOLEAN: BOOLEAN_TYPE,
  TEXT: new FileType('TEXT', CHAR_TYPE),
}

export function findType(name: string): PascalType | undefined {
  return TYPE_TABLE[name.toUpperCase()]
}

export function registerType(name: string, type: PascalType): void {
  TYPE_TABLE[name.toUpperCase()] = type
}

// ============================================================================
// 运算分发
// ============================================================================

export function binaryOp(op: string, left: PascalValue, right: PascalValue): PascalValue {
  if (!left || !left.type) {
    throw new Error(`binaryOp: left operand is undefined for operator ${op}`)
  }
  if (!right || !right.type) {
    throw new Error(`binaryOp: right operand is undefined for operator ${op}`)
  }

  const upper = op.toUpperCase()

  switch (upper) {
    case '+':
      return left.type.add!(right.type, left, right)
    case '-':
      return left.type.sub!(right.type, left, right)
    case '*':
      return left.type.mul!(right.type, left, right)
    case '/':
      return left.type.div!(right.type, left, right)
    case 'DIV':
      return left.type.intDiv!(right.type, left, right)
    case 'MOD':
      return left.type.mod!(right.type, left, right)
    case '=':
      return left.type.eq!(right.type, left, right)
    case '<>':
      return left.type.ne!(right.type, left, right)
    case '<':
      return left.type.lt!(right.type, left, right)
    case '<=':
      return left.type.le!(right.type, left, right)
    case '>':
      return left.type.gt!(right.type, left, right)
    case '>=':
      return left.type.ge!(right.type, left, right)
    case 'AND':
      return makeBoolean(getBoolValue(left) && getBoolValue(right))
    case 'OR':
      return makeBoolean(getBoolValue(left) || getBoolValue(right))
    default:
      throw new Error(`Unknown operator: ${op}`)
  }
}

export function unaryOp(op: string, operand: PascalValue): PascalValue {
  const upper = op.toUpperCase()

  switch (upper) {
    case '+':
      return { type: operand.type, rawValue: operand.rawValue }
    case '-': {
      if (operand.type === LONGINT_TYPE || operand.type === LONGWORD_TYPE) {
        return { type: operand.type, rawValue: -(operand.rawValue as bigint) }
      }
      return { type: operand.type, rawValue: -(operand.rawValue as number) }
    }
    case 'NOT':
      return makeBoolean(!getBoolValue(operand))
    default:
      throw new Error(`Unknown unary operator: ${op}`)
  }
}

// ============================================================================
// 类型转换
// ============================================================================

export function coerceToType(value: PascalValue, targetType: PascalType): PascalValue {
  if (value.type === targetType) {
    return value
  }

  // 整数到子界类型 或 子界到整数
  if (
    (value.type.kind === 'integer' && targetType.kind === 'subrange') ||
    (value.type.kind === 'subrange' && targetType.kind === 'integer')
  ) {
    // Pascal82: 赋值给子界类型必须检查运行时范围
    if (targetType.kind === 'subrange') {
      const sub = targetType as SubrangeType
      const num = getNum(value)
      if (!sub.checkRange(num)) {
        throw new Error(`Value ${num} out of range ${sub.min}..${sub.max}`)
      }
    }
    return { type: targetType, rawValue: value.rawValue }
  }

  // 整数到实数
  if (value.type.kind === 'integer' && targetType.kind === 'real') {
    return makeReal(getNum(value))
  }

  // 字符到整数/子界（Pascal 中 ord(ch) 返回字符的 ASCII 码）
  if (
    value.type.kind === 'char' &&
    (targetType.kind === 'integer' || targetType.kind === 'subrange')
  ) {
    if (targetType.kind === 'subrange') {
      const sub = targetType as SubrangeType
      const code = getCharCode(value)
      if (!sub.checkRange(code)) {
        throw new Error(`Value ${code} out of range ${sub.min}..${sub.max}`)
      }
    }
    return { type: targetType, rawValue: getCharCode(value) }
  }

  // 布尔到整数（Pascal 中 ord(false)=0, ord(true)=1）
  if (value.type.kind === 'boolean' && targetType.kind === 'integer') {
    return { type: targetType, rawValue: getNum(value) }
  }

  // 整数到布尔
  if (value.type.kind === 'integer' && targetType.kind === 'boolean') {
    return makeBoolean(getNum(value) !== 0)
  }

  // 同类类型之间可以赋值
  if (value.type.kind === targetType.kind) {
    // 子界→子界：必须检查目标范围
    if (targetType.kind === 'subrange') {
      const sub = targetType as SubrangeType
      const num = getNum(value)
      if (!sub.checkRange(num)) {
        throw new Error(`Value ${num} out of range ${sub.min}..${sub.max}`)
      }
      return { type: targetType, rawValue: value.rawValue }
    }
    // 集合→集合：必须检查每个元素是否在目标集合的范围内
    if (targetType.kind === 'set') {
      const targetSet = targetType as SetType
      const src = value.rawValue as Set<number>
      for (const ord of src) {
        if (!targetSet.checkRange(ord)) {
          throw new Error(`Set element ${ord} out of range ${targetSet.min}..${targetSet.max}`)
        }
      }
      // 复制 Set 避免共享引用
      return { type: targetType, rawValue: new Set<number>(src) }
    }
    return value
  }

  throw new Error(`Cannot coerce ${value.type.name} to ${targetType.name}`)
}

// ============================================================================
// 数组索引计算和访问
// ============================================================================

export function arrayIndex(array: PascalArray, indices: number[]): number {
  if (indices.length !== array.dimensions.length) {
    throw new Error(
      `Array index dimension mismatch: expected ${array.dimensions.length}, got ${indices.length}`
    )
  }

  let index = 0
  for (let i = 0; i < indices.length; i++) {
    const dim = array.dimensions[i]
    const idx = indices[i]
    if (idx < dim.low || idx > dim.high) {
      throw new Error(`Array index out of bounds: ${idx} not in [${dim.low}, ${dim.high}]`)
    }
    index = index * (dim.high - dim.low + 1) + (idx - dim.low)
  }
  return index
}

/**
 * 从数组中读取元素，支持多维索引访问嵌套数组。
 * Pascal82: a[i,j] 等价于 a[i][j]（当 a 是 array of array 时）。
 */
export function arrayGetElement(arr: PascalArray, indices: number[]): PascalValue {
  const dims = arr.dimensions
  if (indices.length < dims.length) {
    throw new Error(
      `Array index dimension mismatch: expected at least ${dims.length}, got ${indices.length}`
    )
  }
  let flatIndex = 0
  for (let i = 0; i < dims.length; i++) {
    const dim = dims[i]
    const idx = indices[i]
    if (idx < dim.low || idx > dim.high) {
      throw new Error(`Array index out of bounds: ${idx} not in [${dim.low}, ${dim.high}]`)
    }
    flatIndex = flatIndex * (dim.high - dim.low + 1) + (idx - dim.low)
  }
  const element = arr.elements[flatIndex]
  if (indices.length > dims.length) {
    if (element.type.kind !== 'array') {
      throw new Error(`Array index dimension mismatch: too many indices for non-array element`)
    }
    return arrayGetElement(element.rawValue as PascalArray, indices.slice(dims.length))
  }
  return element
}

/**
 * 向数组中写入元素，支持多维索引访问嵌套数组。
 */
export function arraySetElement(arr: PascalArray, indices: number[], value: PascalValue): void {
  const dims = arr.dimensions
  if (indices.length < dims.length) {
    throw new Error(
      `Array index dimension mismatch: expected at least ${dims.length}, got ${indices.length}`
    )
  }
  let flatIndex = 0
  for (let i = 0; i < dims.length; i++) {
    const dim = dims[i]
    const idx = indices[i]
    if (idx < dim.low || idx > dim.high) {
      throw new Error(`Array index out of bounds: ${idx} not in [${dim.low}, ${dim.high}]`)
    }
    flatIndex = flatIndex * (dim.high - dim.low + 1) + (idx - dim.low)
  }
  if (indices.length > dims.length) {
    const element = arr.elements[flatIndex]
    if (element.type.kind !== 'array') {
      throw new Error(`Array index dimension mismatch: too many indices for non-array element`)
    }
    arraySetElement(element.rawValue as PascalArray, indices.slice(dims.length), value)
    return
  }
  arr.elements[flatIndex] = value
}
