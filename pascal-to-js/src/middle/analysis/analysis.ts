/*
 * 分析阶段协调入口。
 *
 * 顺序调用 3 个 pass，拼接 result → Analysis。
 * re-export analysis-type.ts 的所有对外类型。
 */

import { ProgramNode } from '@/frontend/node.ts'
import {
  Analysis,
  BUILTIN_FUNCTIONS,
  BUILTIN_PROCEDURES,
  evalConstInt as evalConstIntFn,
  ExtraCallable,
} from './analysis-type.ts'
import { AnalysisContext, DeclarationResult, StatementResult } from './stage-types.ts'
import { runDeclarationPass } from './passes/declaration-pass.ts'
import { runStatementPass } from './passes/statement-pass.ts'
import { runCheckPass } from './passes/check-pass.ts'

export function analyzeProgram(
  program: ProgramNode,
  extensions?: string[],
  extraCallables?: Record<string, ExtraCallable>,
): Analysis {
  const merged = mergeExtraCallables(extraCallables)
  const ctx = new AnalysisContext(extensions, merged)
  const declResult = runDeclarationPass(program, ctx)
  const stmtResult = runStatementPass(program, ctx, declResult)
  runCheckPass(declResult, stmtResult)
  return buildAnalysis(declResult, stmtResult, ctx)
}

function buildAnalysis(
  decl: DeclarationResult,
  stmt: StatementResult,
  ctx: AnalysisContext,
): Analysis {
  return {
    nextId: () => decl.nextId++,
    allocTempLocal: (funcId, typeInfo) => {
      const id = decl.nextId++
      const info = decl.funcInfos.get(funcId)
      if (info) {
        info.locals.push({
          kind: 'var',
          varId: id,
          typeInfo,
          isVarParam: false,
        })
      }
      return id
    },
    symbolOf: (node) => stmt.symbolCache.get(node),
    labelInfo: (funcId, labelNum) => findLabel(decl, funcId, labelNum),
    labelUseFuncOf: (labelId) => stmt.labelUseFunc.get(labelId),
    funcOfBlock: (block) => {
      const r = decl.blockFunc.get(block)
      if (r === undefined) {
        throw new Error('funcOfBlock: not found')
      }
      return r
    },
    funcOfDecl: (d) => {
      const r = decl.declFunc.get(d)
      if (r === undefined) {
        throw new Error('funcOfDecl: not found')
      }
      return r
    },
    funcInfo: (id) => {
      const r = decl.funcInfos.get(id)
      if (!r) {
        throw new Error('funcInfo: not found')
      }
      return r
    },
    withTempsOf: (node) => stmt.withTemps.get(node) ?? [],
    typeOf: (node) => stmt.exprType.get(node) ?? { tag: 'unknown' },
    typeTagOfTypeNode: (node) => decl.typeNodeInfo.get(node) ?? { tag: 'unknown' },
    evalConstInt: (node) => evalConstIntFn(node, (name) => decl.globalBindings.get(name.toLowerCase())),
    globalSymbolOf: (name) => decl.globalBindings.get(name.toLowerCase()),
    debugNames: () => new Map(decl.idNames),
    extraCallables: () => ctx.extraCallables,
  }
}

function findLabel(
  decl: DeclarationResult,
  funcId: number,
  labelVal: number,
): { labelId: number; funcId: number } | undefined {
  let fid: number | undefined = funcId
  while (fid !== undefined) {
    const funcLabels = decl.labels.get(fid)
    if (funcLabels) {
      const info = funcLabels.get(labelVal)
      if (info) {
        return info
      }
    }
    const functionInfo = decl.funcInfos.get(fid)
    fid = functionInfo ? functionInfo.parentFuncId : undefined
  }
  return undefined
}

function mergeExtraCallables(
  extra: Record<string, ExtraCallable> | undefined,
): Map<string, ExtraCallable> | undefined {
  if (!extra) {
    return undefined
  }
  const map = new Map<string, ExtraCallable>()
  for (const [rawName, entry] of Object.entries(extra)) {
    const name = rawName.toLowerCase()
    if (map.has(name)) {
      throw new Error(`Duplicate extra callable '${rawName}' (case-insensitive collision)`)
    }
    const native = entry.kind === 'procedure' ? BUILTIN_PROCEDURES.has(name) : BUILTIN_FUNCTIONS.has(name)
    if (native && !entry.allowOverrideNative) {
      throw new Error(
        `Cannot override native ${entry.kind} '${rawName}'; set allowOverrideNative=true to override`,
      )
    }
    map.set(name, entry)
  }
  return map.size > 0 ? map : undefined
}
