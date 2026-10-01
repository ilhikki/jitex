import type { TypeDescriptor, VariantPartDescriptor } from '@/middle/lowering/type.ts'

export type ScalarKind = 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'float32'

const SCALAR_WIDTH: Record<ScalarKind, number> = {
  int8: 1,
  uint8: 1,
  int16: 2,
  uint16: 2,
  int32: 4,
  float32: 4,
}

const TAG_SIZE = 4

function tagSize(vp: VariantPartDescriptor | undefined): number {
  return vp?.tagName !== undefined ? TAG_SIZE : 0
}

export function scalarWidth(kind: ScalarKind): number {
  return SCALAR_WIDTH[kind]
}

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

export function arrayCount(td: TypeDescriptor): number {
  return (td.dims ?? []).reduce((n, d) => n * (d.high - d.low + 1), 1)
}

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

export function scalarKindOf(td: TypeDescriptor): ScalarKind {
  switch (td.tag) {
    case 'integer':
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

export interface FieldSlot {
  offset: number
  size: number
  type: TypeDescriptor

  isTag: boolean
}

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

export interface ArraySlot {
  elemType: TypeDescriptor

  elemSize: number

  lows: number[]

  strides: number[]

  dims: { low: number; high: number }[]
}

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

export function remainingArrayType(
  arr: ArraySlot,
  indexCount: number,
): TypeDescriptor | undefined {
  if (indexCount >= arr.dims.length) {
    return undefined
  }
  return { tag: 'array', dims: arr.dims.slice(indexCount), elem: arr.elemType }
}
