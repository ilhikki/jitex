/*
 * structurizer 的契约层：只放"跨子系统共享"的类型，不放任何逻辑。
 *
 * 数据流：
 *   JsonCode.Statement[]  ──cfg──▶  Cfg  ──simplify──▶  Cfg
 *     ──normalize──▶  Cfg  ──analysis──▶  Analysis
 *     ──plan──▶  Plan  ──lower──▶  SNode[]  ──tidy──▶  SNode[]  ──print──▶  string
 */

import type * as JsonCode from '@/middle/ir/json-code.ts'

/**
 * 发射用的结构化语句。这是整个子系统唯一的输出语言，
 * 每个分支都对应目标语言（JS）里一种可打印的语句形态。
 */
export type SNode =
  /** 一条直译过来的语句（assign / eval / return / longJump 都已渲染成文本） */
  | { readonly kind: 'stmt'; readonly code: string }
  | {
    readonly kind: 'if'
    readonly cond: string
    readonly then: readonly SNode[]
    readonly else: readonly SNode[]
  }
  /** `L: while (true) { ... }`——唯一能承接 continue 的形态 */
  | { readonly kind: 'loop'; readonly label: string; readonly body: readonly SNode[] }
  /** `L: { ... }`——只能承接 break 的纯包裹 */
  | { readonly kind: 'guard'; readonly label: string; readonly body: readonly SNode[] }
  | { readonly kind: 'break'; readonly label: string | undefined }
  | { readonly kind: 'continue'; readonly label: string | undefined }

/**
 * 无法结构化的原因。刻意保持极窄：
 *   - 跨函数跳转只能靠异常机制，结构化表达不了
 *   - 不可约分量在复制预算内修不好
 *   - 可约但仍无法用 while/if/break/continue 表达（极少数）
 */
export type UnstructuredReason = 'long-jump-target' | 'irreducible' | 'unrepresentable'

export type StructurizeResult =
  | { readonly kind: 'structured'; readonly body: readonly SNode[] }
  | { readonly kind: 'unstructured'; readonly reason: UnstructuredReason }

/** 由编译器注入：表达式/单条语句怎么渲染成 JS 文本 */
export interface StructurizeContext {
  /** 被任意后代函数的 longJump 命中的 functionId 集合 */
  readonly longJumpTargets: ReadonlySet<number>
  readonly compileExpr: (expr: JsonCode.Expr) => string
  readonly compileStatement: (stmt: JsonCode.Statement) => string
}

/** IR 自身契约被违反——属于上游 bug，直接失败而不是降级 */
export type StructurizerErrorCode =
  | 'fall-off-end'
  | 'unknown-label'
  | 'duplicate-label'
  | 'reserved-label-id'

export class StructurizerError extends Error {
  constructor(
    readonly code: StructurizerErrorCode,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`)
    this.name = 'StructurizerError'
  }
}
