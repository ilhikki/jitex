import type * as JsonCode from '@/middle/ir/json-code.ts'
import { buildCfg } from './cfg.ts'
import { simplify } from './simplify.ts'
import { analyze } from './analysis.ts'
import { normalize } from './normalize.ts'
import { plan } from './plan.ts'
import { lower } from './lower.ts'
import { tidyTree } from './tidy.ts'
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

function hasControlFlow(body: readonly JsonCode.Statement[]): boolean {
  return body.some((stmt) => stmt.kind === 'jump' || stmt.kind === 'jumpIf')
}

function linearBody(body: readonly JsonCode.Statement[], ctx: StructurizeContext): SNode[] {
  return body
    .filter((stmt) => stmt.kind !== 'label')
    .map((stmt): SNode => ({ kind: 'stmt', code: ctx.compileStatement(stmt) }))
}

export function structurize(fn: JsonCode.Function, ctx: StructurizeContext): StructurizeResult {
  if (ctx.longJumpTargets.has(fn.id)) {
    return { kind: 'unstructured', reason: 'long-jump-target' }
  }
  if (!hasControlFlow(fn.body)) {
    return { kind: 'structured', body: linearBody(fn.body, ctx) }
  }

  const cfg = buildCfg(fn, ctx)

  const normalized = normalize(simplify(cfg))
  if (normalized.kind === 'irreducible') {
    return { kind: 'unstructured', reason: 'irreducible' }
  }

  const analysis = analyze(normalized.cfg)
  const planned = plan(normalized.cfg, analysis)
  if (planned.kind === 'unrepresentable') {
    return { kind: 'unstructured', reason: 'unrepresentable' }
  }

  return { kind: 'structured', body: tidyTree(lower(normalized.cfg, planned.plan)) }
}
