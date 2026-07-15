/**
 * Pascal 类型系统核心
 *
 * 每个 PascalValue 都是带类型的 boxed 对象
 * 运算由类型决定，支持溢出/截断检查
 */

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

export interface PascalType {
  readonly name: string
  readonly kind: 'integer' | 'real' | 'char' | 'boolean' | 'string' | 'subrange'

  // 检查值是否在此类型范围内
  checkRange(value: number): boolean

  // 类型兼容性检查
  isAssignableFrom(other: PascalType): boolean

  // 算术运算 (返回 null 表示不支持的运算)
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

  // 一元运算
  neg?(): PascalValue
  pos?(): PascalValue
  not?(): PascalValue
}

// ============================================================================
// 整数类型
// ============================================================================

abstract class IntegerType implements PascalType {
  readonly kind = 'integer' as const

  abstract readonly name: string
  abstract readonly min: number
  abstract readonly max: number

  checkRange(value: number): boolean {
    return value >= this.min && value <= this.max && Number.isInteger(value)
  }

  isAssignableFrom(other: PascalType): boolean {
    return other.kind === 'integer' || other.kind === 'subrange'
  }

  // 辅助方法：获取数值
  protected getNum(v: PascalValue): number {
    return v.rawValue as number
  }

  // 辅助方法：截断到范围
  protected truncate(value: number): number {
    // 模拟 Pascal 整数溢出行为
    if (value > this.max) {
      // 溢出: 在 Pascal 中通常未定义，这里我们模拟回绕
      const range = this.max - this.min + 1
      return this.min + ((value - this.min) % range)
    }
    if (value < this.min) {
      const range = this.max - this.min + 1
      return this.max - ((this.min - value - 1) % range)
    }
    return value
  }

  add(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const result = this.getNum(left) + this.getNum(right)
    return { type: INTEGER_TYPE, rawValue: this.truncate(result) }
  }

  sub(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const result = this.getNum(left) - this.getNum(right)
    return { type: INTEGER_TYPE, rawValue: this.truncate(result) }
  }

  mul(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const result = this.getNum(left) * this.getNum(right)
    return { type: INTEGER_TYPE, rawValue: this.truncate(result) }
  }

  div(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const l = this.getNum(left)
    const r = this.getNum(right)
    if (r === 0) {
      throw new Error('Division by zero')
    }
    // Pascal DIV 是向零截断
    const result = Math.trunc(l / r)
    return { type: INTEGER_TYPE, rawValue: this.truncate(result) }
  }

  intDiv(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return this.div(other, left, right)
  }

  mod(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const l = this.getNum(left)
    const r = this.getNum(right)
    if (r === 0) {
      throw new Error('Modulo by zero')
    }
    // Pascal MOD 的符号跟随除数
    const result = l - Math.trunc(l / r) * r
    return { type: INTEGER_TYPE, rawValue: this.truncate(result) }
  }

  eq(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getNum(left) === this.getNum(right) }
  }

  ne(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getNum(left) !== this.getNum(right) }
  }

  lt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getNum(left) < this.getNum(right) }
  }

  le(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getNum(left) <= this.getNum(right) }
  }

  gt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getNum(left) > this.getNum(right) }
  }

  ge(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getNum(left) >= this.getNum(right) }
  }

  neg(): PascalValue {
    return { type: INTEGER_TYPE, rawValue: 0 }
  }

  pos(): PascalValue {
    return { type: INTEGER_TYPE, rawValue: 0 }
  }

  not(): PascalValue {
    throw new Error('NOT operator not applicable to integer type')
  }
}

// INTEGER (16-bit signed)
class Integer16Type extends IntegerType {
  readonly name = 'INTEGER'
  readonly min = -32768
  readonly max = 32767
}

// SMALLINT (8-bit signed)
class SmallIntType extends IntegerType {
  readonly name = 'SMALLINT'
  readonly min = -128
  readonly max = 127
}

// LONGINT (32-bit signed)
class LongIntType extends IntegerType {
  readonly name = 'LONGINT'
  readonly min = -2147483648
  readonly max = 2147483647

  // LONGINT 运算需要特殊处理
  protected truncate(value: number): number {
    // 使用 32 位整数模拟
    return value | 0
  }
}

// ============================================================================
// 实数类型
// ============================================================================

class RealType implements PascalType {
  readonly name = 'REAL'
  readonly kind = 'real' as const

  checkRange(value: number): boolean {
    return true
  }

  isAssignableFrom(other: PascalType): boolean {
    return other.kind === 'integer' || other.kind === 'real' || other.kind === 'subrange'
  }

  private getNum(v: PascalValue): number {
    return v.rawValue as number
  }

