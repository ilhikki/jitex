/*
 * IL lowering IO 编译。
 *
 * write/writeln/read/readln 内置过程 → JsonCode.Statement[]。
 * 纯函数族，无 mutable state。
 */

import * as JsonCode from '@/middle/ir/json-code.ts'
import { Analysis } from '@/middle/analysis/analysis.ts'
import { BinaryExpressionNode, ExpressionNode } from '@/frontend/node.ts'
import { assignStmt, evalStmt, ref, syscall, SyscallKey, syscallKeys, WithBinding } from './helpers.ts'
import { typeSuffix } from './type.ts'
import { loweringExpr, resolveSymbol } from './expressions.ts'

// io.write.${suffix}[/file][.fmt] —— suffix 来自 typeSuffix，switch 分派，default 抛异常
function ioWriteSyscall(
  suffix: string,
  file: boolean,
  fmt: boolean,
  args: JsonCode.Expr[],
): JsonCode.Syscall {
  let key: SyscallKey
  switch (suffix) {
    case 'i32':
      key = fmt
        ? (file ? syscallKeys.ioWritei32FmtFile : syscallKeys.ioWritei32Fmt)
        : (file ? syscallKeys.ioWritei32File : syscallKeys.ioWritei32)
      break
    case 'f64':
      key = fmt
        ? (file ? syscallKeys.ioWriteF64FmtFile : syscallKeys.ioWriteF64Fmt)
        : (file ? syscallKeys.ioWriteF64File : syscallKeys.ioWriteF64)
      break
    case 'bool':
      key = fmt
        ? (file ? syscallKeys.ioWriteBoolFmtFile : syscallKeys.ioWriteBoolFmt)
        : (file ? syscallKeys.ioWriteBoolFile : syscallKeys.ioWriteBool)
      break
    case 'char':
      key = fmt
        ? (file ? syscallKeys.ioWriteCharFmtFile : syscallKeys.ioWriteCharFmt)
        : (file ? syscallKeys.ioWriteCharFile : syscallKeys.ioWriteChar)
      break
    case 'char.array':
      key = fmt
        ? (file ? syscallKeys.ioWriteCharArrayFmtFile : syscallKeys.ioWriteCharArrayFmt)
        : (file ? syscallKeys.ioWriteCharArrayFile : syscallKeys.ioWriteCharArray)
      break
    case 'set':
      key = fmt
        ? (file ? syscallKeys.ioWriteSetFmtFile : syscallKeys.ioWriteSetFmt)
        : (file ? syscallKeys.ioWriteSetFile : syscallKeys.ioWriteSet)
      break
    default:
      throw new Error(`ioWriteSyscall: unsupported suffix ${suffix}`)
  }
  return syscall(key, args)
}

// io.read.${suffix}[/file] —— suffix 来自 typeSuffix，switch 分派，default 抛异常
function ioReadSyscall(suffix: string, file: boolean, args: JsonCode.Expr[]): JsonCode.Syscall {
  let key: SyscallKey
  switch (suffix) {
    case 'i32':
      key = file ? syscallKeys.ioReadi32File : syscallKeys.ioReadi32
      break
    case 'f64':
      key = file ? syscallKeys.ioReadF64File : syscallKeys.ioReadF64
      break
    case 'bool':
      key = file ? syscallKeys.ioReadBoolFile : syscallKeys.ioReadBool
      break
    case 'char':
      key = file ? syscallKeys.ioReadCharFile : syscallKeys.ioReadChar
      break
    case 'char.array':
      key = file ? syscallKeys.ioReadCharArrayFile : syscallKeys.ioReadCharArray
      break
    case 'set':
      key = file ? syscallKeys.ioReadSetFile : syscallKeys.ioReadSet
      break
    default:
      throw new Error(`ioReadSyscall: unsupported suffix ${suffix}`)
  }
  return syscall(key, args)
}

// ============================================================
// writeln / write 编译
// ============================================================

