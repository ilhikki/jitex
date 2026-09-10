/*
 * IR rewrite pass：JsonCode ⇒ JsonCode
 *
 * 纯函数，无 mutable state。
 * 输入：(JsonCode.Function, SyscallMapping) → 输出：JsonCode.Function
 *
 * 在流水线中位于 lowering 之后、codegen 之前：
 *     src →[lex/parse]→ ast →[analysis]→ ast' →[lowering]→ ir
 *                                                     ↓
 *                                                [rewrite] → ir' →[codegen]→ target
 *
 * 遍历策略：post-order DFS（自底向上）。
 *   - 先递归进入子节点（args / statement exprs / children functions）
 *   - 再对当前 Syscall 节点调用 mapping
 *   - mapping 返回的 Expr 不再被递归处理（避免死循环、行为可预测；
 *     若需对返回值再加工，调用方自行再调一次 rewrite）
 *
 * 覆盖范围：
 *   - Function.children 递归处理（内层函数体里的 syscall 也会被重写）
 *   - Statement 中的所有 Expr：JumpIf.condition / Assign.value /
 *     Return.value / Eval.expr
 *   - Expr.syscall.args / Expr.call.args 递归
 *   - Expr.ref / Expr.literal 原样返回
 *
 * Assign.target 是 Ref，不含 Syscall，无需处理。
 * Label / Jmp / LongJump 不含 Expr，跳过。
 */

import type * as JsonCode from '@/middle/ir/json-code.ts'

/**
 * 单个 syscall 的重写函数。
 *
 * 框架保证调用时，传入的 Syscall 的 args 已经被递归处理过
 * （即 args 中的子 Syscall 已经被同一套规则替换完毕，是"叶子已就位"
 * 的视角）。
 *
 * 返回任意 Expr：可以是 Ref / Literal / Call / Syscall（含原样返回自身）。
 * 框架不再对返回值做递归处理 —— 调用方对返回的子树结构负全责。
 *
 * 注意：若返回一个新的 Syscall 且其 args 中含未被处理过的 Syscall，
 * 这些"未处理"的 Syscall 不会被本 pass 再次调用重写函数。
 */
export type SyscallRewriter = (sc: JsonCode.Syscall) => JsonCode.Expr

/**
 * 按 syscall key 分发的重写表。
 *
 * 查找规则（见 composeMapping）：
 *   - 存在 key 且 value 为函数 → 命中，调用该函数
 *   - 存在 key 但 value 为 undefined → 视为未命中，走 defaultRewriter
 *   - 不存在 key → 走 defaultRewriter
 */
export type SyscallRewriteTable = Record<string, SyscallRewriter | undefined>

/**
 * rewrite() 的入参类型：合成后的单一重写函数。
 *
 * 通常由 composeMapping(table, defaultRewriter) 生成，不直接由用户配置。
 * 用户配置侧使用 SyscallRewriteTable + defaultRewriter。
 */
export type SyscallMapping = SyscallRewriter

/**
 * 对 JsonCode.Function 做后序 DFS 重写。
 *
 * 递归遍历 children、body、statement、expr，对每个 Syscall 节点调用
 * mapping。返回新的 Function 对象（不可变；原对象保持不变）。
 */
export function rewrite(
  fn: JsonCode.Function,
  mapping: SyscallMapping,
): JsonCode.Function {
  return rewriteFunction(fn, mapping)
}

// ============================================================
// 内部递归实现
// ============================================================

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
      // 这三类语句不含 Expr，无需重写
      return stmt
    case 'jumpIf':
      return { ...stmt, condition: rewriteExpr(stmt.condition, mapping) }
    case 'assign':
      // target 是 Ref，不含 Syscall；只重写 value
      return { ...stmt, value: rewriteExpr(stmt.value, mapping) }
    case 'eval':
      return { ...stmt, expr: rewriteExpr(stmt.expr, mapping) }
    case 'return':
      // value 可选；过程调用风格的 Return 无 value
      return stmt.value === undefined ? stmt : { ...stmt, value: rewriteExpr(stmt.value, mapping) }
  }
}

function rewriteExpr(
  expr: JsonCode.Expr,
  mapping: SyscallMapping,
): JsonCode.Expr {
  switch (expr.kind) {
    case 'syscall': {
      // 1) 先递归 args —— 保证叶子 syscall 先被 mapping 处理
      const args = expr.args.map((a) => rewriteExpr(a, mapping))
      const rewritten: JsonCode.Syscall = { ...expr, args }
      // 2) 对本节点调 mapping；返回值不再递归处理
      return mapping(rewritten)
    }
    case 'call':
      // Call 本身不经过 mapping；但其 args 可能含 Syscall，需递归
      return { ...expr, args: expr.args.map((a) => rewriteExpr(a, mapping)) }
    case 'ref':
    case 'literal':
      // 叶子节点，不含 Syscall
      return expr
  }
}

// ============================================================
// 表合并与映射合成
// ============================================================

/**
 * 合并两张重写表。后者覆盖前者的同 key（含 undefined 覆盖）。
 *
 * 合并语义就是最简单的对象展开：{ ...base, ...override }。
 * 不做 undefined 过滤 —— override 中显式设为 undefined 的 key
 * 会覆盖 base 中的对应函数，效果等同于"禁用该 key 的重写"。
 */
export function mergeRewriteTables(
  base: SyscallRewriteTable,
  override: SyscallRewriteTable | undefined,
): SyscallRewriteTable {
  return { ...base, ...(override ?? {}) }
}

/**
 * 将重写表 + 默认回退函数合成为 rewrite() 可消费的单一 SyscallMapping。
 *
 * 查找规则：
 *   1. table[syscall.key] 存在且为函数 → 调用它
 *   2. 否则 → 调用 defaultRewriter
 *
 * defaultRewriter 为 undefined 时使用 id 函数（原样返回 syscall）。
 */
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
