/*
 * IL lowering 表达式编译。
 *
 * Pascal ExpressionNode → JsonCode.Expr。
 * 纯函数族，无 mutable state。
 */

import * as JsonCode from '@/middle/ir/json-code.ts'
import { Analysis, AnalysisSymbol } from '@/middle/analysis/analysis.ts'
import {
  ArrayAccessNode,
  BinaryExpressionNode,
  ExpressionNode,
  FieldAccessNode,
  FunctionCallNode,
  IdentifierNode,
  InExpressionNode,
  SetConstructorNode,
  UnaryExpressionNode,
} from '@/frontend/node.ts'
import {
  callExpr,
  litBool,
  litChar,
  litField,
  litInt,
  litNull,
  litReal,
  litStr,
  ref,
  syscall,
  SyscallKey,
  syscallKeys,
  WithBinding,
} from './helpers.ts'
import { isRecordFile, typeAddCall, typeSubCall, typeSuffix } from './type.ts'

// ============================================================
// loweringExpr → Expr
// ============================================================

export function loweringExpr(node: ExpressionNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  switch (node.kind) {
    case 'IntegerLiteral':
      return litInt(node.raw)
    case 'RealLiteral':
      return litReal(node.raw)
    case 'StringLiteral':
      // ISO 7185：字符串字面量是 packed array[1..n] of char。
      // 编译为 syscall('str.to.char.array', [strLiteral])，runtime 转为 1-based PascalArray。
      // 字面量用 key:'str' 编码（runtime literalToJs 直接产出 JS 字符串）。
      return syscall(syscallKeys.strToCharArray, [litStr(node.value)])
    case 'CharLiteral':
      return litChar(node.value)
    case 'BooleanLiteral':
      return litBool(node.value)

    case 'Identifier':
      return loweringIdentifier(node, a, ws)

    case 'ParenthesizedExpression':
      return loweringExpr(node.expression, a, ws)

    case 'BinaryExpression':
      return loweringBinary(node, a, ws)

    case 'UnaryExpression':
      return loweringUnary(node, a, ws)

    case 'FunctionCall':
      return loweringFunctionCall(node, a, ws)

    case 'ArrayAccess':
      return loweringArrayAccess(node, a, ws)

    case 'FieldAccess':
      return loweringFieldAccess(node, a, ws)

    case 'SetConstructor':
      return loweringSetConstructor(node, a, ws)

    case 'InExpression':
      return loweringInExpression(node, a, ws)

    default:
      throw new Error(`loweringExpr: unknown kind ${(node as ExpressionNode).kind}`)
  }
}

function loweringIdentifier(node: IdentifierNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  // with 字段优先：Pascal 标准中 with record do 体内，
  // record 的字段优先于同名外层变量（ISO 7185 6.8.3.10）
  for (let i = ws.length - 1; i >= 0; i--) {
    const binding = ws[i]
    const fname = node.name.toLowerCase()
    if (binding.fields.has(fname)) {
      // 类型信息已由 mem.default.rec 时构建为 handler 缓存在 record 上，
      // rec.field 不再需要类型参数
      return syscall(syscallKeys.recField, [ref(binding.tempVarId), litField(fname)])
    }
  }

  const sym = resolveSymbol(node, a, ws)

  if (sym?.kind === 'var' || sym?.kind === 'param') {
    if (sym.isVarParam) {
      return syscall(syscallKeys.cellGet, [ref(sym.varId)])
    }
    return ref(sym.varId)
  }

  if (sym?.kind === 'const') {
    // const 字符串字面量：key 'str' 编码的需包 str.to.char.array syscall 产出 1-based char 数组。
    // 其它类型直接用 literal 字面量。
    if (sym.literal.key === 'str') {
      return syscall(syscallKeys.strToCharArray, [
        { kind: 'literal', key: 'str', arg: sym.literal.arg },
      ])
    }
    return { kind: 'literal', key: sym.literal.key, arg: sym.literal.arg }
  }

  // 无参函数调用：Pascal 允许省略括号，parser 把 `getx` 解析为 Identifier。
  // analysis 阶段已查到 sym 是 func，这里生成无参 Call。
  if (sym?.kind === 'func') {
    return callExpr(sym.funcId, [])
  }

  // 内置常量
  const name = node.name.toLowerCase()
  if (name === 'true') {
    return litBool(true)
  }
  if (name === 'false') {
    return litBool(false)
  }
  if (name === 'maxint') {
    return litInt(2147483647)
  }
  if (name === 'nil') {
    return litNull()
  }
  // 内置无参函数（parser 将无括号调用解析为 Identifier）
  if (name === 'eof') {
    return syscall(syscallKeys.ioEof, [])
  }
  if (name === 'eoln') {
    return syscall(syscallKeys.ioEoln, [])
  }

  throw new Error(`loweringIdentifier: undefined identifier ${node.name}`)
}

