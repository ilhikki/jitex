/*
 * IL lowering 类型映射。
 *
 * Pascal TypeInfo → syscall key 后缀、默认值、类型描述符序列化。
 * 纯函数族，无 mutable state。
 */

import * as JsonCode from '@/middle/ir/json-code.ts'
import { TypeInfo, VariantPartInfo } from '@/middle/analysis/analysis-type.ts'
import { litBool, litChar, litInt, litNull, litReal, syscall, syscallKeys } from './helpers.ts'

// ============================================================
// 类型 → syscall key 后缀
// ============================================================

export function typeSuffix(ti: TypeInfo): string {
  switch (ti.tag) {
    case 'i32':
    case 'enum':
      return 'i32'
    case 'subrange':
      // 子界类型按 baseTag 选择 io.write syscall
      // （boolean 子界输出 TRUE/FALSE，char 子界输出字符）
      if (ti.baseTag === 'bool') {
        return 'bool'
      }
      if (ti.baseTag === 'char') {
        return 'char'
      }
      return 'i32'
    case 'f64':
      return 'f64'
    case 'bool':
      return 'bool'
    case 'char':
      return 'char'
    case 'array': {
      // ISO 7185：packed array[1..n] of char 作为 write/read 参数时按字符串处理。
      // 仅一维且元素为 char 的数组走 char.array 路由。
      if (ti.dims?.length === 1 && ti.elem?.tag === 'char') {
        return 'char.array'
      }
      return 'i32'
    }
    case 'set':
      return 'set'
    default:
      return 'i32'
  }
}

/**
 * 判断文件类型是否为 file of record（elem.tag === 'rec'）。
 * 用于在 reset/rewrite/get/put/eof/f^ 等操作中分派到 file.rec.* syscall。
 * ISO 7185 6.4.3.5: file-type = 'file' 'of' component-type
 */
export function isRecordFile(fileType: TypeInfo): boolean {
  const elemTi = fileType.elem ?? undefined
  return elemTi !== undefined && elemTi.tag === 'rec'
}

// ============================================================
// 变量默认值
// ============================================================

export function defaultExpr(ti: TypeInfo): JsonCode.Expr {
  switch (ti.tag) {
    case 'i32':
    case 'enum':
      return litInt(0)
    case 'subrange':
      // subrange 默认值为 lower bound（ISO 7185: 子界变量未初始化时取下界）
      return litInt(ti.low ?? 0)
    case 'f64':
      return litReal('0')
    case 'bool':
      return litBool(false)
    case 'char':
      return litChar('\x00')
    case 'array':
      return syscall(syscallKeys.memDefaultArray, [typeDescLiteral(ti)])
    case 'rec':
      return syscall(syscallKeys.memDefaultRec, [typeDescLiteral(ti)])
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

// ============================================================
// 类型描述符序列化（嵌入 JsonCode literal，由 runtime.ts 消费）
// ============================================================

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
  /** enum：序数个数（pred/succ 边界检查用） */
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

export function serializeTypeInfo(ti: TypeInfo): TypeDescriptor {
  return {
    tag: ti.tag,
    low: ti.low,
    high: ti.high,
    dims: ti.dims,
    elem: ti.elem ? serializeTypeInfo(ti.elem) : undefined,
    fields: ti.fields
      ? Array.from(ti.fields.entries()).map(([k, v]) => ({ name: k, type: serializeTypeInfo(v) }))
      : undefined,
    variant: ti.variant ? serializeVariantPart(ti.variant) : undefined,
    enumCount: ti.enumCount,
  }
}

export function serializeVariantPart(vp: VariantPartInfo): VariantPartDescriptor {
  return {
    tagName: vp.tagName,
    branches: vp.branches.map((b) => ({
      labels: b.labels,
      fields: Array.from(b.fields.entries()).map(([k, v]) => ({
        name: k,
        type: serializeTypeInfo(v),
      })),
      nested: b.nested ? serializeVariantPart(b.nested) : undefined,
    })),
  }
}