  add(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: REAL_TYPE, rawValue: this.getNum(left) + this.getNum(right) }
  }

  sub(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: REAL_TYPE, rawValue: this.getNum(left) - this.getNum(right) }
  }

  mul(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: REAL_TYPE, rawValue: this.getNum(left) * this.getNum(right) }
  }

  div(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    const r = this.getNum(right)
    if (r === 0) {
      throw new Error('Division by zero')
    }
    return { type: REAL_TYPE, rawValue: this.getNum(left) / r }
  }

  eq(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getNum(left) === this.getNum(right) }
  }

  ne(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getNum(left) !== this.getNum(right) }
  }

  lt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getNum(left) < this.getNum(right) }
  }

  le(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getNum(left) <= this.getNum(right) }
  }

  gt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getNum(left) > this.getNum(right) }
  }

  ge(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getNum(left) >= this.getNum(right) }
  }

  neg(): PascalValue {
    return { type: REAL_TYPE, rawValue: 0 }
  }

  pos(): PascalValue {
    return { type: REAL_TYPE, rawValue: 0 }
  }
}

// ============================================================================
// 字符类型
// ============================================================================

class CharType implements PascalType {
  readonly name = 'CHAR'
  readonly kind = 'char' as const

  checkRange(value: number): boolean {
    return value >= 0 && value <= 255
  }

  isAssignableFrom(other: PascalType): boolean {
    return other.kind === 'char'
  }

  private getChar(v: PascalValue): string {
    return v.rawValue as string
  }

  eq(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getChar(left) === this.getChar(right) }
  }

  ne(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getChar(left) !== this.getChar(right) }
  }

  lt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getChar(left) < this.getChar(right) }
  }

  le(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getChar(left) <= this.getChar(right) }
  }

  gt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getChar(left) > this.getChar(right) }
  }

  ge(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getChar(left) >= this.getChar(right) }
  }
}

// ============================================================================
// 布尔类型
// ============================================================================

class BooleanType implements PascalType {
  readonly name = 'BOOLEAN'
  readonly kind = 'boolean' as const

  checkRange(value: number): boolean {
    return value === 0 || value === 1
  }

  isAssignableFrom(other: PascalType): boolean {
    return other.kind === 'boolean'
  }

  private getBool(v: PascalValue): boolean {
    return v.rawValue as boolean
  }

  eq(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getBool(left) === this.getBool(right) }
  }

  ne(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getBool(left) !== this.getBool(right) }
  }

  not(): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: true }
  }
}

// ============================================================================
// 字符串类型
// ============================================================================

class StringType implements PascalType {
  readonly name = 'STRING'
  readonly kind = 'string' as const

  checkRange(value: number): boolean {
    return true
  }

  isAssignableFrom(other: PascalType): boolean {
    return other.kind === 'string' || other.kind === 'char'
  }

  private getStr(v: PascalValue): string {
    return v.rawValue as string
  }

  eq(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getStr(left) === this.getStr(right) }
  }

  ne(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getStr(left) !== this.getStr(right) }
  }

  lt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getStr(left) < this.getStr(right) }
  }

  le(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getStr(left) <= this.getStr(right) }
  }

  gt(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getStr(left) > this.getStr(right) }
  }

  ge(other: PascalType, left: PascalValue, right: PascalValue): PascalValue {
    return { type: BOOLEAN_TYPE, rawValue: this.getStr(left) >= this.getStr(right) }
  }
}

// ============================================================================
// 类型单例
// ============================================================================

export const INTEGER_TYPE: PascalType = new Integer16Type()
export const SMALLINT_TYPE: PascalType = new SmallIntType()
export const LONGINT_TYPE: PascalType = new LongIntType()
export const REAL_TYPE: PascalType = new RealType()
export const CHAR_TYPE: PascalType = new CharType()
export const BOOLEAN_TYPE: PascalType = new BooleanType()
export const STRING_TYPE: PascalType = new StringType()

// ============================================================================
// 工厂函数
// ============================================================================

export function makeInteger(value: number): PascalValue {
  // 检查范围并截断
  const truncated = INTEGER_TYPE.checkRange(value) ? value : (value & 0xFFFF) - (value & 0x8000 ? 0x10000 : 0)
  return { type: INTEGER_TYPE, rawValue: truncated }
}

export function makeReal(value: number): PascalValue {
  return { type: REAL_TYPE, rawValue: value }
}

export function makeChar(value: string): PascalValue {
  return { type: CHAR_TYPE, rawValue: value }
}

export function makeBoolean(value: boolean): PascalValue {
  return { type: BOOLEAN_TYPE, rawValue: value }
}

export function makeString(value: string): PascalValue {
  return { type: STRING_TYPE, rawValue: value }
}

// ============================================================================
// 类型查找表
// ============================================================================

const TYPE_TABLE: Record<string, PascalType> = {
  'INTEGER': INTEGER_TYPE,
  'SMALLINT': SMALLINT_TYPE,
  'LONGINT': LONGINT_TYPE,
  'REAL': REAL_TYPE,
  'CHAR': CHAR_TYPE,
  'BOOLEAN': BOOLEAN_TYPE,
  'STRING': STRING_TYPE,
}

