import * as JsonCode from '@/middle/ir/json-code.ts'
import { TypeInfo, VariantPartInfo } from '@/middle/analysis/analysis-type.ts'
import { litBool, litChar, litInt, litNull, litReal, syscall, syscallKeys } from './helpers.ts'

export function defaultExpr(ti: TypeInfo): JsonCode.Expr {
  switch (ti.tag) {
    case 'integer':
    case 'enum':
      return litInt(0)
    case 'subrange':
      return litInt(ti.low ?? 0)
    case 'real':
      return litReal('0')
    case 'boolean':
      return litBool(false)
    case 'char':
      return litChar('\x00')
    case 'array':
    case 'record':
      return syscall(syscallKeys.memDefault, [typeDescLiteral(ti)])
    case 'set':
      return syscall(syscallKeys.setEmpty, [typeDescLiteral(ti)])
    case 'file':
      return syscall(syscallKeys.fileCreate, [typeDescLiteral(ti)])
    case 'pointer':
      return litNull()
    default:
      return litInt(0)
  }
}

export function typeDescLiteral(ti: TypeInfo): JsonCode.Literal {
  return { kind: 'literal', key: 'type', arg: JSON.stringify(serializeTypeInfo(ti)) }
}

export interface TypeDescriptor {
  tag: string

  low?: number
  high?: number

  dims?: Array<{ low: number; high: number }>

  elem?: TypeDescriptor
  fields?: Array<{ name: string; type: TypeDescriptor }>
  variant?: VariantPartDescriptor

  enumCount?: number
}

export interface VariantPartDescriptor {
  tagName?: string
  branches: VariantBranchDescriptor[]
}

export interface VariantBranchDescriptor {
  labels: number[]
  fields: Array<{ name: string; type: TypeDescriptor }>
  nested?: VariantPartDescriptor
}

export function serializeTypeInfo(ti: TypeInfo, expandPointer = true): TypeDescriptor {
  if (ti.tag === 'subrange') {
    return { tag: ti.baseTag ?? 'integer', low: ti.low, high: ti.high }
  }

  if (ti.tag === 'set') {
    return { tag: 'set', elem: ti.setBase ? serializeTypeInfo(ti.setBase, expandPointer) : undefined }
  }

  if (ti.tag === 'pointer') {
    return {
      tag: 'pointer',
      elem: expandPointer && ti.domainType ? serializeTypeInfo(ti.domainType, false) : undefined,
    }
  }
  return {
    tag: ti.tag,
    low: ti.low,
    high: ti.high,
    dims: ti.dims,
    elem: ti.elem ? serializeTypeInfo(ti.elem, expandPointer) : undefined,
    fields: ti.fields
      ? Array.from(ti.fields.entries()).map(([k, v]) => ({
        name: k,
        type: serializeTypeInfo(v, expandPointer),
      }))
      : undefined,
    variant: ti.variant ? serializeVariantPart(ti.variant, expandPointer) : undefined,
    enumCount: ti.enumCount,
  }
}

export function serializeVariantPart(
  vp: VariantPartInfo,
  expandPointer = true,
): VariantPartDescriptor {
  return {
    tagName: vp.tagName,
    branches: vp.branches.map((b) => ({
      labels: b.labels,
      fields: Array.from(b.fields.entries()).map(([k, v]) => ({
        name: k,
        type: serializeTypeInfo(v, expandPointer),
      })),
      nested: b.nested ? serializeVariantPart(b.nested, expandPointer) : undefined,
    })),
  }
}