function loweringBinary(node: BinaryExpressionNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const L = loweringExpr(node.left, a, ws)
  const R = loweringExpr(node.right, a, ws)
  const lt = a.typeOf(node.left)
  // parser 输出大写 operator（DIV/MOD/AND/OR/NOT），统一转大写比较
  const op = node.operator.toUpperCase()

  // 集合运算
  if (lt.tag === 'set') {
    switch (op) {
      case '+':
        return syscall(syscallKeys.setUnion, [L, R])
      case '*':
        return syscall(syscallKeys.setIntersect, [L, R])
      case '-':
        return syscall(syscallKeys.setDiff, [L, R])
      case '=':
        return syscall(syscallKeys.setEq, [L, R])
      case '<>':
        return syscall(syscallKeys.setNe, [L, R])
      case '<=':
        return syscall(syscallKeys.setLe, [L, R])
      case '>=':
        return syscall(syscallKeys.setGe, [L, R])
    }
  }

  // 字符串拼接非 ISO 7185 特性，不专门处理（char 数组 + 会落到下方算术报错）。

  // 布尔逻辑
  if (op === 'AND') {
    if (lt.tag === 'i32') {
      return syscall(syscallKeys.i32And, [L, R])
    }
    return syscall(syscallKeys.boolAnd, [L, R])
  }
  if (op === 'OR') {
    if (lt.tag === 'i32') {
      return syscall(syscallKeys.i32Or, [L, R])
    }
    return syscall(syscallKeys.boolOr, [L, R])
  }

  // 比较
  switch (op) {
    case '=':
      return syscall(syscallKeys.cmpEq, [L, R])
    case '<>':
      return syscall(syscallKeys.cmpNe, [L, R])
    case '<':
      return syscall(syscallKeys.cmpLt, [L, R])
    case '<=':
      return syscall(syscallKeys.cmpLe, [L, R])
    case '>':
      return syscall(syscallKeys.cmpGt, [L, R])
    case '>=':
      return syscall(syscallKeys.cmpGe, [L, R])
  }

  // 算术
  const isReal = lt.tag === 'f64' || a.typeOf(node.right).tag === 'f64'

  switch (op) {
    case '+':
      return syscall(isReal ? syscallKeys.f64Add : syscallKeys.i32Add, [L, R])
    case '-':
      return syscall(isReal ? syscallKeys.f64Sub : syscallKeys.i32Sub, [L, R])
    case '*':
      return syscall(isReal ? syscallKeys.f64Mul : syscallKeys.i32Mul, [L, R])
    case '/':
      return syscall(syscallKeys.f64Div, [L, R])
    case 'DIV':
      return syscall(syscallKeys.i32Div, [L, R])
    case 'MOD':
      return syscall(syscallKeys.i32Mod, [L, R])
    default:
      throw new Error(`loweringBinary: unknown operator ${op}`)
  }
}

function loweringUnary(node: UnaryExpressionNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const X = loweringExpr(node.operand, a, ws)
  const ti = a.typeOf(node.operand)
  // parser 输出大写 operator（NOT），统一转大写比较
  const op = node.operator.toUpperCase()

  if (op === 'NOT') {
    if (ti.tag === 'i32') {
      return syscall(syscallKeys.i32Not, [X])
    }
    return syscall(syscallKeys.boolNot, [X])
  }
  if (op === '-') {
    return syscall(ti.tag === 'f64' ? syscallKeys.f64Neg : syscallKeys.i32Neg, [X])
  }
  if (op === '+') {
    return X
  }
  throw new Error(`loweringUnary: unknown operator ${op}`)
}