export function findType(name: string): PascalType | undefined {
  return TYPE_TABLE[name.toUpperCase()]
}

// ============================================================================
// 运算分发
// ============================================================================

export function binaryOp(op: string, left: PascalValue, right: PascalValue): PascalValue {
  const upper = op.toUpperCase()

  switch (upper) {
    case '+': {
      const fn = left.type.add?.bind(left.type)
      if (fn) return fn(right.type, left, right)
      throw new Error(`Operator + not supported for ${left.type.name} and ${right.type.name}`)
    }
    case '-': {
      const fn = left.type.sub?.bind(left.type)
      if (fn) return fn(right.type, left, right)
      throw new Error(`Operator - not supported for ${left.type.name} and ${right.type.name}`)
    }
    case '*': {
      const fn = left.type.mul?.bind(left.type)
      if (fn) return fn(right.type, left, right)
      throw new Error(`Operator * not supported for ${left.type.name} and ${right.type.name}`)
    }
    case '/': {
      const fn = left.type.div?.bind(left.type)
      if (fn) return fn(right.type, left, right)
      throw new Error(`Operator / not supported for ${left.type.name} and ${right.type.name}`)
    }
    case 'DIV': {
      const fn = left.type.intDiv?.bind(left.type)
      if (fn) return fn(right.type, left, right)
      throw new Error(`Operator DIV not supported for ${left.type.name} and ${right.type.name}`)
    }
    case 'MOD': {
      const fn = left.type.mod?.bind(left.type)
      if (fn) return fn(right.type, left, right)
      throw new Error(`Operator MOD not supported for ${left.type.name} and ${right.type.name}`)
    }
    case '=': {
      const fn = left.type.eq?.bind(left.type)
      if (fn) return fn(right.type, left, right)
      throw new Error(`Operator = not supported for ${left.type.name} and ${right.type.name}`)
    }
    case '<>': {
      const fn = left.type.ne?.bind(left.type)
      if (fn) return fn(right.type, left, right)
      throw new Error(`Operator <> not supported for ${left.type.name} and ${right.type.name}`)
    }
    case '<': {
      const fn = left.type.lt?.bind(left.type)
      if (fn) return fn(right.type, left, right)
      throw new Error(`Operator < not supported for ${left.type.name} and ${right.type.name}`)
    }
    case '<=': {
      const fn = left.type.le?.bind(left.type)
      if (fn) return fn(right.type, left, right)
      throw new Error(`Operator <= not supported for ${left.type.name} and ${right.type.name}`)
    }
    case '>': {
      const fn = left.type.gt?.bind(left.type)
      if (fn) return fn(right.type, left, right)
      throw new Error(`Operator > not supported for ${left.type.name} and ${right.type.name}`)
    }
    case '>=': {
      const fn = left.type.ge?.bind(left.type)
      if (fn) return fn(right.type, left, right)
      throw new Error(`Operator >= not supported for ${left.type.name} and ${right.type.name}`)
    }
    case 'AND': {
      // AND 只适用于布尔类型
      if (left.type.kind === 'boolean' && right.type.kind === 'boolean') {
        return makeBoolean((left.rawValue as boolean) && (right.rawValue as boolean))
      }
      throw new Error(`Operator AND not supported for ${left.type.name} and ${right.type.name}`)
    }
    case 'OR': {
      // OR 只适用于布尔类型
      if (left.type.kind === 'boolean' && right.type.kind === 'boolean') {
        return makeBoolean((left.rawValue as boolean) || (right.rawValue as boolean))
      }
      throw new Error(`Operator OR not supported for ${left.type.name} and ${right.type.name}`)
    }
    default:
      throw new Error(`Unknown operator: ${op}`)
  }
}

export function unaryOp(op: string, operand: PascalValue): PascalValue {
  const upper = op.toUpperCase()

  switch (upper) {
    case '+': {
      const value = operand.rawValue as number
      return { type: operand.type, rawValue: value }
    }
    case '-': {
      const value = operand.rawValue as number
      return { type: operand.type, rawValue: -value }
    }
    case 'NOT': {
      if (operand.type.kind === 'boolean') {
        return makeBoolean(!(operand.rawValue as boolean))
      }
      throw new Error(`Operator NOT not supported for ${operand.type.name}`)
    }
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

  // 整数到实数
  if (value.type.kind === 'integer' && targetType.kind === 'real') {
    return makeReal(value.rawValue as number)
  }

  // 字符到字符串
  if (value.type.kind === 'char' && targetType.kind === 'string') {
    return makeString(value.rawValue as string)
  }

  // 同类类型之间可以赋值
  if (value.type.kind === targetType.kind) {
    return value
  }

  throw new Error(`Cannot coerce ${value.type.name} to ${targetType.name}`)
}