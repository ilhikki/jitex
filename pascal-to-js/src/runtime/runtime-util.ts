// ============================================================
// 辅助函数：real 格式化

import type { DimsLink, PascalArray, PascalRecord, TypeDescriptor } from '@/runtime/runtime-type.ts'

// ============================================================
export function formatReal(n: number): string {
  if (Number.isInteger(n)) {
    return `${n}.00000000000000E+000`
  }
  const s = n.toExponential(14)
  const eIdx = s.indexOf('e')
  if (eIdx < 0) {
    return s
  }
  const mantissa = s.slice(0, eIdx)
  const exp = s.slice(eIdx + 1)
  const sign = exp[0]
  const digits = exp.slice(1)
  const padded = digits.padStart(3, '0')
  return `${mantissa}E${sign}${padded}`
}

/**
 * 字段格式化：右对齐，左填充空格到 width。
 * Pascal 写参数语义：x:width 表示最小字段宽度，右对齐。
 */
export function formatField(text: string, width: number): string {
  if (!width || text.length >= width) {
    return text
  }
  return ' '.repeat(width - text.length) + text
}

/**
 * 深拷贝 Pascal 值（record 赋值语义）。
 * Pascal 中 record/array 赋值是值拷贝，但 JS 对象赋值是引用。
 * 此函数用于 `rec.copy` syscall，确保 record 赋值时产生独立副本。
 *
 * 规则：
 *   - 标量（number/string/boolean）：直接返回
 *   - Set：返回新 Set（元素是标量，无需递归）
 *   - Uint8Array：返回新 Uint8Array
 *   - Array：递归深拷贝每个元素
 *   - PascalFile（含 url 属性）：共享引用（文件是引用语义）
 *   - record（plain object）：递归深拷贝每个字段
 */
export function deepCopyValue(v: unknown): unknown {
  if (v === null || v === undefined) {
    return v
  }
  if (typeof v !== 'object') {
    return v
  }
  if (v instanceof Set) {
    return new Set(v)
  }
  if (v instanceof Uint8Array) {
    return new Uint8Array(v)
  }
  if (Array.isArray(v)) {
    return v.map(deepCopyValue)
  }
  // PascalFile：文件是引用语义，共享引用
  const obj = v as Record<string, unknown>
  if (typeof obj.url === 'string' && typeof obj.offset === 'number') {
    return v
  }
  // record：递归深拷贝每个字段
  const copy: Record<string, unknown> = {}
  for (const k of Object.keys(obj)) {
    copy[k] = deepCopyValue(obj[k])
  }
  return copy
}

export function getPascalStringValue(str: PascalArray) {
  return str.value.array.join('')
}

function dimsToLink(dims: Array<{ low: number; high: number }> | undefined): DimsLink {
  if (dims === undefined || dims.length === 0) {
    return {
      low: 0,
      high: Number.MAX_VALUE,
      deep: 0,
    }
  }
  let current: DimsLink | undefined = undefined
  for (let i = dims.length - 1; i >= 0; i--) {
    const d = dims[i]
    const deep: number = current ? current.deep + 1 : 0
    current = {
      ...d,
      next: current,
      deep: deep,
    }
  }
  return current!
}
function flattenArrayType(
  type: TypeDescriptor,
): { dimsList: Array<{ low: number; high: number }>; elementType: TypeDescriptor } {
  const dimsList: Array<{ low: number; high: number }> = []
  let current = type
  while (current.tag === 'array') {
    if (current.dims) {
      dimsList.push(...current.dims)
    }
    current = current.elem ?? { tag: 'void' }
  }
  return { dimsList, elementType: current }
}

export function createDefaultArray(typeDesc: TypeDescriptor): PascalArray {
  const { dimsList, elementType } = flattenArrayType(typeDesc)
  return {
    kind: 'array',
    value: {
      array: [],
      dims: dimsToLink(dimsList),
      elementType: elementType,
    },
  }
}

function createDefaultElement(type: TypeDescriptor, require: boolean) {
  switch (type.tag) {
    case 'rec':
      return createDefaultRec(type)
    case 'array':
      return createDefaultArray(type)
    default:
      if (require) {
        throw new Error(`element of type ${type.tag} is not defined`)
      } else {
        return undefined
      }
  }
}

export function getArrayByIndex(array: PascalArray, indices: number[]): PascalArray {
  let current = array
  for (let i = 0; i < indices.length - 1; i++) {
    const index = indices[i]
    const actualIndex = index - (current.value.dims?.low ?? 0)
    const arr = current.value.array
    const element = arr[actualIndex]
    if (element === undefined && current.value.dims?.next) {
      // 创建下一维数组，继承父级的 elementType
      const newArray: PascalArray = {
        kind: 'array',
        value: {
          array: [],
          dims: current.value.dims.next,
          elementType: current.value.elementType, // 最终类型不变
        },
      }
      arr[actualIndex] = newArray
      current = newArray
    } else {
      current = element as PascalArray
    }
  }
  return current
}

export function getArrayElement(array: PascalArray, indices: number[]) {
  const pascalArray = getArrayByIndex(array, indices)
  const lastIndex = indices.at(-1)! - (pascalArray.value.dims?.low ?? 0)
  const element = pascalArray.value.array[lastIndex]
  if (element === undefined) {
    if (pascalArray.value.elementType) {
      const defaultElement = createDefaultElement(pascalArray.value.elementType, true)
      pascalArray.value.array[lastIndex] = defaultElement
      return defaultElement
    } else {
      throw new Error(`array is not init at ${lastIndex}(${indices.at(-1)})`)
    }
  }
  return element
}

export function setArrayElement(array: PascalArray, indices: number[], value: unknown): void {
  const pascalArray = getArrayByIndex(array, indices)
  const lastIndex = indices.at(-1)! - (pascalArray.value.dims?.low ?? 0)
  const jsArray: Array<unknown> = pascalArray.value.array
  jsArray[lastIndex] = value
}

export function createDefaultRec(typeDesc: TypeDescriptor): PascalRecord {
  const result: PascalRecord = {
    kind: 'record',
    value: {},
  }
  for (const { name, type } of typeDesc.fields ?? []) {
    result.value[name] = createDefaultElement(type, false)
  }
  return result
}

export function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}
