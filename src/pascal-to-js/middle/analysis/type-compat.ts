import { TypeInfo } from './analysis-type.ts'

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

export function isStringType(t: TypeInfo): boolean {
  if (t.tag !== 'array' || t.elem?.tag !== 'char') {
    return false
  }
  const dims = t.dims
  if (!dims || dims.length !== 1) {
    return false
  }
  return dims[0].low === 1 && dims[0].high > 1
}

function stringLength(t: TypeInfo): number {
  return t.dims?.[0].high ?? 0
}

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

export function isSameType(a: TypeInfo, b: TypeInfo): boolean {
  if (isStringType(a) && isStringType(b)) {
    return stringLength(a) === stringLength(b)
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

  return a === b
}

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

  if (a.tag === 'subrange' && ia.low >= ib.low && ia.high <= ib.high) {
    return true
  }
  if (b.tag === 'subrange' && ib.low >= ia.low && ib.high <= ia.high) {
    return true
  }
  return false
}

export function isCompatibleSet(a: TypeInfo, b: TypeInfo): boolean {
  if (a.tag !== 'set' || b.tag !== 'set') {
    return false
  }

  if (!a.setBase || !b.setBase) {
    return true
  }
  return isCompatibleOrdinal(a.setBase, b.setBase)
}

export function isAssignCompatible(target: TypeInfo, value: TypeInfo): boolean {
  if (isSameType(target, value)) {
    return true
  }

  if (target.tag === 'real' && value.tag === 'integer') {
    return true
  }

  if (target.tag === 'pointer' && value.tag === 'nil') {
    return true
  }

  if (isCompatibleOrdinal(target, value)) {
    return true
  }

  if (isCompatibleSet(target, value)) {
    return true
  }

  return false
}
