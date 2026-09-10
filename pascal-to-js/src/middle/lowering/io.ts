/*
 * IL lowering IO 编译。
 *
 * write / writeln / read / readln 内置过程 → JsonCode.Statement[]。
 *
 * 不按值类型选 key：每个值实参产一条 `lowering.io.*` syscall，
 * 携带 (值, 类型描述) 与可选的 (width, precision)，由 rewrite 消费类型后
 * 翻译成 `runtime.file.*` + `runtime.convert.*`。
 */

import * as JsonCode from '@/middle/ir/json-code.ts'
import { Analysis } from '@/middle/analysis/analysis-type.ts'
import { BinaryExpressionNode, ExpressionNode } from '@/frontend/node.ts'
import { assignStmt, evalStmt, litNull, ref, syscall, syscallKeys, WithBinding } from './helpers.ts'
import { typeDescLiteral } from './type.ts'
import { loweringExpr, resolveSymbol } from './expressions.ts'

// ============================================================
// 写目标的解析：首参数为文件时作为 target，否则默认 input/output
// ============================================================

function resolveTarget(
  args: ExpressionNode[],
  a: Analysis,
  ws: WithBinding[],
): { target: JsonCode.Expr; targetType: JsonCode.Expr; argStart: number } {
  if (args.length > 0 && a.typeOf(args[0]).tag === 'file') {
    return {
      target: loweringExpr(args[0], a, ws),
      targetType: typeDescLiteral(a.typeOf(args[0])),
      argStart: 1,
    }
  }
  return { target: litNull(), targetType: litNull(), argStart: 0 }
}

/** 把写参数拆成 value / width / precision（`x:w:p` 是 parser 的 `BinaryExpression(':')`） */
function splitWriteArg(arg: ExpressionNode): {
  valueNode: ExpressionNode
  widthNode?: ExpressionNode
  precNode?: ExpressionNode
} {
  if (arg.kind === 'BinaryExpression' && (arg as BinaryExpressionNode).operator === ':') {
    const outer = arg as BinaryExpressionNode
    if (
      outer.left.kind === 'BinaryExpression' &&
      (outer.left as BinaryExpressionNode).operator === ':'
    ) {
      const inner = outer.left as BinaryExpressionNode
      return { valueNode: inner.left, widthNode: inner.right, precNode: outer.right }
    }
    return { valueNode: outer.left, widthNode: outer.right }
  }
  return { valueNode: arg }
}

// ============================================================
// writeln / write
// ============================================================

export function loweringWriteln(
  args: ExpressionNode[],
  a: Analysis,
  ws: WithBinding[],
  noNewline: boolean,
): JsonCode.Statement[] {
  const out: JsonCode.Statement[] = []
  const { target, targetType, argStart } = resolveTarget(args, a, ws)

  for (let i = argStart; i < args.length; i++) {
    const { valueNode, widthNode, precNode } = splitWriteArg(args[i])
    const ti = a.typeOf(valueNode)
    out.push(
      evalStmt(
        syscall(syscallKeys.ioWrite, [
          target,
          targetType,
          loweringExpr(valueNode, a, ws),
          typeDescLiteral(ti),
          widthNode ? loweringExpr(widthNode, a, ws) : litNull(),
          precNode ? loweringExpr(precNode, a, ws) : litNull(),
        ]),
      ),
    )
  }

  if (!noNewline) {
    out.push(evalStmt(syscall(syscallKeys.ioWriteln, [target, targetType])))
  }
  return out
}

// ============================================================
// readln / read
// ============================================================

export function loweringReadln(
  args: ExpressionNode[],
  a: Analysis,
  ws: WithBinding[],
  isRead: boolean,
): JsonCode.Statement[] {
  const out: JsonCode.Statement[] = []
  const { target, targetType, argStart } = resolveTarget(args, a, ws)

  for (let i = argStart; i < args.length; i++) {
    const argNode = args[i]
    if (argNode.kind !== 'Identifier') {
      throw new Error('readln/read: argument must be a variable')
    }
    const sym = resolveSymbol(argNode, a, ws)
    if (!sym || (sym.kind !== 'var' && sym.kind !== 'param')) {
      throw new Error(`readln/read: variable ${argNode.name} not found`)
    }
    const valExpr = syscall(syscallKeys.ioRead, [
      target,
      targetType,
      typeDescLiteral(sym.typeInfo),
    ])

    if (sym.isVarParam) {
      out.push(evalStmt(syscall(syscallKeys.cellSet, [ref(sym.varId), valExpr])))
    } else {
      out.push(assignStmt(ref(sym.varId), valExpr))
    }
  }

  // readln 消费换行
  if (!isRead) {
    if (argStart > 0 || args.length === 0) {
      out.push(evalStmt(syscall(syscallKeys.ioReadlnSkip, [target, targetType])))
    }
  }

  return out
}
