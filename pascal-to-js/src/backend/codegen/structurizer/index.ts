/*
 * structurizer 入口。
 *
 * 流水线：cfg → simplify → normalize → analyze → plan → lower → print
 * 每一级都是纯函数，输入输出都是数据结构；唯一的副作用在最后一级（产出文本）。
 */

import type * as JsonCode from '@/middle/ir/json-code.ts'
import { buildCfg } from './cfg.ts'
import { simplify } from './simplify.ts'
import { analyze } from './analysis.ts'
import { normalize } from './normalize.ts'
import { plan } from './plan.ts'
import { lower } from './lower.ts'
import { emitSNode } from './print.ts'
import type { SNode, StructurizeContext, StructurizeResult } from './types.ts'

export { emitSNode }
export {
  type SNode,
  type StructurizeContext,
  StructurizerError,
  type StructurizeResult,
  type UnstructuredReason,
} from './types.ts'

/** 有跳转才需要建图；纯线性代码的 label 不产生运行时效果 */
function hasControlFlow(body: readonly JsonCode.Statement[]): boolean {
  return body.some((stmt) => stmt.kind === 'jump' || stmt.kind === 'jumpIf')
}

function linearBody(body: readonly JsonCode.Statement[], ctx: StructurizeContext): SNode[] {
  return body
    .filter((stmt) => stmt.kind !== 'label')
    .map((stmt): SNode => ({ kind: 'stmt', code: ctx.compileStatement(stmt) }))
}

export function structurize(fn: JsonCode.Function, ctx: StructurizeContext): StructurizeResult {
  // 跨函数跳转只能靠异常机制，结构化表达不了
  if (ctx.longJumpTargets.has(fn.id)) {
    return { kind: 'unstructured', reason: 'long-jump-target' }
  }
  if (!hasControlFlow(fn.body)) {
    return { kind: 'structured', body: linearBody(fn.body, ctx) }
  }

  const cfg = buildCfg(fn, ctx)

  // 先化简再归一化：穿线让图变小，不可约分量的复制预算也更省
  const normalized = normalize(simplify(cfg))
  if (normalized.kind === 'irreducible') {
    return { kind: 'unstructured', reason: 'irreducible' }
  }

  const analysis = analyze(normalized.cfg)
  const planned = plan(normalized.cfg, analysis)
  if (planned.kind === 'unrepresentable') {
    return { kind: 'unstructured', reason: 'unrepresentable' }
  }

  return { kind: 'structured', body: lower(normalized.cfg, planned.plan) }
}