function loweringFunctionCall(
  node: FunctionCallNode,
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr {
  const sym = resolveSymbol(node.name, a, ws)

  // 用户定义函数
  if (sym?.kind === 'func') {
    const args = node.arguments.map((x) => loweringExpr(x, a, ws))
    return callExpr(sym.funcId, args)
  }

  // 内置函数
  const name = node.name.name.toLowerCase()
  const args = node.arguments
  const argExprs = args.map((x) => loweringExpr(x, a, ws))

  // 额外 callable 注入的函数（AGENTS.md 原则 A.7：注入优先；原生被允许覆盖时也在此命中）
  const extraFunc = a.extraCallables()?.get(name)
  if (extraFunc?.kind === 'function') {
    return syscall(extraFunc.sysCallName as SyscallKey, argExprs)
  }

  switch (name) {
    case 'abs': {
      const ti = a.typeOf(args[0])
      return syscall(ti.tag === 'f64' ? syscallKeys.f64Abs : syscallKeys.i32Abs, argExprs)
    }
    case 'sqr': {
      const ti = a.typeOf(args[0])
      return syscall(ti.tag === 'f64' ? syscallKeys.f64Mul : syscallKeys.i32Mul, [argExprs[0], argExprs[0]])
    }
    case 'sqrt':
      return syscall(syscallKeys.f64Sqrt, argExprs)
    case 'sin':
      return syscall(syscallKeys.f64Sin, argExprs)
    case 'cos':
      return syscall(syscallKeys.f64Cos, argExprs)
    case 'exp':
      return syscall(syscallKeys.f64Exp, argExprs)
    case 'ln':
      return syscall(syscallKeys.f64Ln, argExprs)
    case 'arctan':
      return syscall(syscallKeys.f64Arctan, argExprs)
    case 'trunc':
      return syscall(syscallKeys.castF64Toi32, argExprs)
    case 'round':
      return syscall(syscallKeys.castF64Toi32Round, argExprs)
    case 'ord': {
      const ti = a.typeOf(args[0])
      if (ti.tag === 'char') {
        return syscall(syscallKeys.castCharToi32, argExprs)
      }
      if (ti.tag === 'bool') {
        return syscall(syscallKeys.castBoolToi32, argExprs)
      }
      return argExprs[0] // integer/enum 已经是 i32
    }
    case 'chr':
      return syscall(syscallKeys.casti32ToChar, argExprs)
    case 'pred': {
      const ti = a.typeOf(args[0])
      // ISO 7185 6.6.6.4: pred(x) = value whose ordinal number is one less than x
      // "error if none" — 对枚举首值/子界下界必须报错
      // char 类型需先转 ord 再运算再转回 char
      if (ti.tag === 'char') {
        return syscall(syscallKeys.casti32ToChar, [
          syscall(syscallKeys.i32Sub, [syscall(syscallKeys.castCharToi32, argExprs), litInt(1)]),
        ])
      }
      if (ti.tag === 'enum' && ti.enumCount !== undefined) {
        // 枚举范围 0..enumCount-1，pred 后检查 < 0
        const result = syscall(syscallKeys.i32Sub, [argExprs[0], litInt(1)])
        return syscall(syscallKeys.rangeCheck, [result, litInt(0), litInt(ti.enumCount - 1)])
      }
      if (ti.tag === 'subrange' && ti.low !== undefined && ti.high !== undefined) {
        const result = syscall(syscallKeys.i32Sub, [argExprs[0], litInt(1)])
        return syscall(syscallKeys.rangeCheck, [result, litInt(ti.low), litInt(ti.high)])
      }
      return typeSubCall(typeSuffix(ti), [argExprs[0], litInt(1)])
    }
    case 'succ': {
      const ti = a.typeOf(args[0])
      // ISO 7185 6.6.6.4: succ(x) = value whose ordinal number is one greater than x
      // "error if none" — 对枚举末值/子界上界必须报错
      // char 类型需先转 ord 再运算再转回 char
      if (ti.tag === 'char') {
        return syscall(syscallKeys.casti32ToChar, [
          syscall(syscallKeys.i32Add, [syscall(syscallKeys.castCharToi32, argExprs), litInt(1)]),
        ])
      }
      if (ti.tag === 'enum' && ti.enumCount !== undefined) {
        // 枚举范围 0..enumCount-1，succ 后检查 > enumCount-1
        const result = syscall(syscallKeys.i32Add, [argExprs[0], litInt(1)])
        return syscall(syscallKeys.rangeCheck, [result, litInt(0), litInt(ti.enumCount - 1)])
      }
      if (ti.tag === 'subrange' && ti.low !== undefined && ti.high !== undefined) {
        const result = syscall(syscallKeys.i32Add, [argExprs[0], litInt(1)])
        return syscall(syscallKeys.rangeCheck, [result, litInt(ti.low), litInt(ti.high)])
      }
      return typeAddCall(typeSuffix(ti), [argExprs[0], litInt(1)])
    }
    case 'odd':
      return syscall(syscallKeys.i32Odd, argExprs)
    case 'eof':
      if (args.length > 0) {
        // file of record 用 file.rec.eof（ISO 7185 6.4.3.5）
        if (isRecordFile(a.typeOf(args[0]))) {
          return syscall(syscallKeys.fileRecEof, argExprs)
        }
        return syscall(syscallKeys.fileEof, argExprs)
      }
      return syscall(syscallKeys.ioEof, [])
    case 'eoln':
      if (args.length > 0) {
        return syscall(syscallKeys.fileEoln, argExprs)
      }
      return syscall(syscallKeys.ioEoln, [])
    default: {
      throw new Error(`loweringFunctionCall: unknown function ${name}`)
    }
  }
}

function loweringArrayAccess(node: ArrayAccessNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const arr = loweringExpr(node.array, a, ws)
  const indices = node.indices.map((i) => {
    const expr = loweringExpr(i, a, ws)
    // Pascal CHAR 作为数组索引时，需转成 ord（charCodeAt），
    // 否则 JS 中 arr['A'] 访问属性而非 arr[65]
    const ti = a.typeOf(i)
    if (ti.tag === 'char') {
      return syscall(syscallKeys.castCharToi32, [expr])
    }
    return expr
  })
  return syscall(syscallKeys.arrayGet, [arr, ...indices])
}

function loweringFieldAccess(node: FieldAccessNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const objType = a.typeOf(node.object)
  if (node.field.name === '^') {
    if (objType.tag === 'pointer') {
      // ISO 7185 6.5.4: 指针解引用 p^ → cell.get(p)
      return syscall(syscallKeys.ptrDeref, [loweringExpr(node.object, a, ws)])
    }
    // 文件缓冲区访问 f^
    // file of record: f^ 返回记录缓冲区（ISO 7185 6.4.3.5/6.6.5.2）
    if (isRecordFile(objType)) {
      return syscall(syscallKeys.fileRecPeek, [loweringExpr(node.object, a, ws)])
    } else if (objType.elem?.tag === 'char') {
      return syscall(syscallKeys.filePeekChar, [loweringExpr(node.object, a, ws)])
    }
    return syscall(syscallKeys.filePeek, [loweringExpr(node.object, a, ws)])
  }
  const obj = loweringExpr(node.object, a, ws)
  return syscall(syscallKeys.recField, [obj, litField(node.field.name.toLowerCase())])
}

function loweringSetConstructor(
  node: SetConstructorNode,
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr {
  if (node.elements.length === 0) {
    return syscall(syscallKeys.setEmpty, [])
  }

  const elems: JsonCode.Expr[] = []
  for (const [start, end] of node.elements) {
    const sExpr = loweringExpr(start, a, ws)
    if (end) {
      const eExpr = loweringExpr(end, a, ws)
      elems.push(syscall(syscallKeys.setRange, [sExpr, eExpr]))
    } else {
      elems.push(syscall(syscallKeys.setElem, [sExpr]))
    }
  }
  return syscall(syscallKeys.setLiteral, elems)
}

function loweringInExpression(
  node: InExpressionNode,
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr {
  const L = loweringExpr(node.left, a, ws)
  const R = loweringExpr(node.right, a, ws)
  return syscall(syscallKeys.setIn, [L, R])
}

// ============================================================
// 符号解析（含 with 重写）
// ============================================================

export function resolveSymbol(node: IdentifierNode, a: Analysis, _ws: WithBinding[]): AnalysisSymbol | undefined {
  return a.symbolOf(node)
}
