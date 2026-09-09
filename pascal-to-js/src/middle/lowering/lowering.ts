/*
 * IL lowering 入口：Pascal ProgramNode → JsonCode.Function。
 *
 * 纯函数族，无 mutable state。
 * 输入：(ProgramNode, Analysis) → 输出：JsonCode.Function（顶层函数）
 *
 * 唯一可变动作用是调用 analysis.nextId() / allocTempLocal() 拿新 ID，
 * 计数器属于 Analysis，lowering 不自行维护。
 */

import * as JsonCode from '@/middle/ir/json-code.ts'
import { Analysis, VarSymbol } from '@/middle/analysis/analysis-type.ts'
import { BlockNode, IdentifierNode, ProgramNode } from '@/frontend/node.ts'
import { assignStmt, evalStmt, litField, ref, returnStmt, syscall, syscallKeys } from './helpers.ts'
import { defaultExpr, typeDescLiteral } from './type.ts'
import { loweringStmt } from './statements.ts'

// ============================================================
// 入口：loweringProgram
// ============================================================

export function loweringProgram(program: ProgramNode, a: Analysis): JsonCode.Function {
  return loweringBlock(program.block, a, program.parameters)
}

// ============================================================
// loweringBlock → JsonCode.Function
// ============================================================

function loweringBlock(
  block: BlockNode,
  analysis: Analysis,
  programParams?: IdentifierNode[],
): JsonCode.Function {
  const funcId = analysis.funcOfBlock(block)
  const info = analysis.funcInfo(funcId)

  const params = info.params.map((p) => p.varId)
  const locals = info.locals.map((l) => l.varId)
  if (info.retval) {
    locals.push(info.retval.varId)
  }

  // children
  const children: JsonCode.Function[] = []
  for (const p of block.procedureDeclarations) {
    if (p.block) {
      children.push(loweringBlock(p.block, analysis))
    } else {
      // FORWARD 声明：空函数
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

  // body
  const body: JsonCode.Statement[] = []
  const debugName = analysis.debugNames().get(info.funcId) ?? ''
  body.push(evalStmt(syscall(syscallKeys.hookFunctionEnter, [litField(info.funcId.toString()), litField(debugName)])))
  // 变量初始化
  for (const local of info.locals) {
    body.push(assignStmt(ref(local.varId), defaultExpr(local.typeInfo)))
  }
  if (info.retval) {
    body.push(assignStmt(ref(info.retval.varId), defaultExpr(info.retval.typeInfo)))
  }

  // program 头的文件参数初始化（ISO 7185 6.10）：
  // PROGRAM X(INFILE, OUTFILE); 中声明的参数必须在算法开始前绑定到外部文件。
  // 绑定机制是 impl-defined（ISO 6.10）：本工程在运行时用 ctx.programFileUrl
  // 做映射（缺省为恒等映射），通过 program.fileUrl syscall 取 url，
  // 再用 rec.set 直接把 url 写入文件句柄的 .url 字段。
  // （不使用 file.assign —— 那是 Borland 扩展过程，非 ISO 6.6.5.2。）
  if (info.kind === 'program' && programParams && programParams.length > 0) {
    for (const p of programParams) {
      const sym = analysis.globalSymbolOf(p.name)
      if (sym && (sym.kind === 'var' || sym.kind === 'param')) {
        const varSym = sym as VarSymbol
        body.push(
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

  // compound 语句
  for (const stmt of loweringStmt(block.compound, analysis, funcId, [])) {
    body.push(stmt)
  }

  // 末尾 return
  if (info.retval) {
    body.push(returnStmt(ref(info.retval.varId)))
  } else {
    body.push(returnStmt())
  }

  return {
    id: funcId,
    params,
    locals,
    children,
    body,
  }
}
