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

// 入口：loweringProgram

export function loweringProgram(program: ProgramNode, a: Analysis): JsonCode.Function {
  return loweringBlock(program.block, a, program.parameters)
}

// loweringBlock → JsonCode.Function

function loweringBlock(
  block: BlockNode,
  analysis: Analysis,
  programParams?: IdentifierNode[],
): JsonCode.Function {
  const funcId = analysis.funcOfBlock(block)
  const info = analysis.funcInfo(funcId)

  const params = info.params.map((p) => p.varId)

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

  // body：先 lowering statement-part，再组装整个函数体。
  //
  // 顺序很关键：for / case / with 的编译期临时变量是在 lowering 语句期间由
  // allocTempLocal 追加到 info.locals 的，因此 locals 快照与默认初始化都必须
  // 放在 lowering 之后 -- 否则这些临时变量既拿不到 let 声明（赋值落到全局，
  // 递归时被内层激活覆盖），也拿不到默认初始化。
  const statements: JsonCode.Statement[] = []

  // program 头的文件参数初始化（ISO 7185 6.10）：
  // PROGRAM X(INFILE, OUTFILE); 中声明的参数必须在算法开始前绑定到外部文件。
  // 绑定机制是 impl-defined（ISO 6.10）：本工程在运行时用 ctx.programFileUrl
  // 做映射（缺省为恒等映射），通过 program.fileUrl syscall 取 url，
  // 再用 rec.set 直接把 url 写入文件句柄的 .url 字段。
  // （不使用 file.assign -- 那是 Borland 扩展过程，非 ISO 6.6.5.2。）
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

  // compound 语句
  for (const stmt of loweringStmt(block.compound, analysis, funcId, [])) {
    statements.push(stmt)
  }

  // 末尾 return
  if (info.retval) {
    statements.push(returnStmt(ref(info.retval.varId)))
  } else {
    statements.push(returnStmt())
  }

  // locals 声明（含 lowering 期间新增的编译期临时变量）
  const locals = info.locals.map((l) => l.varId)
  if (info.retval) {
    locals.push(info.retval.varId)
  }

  // 函数体 = 进入钩子 → 变量默认初始化 → 语句 → 末尾 return
  const body: JsonCode.Statement[] = []
  // 进入钩子只在 debug 构建生成：它该不该存在取决于插入位置（函数入口），
  // 而位置知识在本层 -- 所以由本层决定，而不是生成后交给 rewrite 抹掉
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
