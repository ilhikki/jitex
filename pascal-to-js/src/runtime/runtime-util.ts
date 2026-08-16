// ============================================================
// 辅助函数：real 格式化

import { TypeDescriptor } from '@/runtime/runtime-type.ts'

// ============================================================
export function formatReal(n: number): string {
  if (Number.isInteger(n)) {
    return `${n}.00000000000000E+000`
  }
  const s = n.toExponential(14)
  const eIdx = s.indexOf('e')
  if (eIdx < 0) return s
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
  if (!width || text.length >= width) return text
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
  if (v === null || v === undefined) return v
  if (typeof v !== 'object') return v
  if (v instanceof Set) return new Set(v)
  if (v instanceof Uint8Array) return new Uint8Array(v)
  if (Array.isArray(v)) return v.map(deepCopyValue)
  // PascalFile：文件是引用语义，共享引用
  const obj = v as Record<string, unknown>
  if (typeof obj.url === 'string' && typeof obj.offset === 'number') return v
  // record：递归深拷贝每个字段
  const copy: Record<string, unknown> = {}
  for (const k of Object.keys(obj)) {
    copy[k] = deepCopyValue(obj[k])
  }
  return copy
}

// ============================================================
// 辅助函数：默认值构造
// ============================================================

export function createDefaultArray(typeDesc: TypeDescriptor): unknown[] {
  // typeDesc = {tag:'array', dims:[{low,high},...], elem:{...}}
  // 支持两种多维形式：
  //   1. 扁平多维：array[1..2,1..2] of integer → dims 有多个，elem 是标量
  //   2. 嵌套多维：array[1..2] of array[1..2] of integer → dims 单个，elem 是 array
  if (!typeDesc.dims || typeDesc.dims.length === 0) return []
  const dim = typeDesc.dims[0]
  const arr: unknown[] = []
  if (typeDesc.dims.length > 1) {
    // 扁平多维：剩余维度递归
    const innerDesc: TypeDescriptor = {
      tag: 'array',
      dims: typeDesc.dims.slice(1),
      elem: typeDesc.elem,
    }
    for (let i = dim.low; i <= dim.high; i++) {
      arr[i] = createDefaultArray(innerDesc)
    }
  } else if (typeDesc.elem && typeDesc.elem.tag === 'array') {
    // 嵌套多维
    for (let i = dim.low; i <= dim.high; i++) {
      arr[i] = createDefaultArray(typeDesc.elem)
    }
  } else {
    for (let i = dim.low; i <= dim.high; i++) {
      arr[i] = createDefaultValue(typeDesc.elem ?? { tag: 'i64' })
    }
  }
  return arr
}

export function createDefaultRec(typeDesc: TypeDescriptor): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  if (typeDesc.fields) {
    for (const f of typeDesc.fields) {
      obj[f.name] = createDefaultValue(f.type)
    }
  }
  return obj
}

function createDefaultValue(ti: TypeDescriptor): unknown {
  switch (ti.tag) {
    case 'i64':
    case 'enum':
      return 0
    case 'subrange':
      return ti.low ?? 0
    case 'f64':
      return 0.0
    case 'bool':
      return false
    case 'char':
      return '\x00'
    case 'str':
      return ''
    case 'set':
      return new Set<number>()
    case 'array':
      if (ti.dims && ti.dims.length > 0) {
        return createDefaultArray(ti)
      }
      return []
    case 'rec':
      return createDefaultRec(ti)
    case 'file':
      return { url: '', offset: 0 }
    default:
      return 0
  }
}
