import * as JsonCode from '@/middle/ir/json-code.ts'
import { Analysis, VarSymbol } from '@/middle/analysis/analysis-type.ts'
import { BlockNode, IdentifierNode, ProgramNode } from '@/frontend/node.ts'
import { assignStmt, evalStmt, litField, ref, returnStmt, syscall, syscallKeys } from './helpers.ts'
import { defaultExpr, typeDescLiteral } from './type.ts'
import { loweringStmt } from './statements.ts'

export function loweringProgram(program: ProgramNode, a: Analysis): JsonCode.Function {
  return loweringBlock(program.block, a, program.parameters)
}

function loweringBlock(
  block: BlockNode,
  analysis: Analysis,
  programParams?: IdentifierNode[],
): JsonCode.Function {
  const funcId = analysis.funcOfBlock(block)
  const info = analysis.funcInfo(funcId)

  const params = info.params.map((p) => p.varId)

  const children: JsonCode.Function[] = []
  for (const p of block.procedureDeclarations) {
    if (p.block) {
      children.push(loweringBlock(p.block, analysis))
    } else {
      children.push({
        id: analysis.funcOfDecl(p),
        params: analysis.funcInfo(analysis.funcOfDecl(p)).params.map((x) => x.varId),
        locals: [],
        children: [],
        body: [returnStmt()],
      })
    }
  }
  for (const f of block.functionDeclarations) {
    if (f.block) {
      children.push(loweringBlock(f.block, analysis))
    } else {
      children.push({
        id: analysis.funcOfDecl(f),
        params: analysis.funcInfo(analysis.funcOfDecl(f)).params.map((x) => x.varId),
        locals: [],
        children: [],
        body: [returnStmt()],
      })
    }
  }

  const statements: JsonCode.Statement[] = []

  if (info.kind === 'program' && programParams && programParams.length > 0) {
    for (const p of programParams) {
      const sym = analysis.globalSymbolOf(p.name)
      if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
        const varSym = sym as VarSymbol
        statements.push(
          evalStmt(
            syscall(syscallKeys.programFileUrl, [
              ref(varSym.varId),
              litField(p.name),
              typeDescLiteral(varSym.typeInfo),
            ]),
          ),
        )
      }
    }
  }

  for (const stmt of loweringStmt(block.compound, analysis, funcId, [])) {
    statements.push(stmt)
  }

  if (info.retval) {
    statements.push(returnStmt(ref(info.retval.varId)))
  } else {
    statements.push(returnStmt())
  }

  const locals = info.locals.map((l) => l.varId)
  if (info.retval) {
    locals.push(info.retval.varId)
  }

  const body: JsonCode.Statement[] = []

  if (analysis.debug()) {
    const debugName = analysis.debugNames().get(info.funcId) ?? ''
    body.push(evalStmt(syscall(syscallKeys.hookFunctionEnter, [litField(info.funcId.toString()), litField(debugName)])))
  }
  for (const local of info.locals) {
    body.push(assignStmt(ref(local.varId), defaultExpr(local.typeInfo)))
  }
  if (info.retval) {
    body.push(assignStmt(ref(info.retval.varId), defaultExpr(info.retval.typeInfo)))
  }
  for (const stmt of statements) {
    body.push(stmt)
  }

  return {
    id: funcId,
    params,
    locals,
    children,
    body,
  }
}
