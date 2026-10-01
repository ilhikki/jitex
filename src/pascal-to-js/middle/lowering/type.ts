/*
 * IL lowering 类型映射。
 *
 * Pascal TypeInfo → 类型描述符序列化、默认值。
 * 纯函数族，无 mutable state。
 *
 * 序列化时把 analysis 侧的复合形态展平（`tag` 即类型本身，`elem` 是唯一泛型参数）：
 *   subrange → { tag: <baseTag>, low, high }
 *   enum     → 保留 tag='enum' + enumCount
 *   set      → { tag: 'set', elem: <setBase> }
 */

import * as JsonCode from '@/middle/ir/json-code.ts'
import { TypeInfo, VariantPartInfo } from '@/middle/analysis/analysis-type.ts'
import { litBool, litChar, litInt, litNull, litReal, syscall, syscallKeys } from './helpers.ts'

// 变量默认值

export function defaultExpr(ti: TypeInfo): JsonCode.Expr {
  switch (ti.tag) {
    case 'integer':
    case 'enum':
      return litInt(0)
    case 'subrange':
      // subrange 默认值为 lower bound（ISO 7185: 子界变量未初始化时取下界）
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
      // ISO 7185 6.4.4: 指针变量默认为 nil-value
      return litNull()
    default:
      return litInt(0)
  }
}

// 类型描述符序列化（嵌入 JsonCode literal，由 rewrite 消费）

export function typeDescLiteral(ti: TypeInfo): JsonCode.Literal {
  return { kind: 'literal', key: 'type', arg: JSON.stringify(serializeTypeInfo(ti)) }
}

export interface TypeDescriptor {
  /** 类型本质：integer / real / boolean / char / enum / array / record / set / file / pointer */
  tag: string
  /** 序数类型的下界（与 high 同时存在即为子界） */
  low?: number
  high?: number
  /** array 各维范围 */
  dims?: Array<{ low: number; high: number }>
  /** 唯一泛型参数：array 的元素 / set 的基类型 */
  elem?: TypeDescriptor
  fields?: Array<{ name: string; type: TypeDescriptor }>
  variant?: VariantPartDescriptor
  /** enum 的元素个数 */
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
  // subrange 展平：tag 即基类型，low/high 表范围
  if (ti.tag === 'subrange') {
    return { tag: ti.baseTag ?? 'integer', low: ti.low, high: ti.high }
  }
  // set：基类型放进 elem（唯一泛型参数）
  if (ti.tag === 'set') {
    return { tag: 'set', elem: ti.setBase ? serializeTypeInfo(ti.setBase, expandPointer) : undefined }
  }
  // pointer：展开一层领域类型（new(p) 需要其布局）。内层不再展开 pointer --
  // 否则递归类型（record 里的 pointer 指回自身）会形成无限递归。
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
