import type * as JsonCode from '@/middle/ir/json-code.ts'

export type SyscallRewriter = (sc: JsonCode.Syscall) => JsonCode.Expr

export type SyscallRewriteTable = Record<string, SyscallRewriter | undefined>

export type SyscallMapping = SyscallRewriter

export function rewrite(
  fn: JsonCode.Function,
  mapping: SyscallMapping,
): JsonCode.Function {
  return rewriteFunction(fn, mapping)
}

function rewriteFunction(
  fn: JsonCode.Function,
  mapping: SyscallMapping,
): JsonCode.Function {
  return {
    ...fn,
    children: fn.children.map((c) => rewriteFunction(c, mapping)),
    body: fn.body.map((stmt) => rewriteStatement(stmt, mapping)),
  }
}

function rewriteStatement(
  stmt: JsonCode.Statement,
  mapping: SyscallMapping,
): JsonCode.Statement {
  switch (stmt.kind) {
    case 'label':
    case 'jump':
    case 'longJump':
      return stmt
    case 'jumpIf':
      return { ...stmt, condition: rewriteExpr(stmt.condition, mapping) }
    case 'eval':
      return { ...stmt, expr: rewriteExpr(stmt.expr, mapping) }
    case 'return':
      return stmt.value === undefined ? stmt : { ...stmt, value: rewriteExpr(stmt.value, mapping) }
  }
}

function rewriteExpr(
  expr: JsonCode.Expr,
  mapping: SyscallMapping,
): JsonCode.Expr {
  switch (expr.kind) {
    case 'syscall': {
      const rewritten: JsonCode.Syscall = { ...expr, args: expr.args.map((a) => rewriteExpr(a, mapping)) }
      return mapping(rewritten)
    }
    case 'call':
      return { ...expr, args: expr.args.map((a) => rewriteExpr(a, mapping)) }
    case 'ref':
    case 'literal':
      return expr
  }
}

export function mergeRewriteTables(
  base: SyscallRewriteTable,
  override: SyscallRewriteTable | undefined,
): SyscallRewriteTable {
  return { ...base, ...(override ?? {}) }
}

export function composeMapping(
  table: SyscallRewriteTable,
  defaultRewriter?: SyscallRewriter,
): SyscallMapping {
  const fallback: SyscallRewriter = defaultRewriter ?? ((sc) => sc)
  return (sc) => {
    const rw = table[sc.key]
    return rw ? rw(sc) : fallback(sc)
  }
}