export function loweringWriteln(
  args: ExpressionNode[],
  a: Analysis,
  ws: WithBinding[],
  noNewline: boolean,
): JsonCode.Statement[] {
  const out: JsonCode.Statement[] = []

  // 检查第一个参数是否是文件
  let fileExpr: JsonCode.Expr | undefined = undefined
  let argStart = 0
  if (args.length > 0) {
    const firstTi = a.typeOf(args[0])
    if (firstTi.tag === 'file') {
      fileExpr = loweringExpr(args[0], a, ws)
      argStart = 1
    }
  }

  for (let i = argStart; i < args.length; i++) {
    const arg = args[i]
    // 解析 Pascal 写参数格式：x / x:width / x:width:precision
    // parser 把 x:w 解析为 BinaryExpression(operator: ':', left: x, right: w)
    // x:w:p 解析为 BinaryExpression(':', BinaryExpression(':', x, w), p)
    let valueNode: ExpressionNode = arg
    let widthExpr: JsonCode.Expr | undefined = undefined
    let precExpr: JsonCode.Expr | undefined = undefined
    if (arg.kind === 'BinaryExpression' && (arg as BinaryExpressionNode).operator === ':') {
      const outer = arg as BinaryExpressionNode
      // outer.right 是最外层的 precision（或 width）
      if (
        outer.left.kind === 'BinaryExpression' &&
        (outer.left as BinaryExpressionNode).operator === ':'
      ) {
        // x:width:precision
        const inner = outer.left as BinaryExpressionNode
        valueNode = inner.left
        widthExpr = loweringExpr(inner.right, a, ws)
        precExpr = loweringExpr(outer.right, a, ws)
      } else {
        // x:width
        valueNode = outer.left
        widthExpr = loweringExpr(outer.right, a, ws)
      }
    }

    const ti = a.typeOf(valueNode)
    const valExpr = loweringExpr(valueNode, a, ws)
    const suffix = typeSuffix(ti)

    if (widthExpr !== undefined) {
      // 带格式化的写入：io.write.{suffix}.fmt [value, width, precision?]
      const fmtArgs = fileExpr
        ? [fileExpr, valExpr, widthExpr, ...(precExpr ? [precExpr] : [])]
        : [valExpr, widthExpr, ...(precExpr ? [precExpr] : [])]
      out.push(evalStmt(ioWriteSyscall(suffix, fileExpr !== undefined, true, fmtArgs)))
    } else {
      const callArgs = fileExpr ? [fileExpr, valExpr] : [valExpr]
      out.push(evalStmt(ioWriteSyscall(suffix, fileExpr !== undefined, false, callArgs)))
    }
  }

  if (!noNewline) {
    if (fileExpr) {
      out.push(evalStmt(syscall(syscallKeys.ioWritelnFile, [fileExpr])))
    } else {
      out.push(evalStmt(syscall(syscallKeys.ioWriteln, [])))
    }
  }

  return out
}

// ============================================================
// readln / read 编译
// ============================================================

export function loweringReadln(
  args: ExpressionNode[],
  a: Analysis,
  ws: WithBinding[],
  isRead: boolean,
): JsonCode.Statement[] {
  const out: JsonCode.Statement[] = []

  // 检查第一个参数是否是文件
  let fileExpr: JsonCode.Expr | undefined = undefined
  let argStart = 0
  if (args.length > 0) {
    const firstTi = a.typeOf(args[0])
    if (firstTi.tag === 'file') {
      fileExpr = loweringExpr(args[0], a, ws)
      argStart = 1
    }
  }

  for (let i = argStart; i < args.length; i++) {
    const argNode = args[i]
    if (argNode.kind !== 'Identifier') {
      throw new Error('readln/read: argument must be a variable')
    }
    const sym = resolveSymbol(argNode, a, ws)
    if (!sym || (sym.kind !== 'var' && sym.kind !== 'param')) {
      throw new Error(`readln/read: variable ${argNode.name} not found`)
    }
    const ti = sym.typeInfo
    const suffix = typeSuffix(ti)
    const readArgs = fileExpr ? [fileExpr] : []
    const valExpr = ioReadSyscall(suffix, fileExpr !== undefined, readArgs)

    if (sym.isVarParam) {
      out.push(evalStmt(syscall(syscallKeys.cellSet, [ref(sym.varId), valExpr])))
    } else {
      out.push(assignStmt(ref(sym.varId), valExpr))
    }
  }

  // readln 消费换行
  if (!isRead) {
    if (fileExpr) {
      out.push(evalStmt(syscall(syscallKeys.ioReadlnSkipFile, [fileExpr])))
    } else if (argStart < args.length || args.length === 0) {
      out.push(evalStmt(syscall(syscallKeys.ioReadlnSkip, [])))
    }
  }

  return out
}
