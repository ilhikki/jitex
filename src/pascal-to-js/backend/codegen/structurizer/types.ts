import type * as JsonCode from '@/middle/ir/json-code.ts'

export type SNode =
  | { readonly kind: 'stmt'; readonly code: string }
  | {
    readonly kind: 'if'
    readonly cond: string
    readonly then: readonly SNode[]
    readonly else: readonly SNode[]
  }
  | { readonly kind: 'loop'; readonly label: string; readonly body: readonly SNode[] }
  | { readonly kind: 'guard'; readonly label: string; readonly body: readonly SNode[] }
  | { readonly kind: 'break'; readonly label: string | undefined }
  | { readonly kind: 'continue'; readonly label: string | undefined }

export type UnstructuredReason = 'long-jump-target' | 'irreducible' | 'unrepresentable'

export type StructurizeResult =
  | { readonly kind: 'structured'; readonly body: readonly SNode[] }
  | { readonly kind: 'unstructured'; readonly reason: UnstructuredReason }

export interface StructurizeContext {
  readonly longJumpTargets: ReadonlySet<number>
  readonly compileExpr: (expr: JsonCode.Expr) => string
  readonly compileStatement: (stmt: JsonCode.Statement) => string
}

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
