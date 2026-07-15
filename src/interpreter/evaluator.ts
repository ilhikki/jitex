/**
 * Pascal 表达式求值器 (M2 - 类型系统)
 *
 * 所有值都是带类型的 PascalValue
 * 运算由类型决定，支持溢出/截断检查
 */

import type { ExpressionNode } from '../ast/types'
import type { State, Scope, PascalValue, PascalType } from './types'
import {
  PascalValue as IPascalValue,
  binaryOp,
  unaryOp,
  makeInteger,
  makeReal,
  makeChar,
  makeBoolean,
  makeString,
  findType,
  coerceToType,
  INTEGER_TYPE,
  REAL_TYPE,
  CHAR_TYPE,
  BOOLEAN_TYPE,
  STRING_TYPE,
} from './types/pascal-value'
import type {
  IntegerLiteralNode,
  RealLiteralNode,
  StringLiteralNode,
  BooleanLiteralNode,
  CharLiteralNode,
  IdentifierNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  FunctionCallNode,
} from '../ast/types'
import { createScope } from './types'
import { createFunctionCallFrame } from './frames'

// ============================================================================
// 主要求值函数
// ============================================================================

export function evalExpr(expr: ExpressionNode, scope: Scope, state: State): PascalValue {
  switch (expr.kind) {
    case 'IntegerLiteral':
      return makeInteger((expr as IntegerLiteralNode).value)

    case 'RealLiteral':
      return makeReal((expr as RealLiteralNode).value)

    case 'StringLiteral':
      return makeString((expr as StringLiteralNode).value)

    case 'CharLiteral':
      return makeChar((expr as CharLiteralNode).value)

    case 'BooleanLiteral':
      return makeBoolean((expr as BooleanLiteralNode).value)

    case 'Identifier': {
      const name = (expr as IdentifierNode).name.toUpperCase()
      const value = lookupVariable(name, scope)
      if (value) return value

      // 尝试作为无参函数调用
      const builtinResult = evalBuiltin(name, [], scope, state)
      if (builtinResult) return builtinResult

      // 尝试调用用户定义的函数
      const funcDecl = state.declarations.findFunction((expr as IdentifierNode).name, scope)
      if (funcDecl) {
        return evalUserFunctionCall(funcDecl, [], scope, state)
      }

      // 未找到变量，返回默认值
      return makeInteger(0)
    }

    case 'BinaryExpression': {
      const bin = expr as BinaryExpressionNode
      const left = evalExpr(bin.left, scope, state)
      const right = evalExpr(bin.right, scope, state)
      return binaryOp(bin.operator, left, right)
    }

    case 'UnaryExpression': {
      const unary = expr as UnaryExpressionNode
      const operand = evalExpr(unary.operand, scope, state)
      return unaryOp(unary.operator, operand)
    }

    case 'FunctionCall': {
      const fn = expr as FunctionCallNode
      return evalFunctionCall(fn, scope, state)
    }

    case 'ParenthesizedExpression': {
      const paren = expr as any
      return evalExpr(paren.expression, scope, state)
    }

    default:
      throw new Error(`Unsupported expression type: ${expr.kind}`)
  }
}

// ============================================================================
// 变量查找
// ============================================================================

function lookupVariable(name: string, scope: Scope): PascalValue | null {
  let s: Scope | null = scope
  while (s) {
    if (s.variables.has(name)) {
      return s.variables.get(name)!
    }
    s = s.parent
  }
  return null
}

export function lookupVariableType(name: string, scope: Scope): PascalType | null {
  let s: Scope | null = scope
  while (s) {
    if (s.variableTypes.has(name)) {
      return s.variableTypes.get(name)!
    }
    s = s.parent
  }
  return null
}

function hasVariable(name: string, scope: Scope): boolean {
  let s: Scope | null = scope
  while (s) {
    if (s.variables.has(name)) {
      return true
    }
    s = s.parent
  }
  return false
}

// ============================================================================
// 内置函数
// ============================================================================

function evalBuiltin(name: string, args: ExpressionNode[], scope: Scope, state: State): PascalValue | null {
  switch (name) {
    case 'CHR': {
      const arg = evalExpr(args[0], scope, state)
      const code = arg.rawValue as number
      return makeChar(String.fromCharCode(code))
    }
    case 'ORD': {
      const arg = evalExpr(args[0], scope, state)
      const str = arg.rawValue as string
      return makeInteger(str.charCodeAt(0))
    }
    case 'ABS': {
      const arg = evalExpr(args[0], scope, state)
      const val = arg.rawValue as number
      return arg.type.kind === 'integer' ? makeInteger(Math.abs(val)) : makeReal(Math.abs(val))
    }
    case 'ROUND': {
      const arg = evalExpr(args[0], scope, state)
      const val = arg.rawValue as number
      return makeInteger(Math.round(val))
    }
    case 'TRUNC': {
      const arg = evalExpr(args[0], scope, state)
      const val = arg.rawValue as number
      return makeInteger(Math.trunc(val))
    }
    case 'EOF':
      return makeBoolean(state.inputQueue.length === 0)
    case 'EOLN':
      return makeBoolean(state.inputQueue.length === 0 || state.inputQueue[0] === '\n')
    case 'SQR': {
      const arg = evalExpr(args[0], scope, state)
      const val = arg.rawValue as number
      return arg.type.kind === 'integer' ? makeInteger(val * val) : makeReal(val * val)
    }
    case 'SQRT': {
      const arg = evalExpr(args[0], scope, state)
      const val = arg.rawValue as number
      return makeReal(Math.sqrt(val))
    }
    case 'SIN': {
      const arg = evalExpr(args[0], scope, state)
      return makeReal(Math.sin(arg.rawValue as number))
    }
    case 'COS': {
      const arg = evalExpr(args[0], scope, state)
      return makeReal(Math.cos(arg.rawValue as number))
    }
    case 'LN': {
      const arg = evalExpr(args[0], scope, state)
      return makeReal(Math.log(arg.rawValue as number))
    }
    case 'EXP': {
      const arg = evalExpr(args[0], scope, state)
      return makeReal(Math.exp(arg.rawValue as number))
    }
    case 'PRED': {
      const arg = evalExpr(args[0], scope, state)
      if (arg.type.kind === 'integer') {
        return makeInteger((arg.rawValue as number) - 1)
      }
      if (arg.type.kind === 'char') {
        const code = (arg.rawValue as string).charCodeAt(0)
        return makeChar(String.fromCharCode(code - 1))
      }
      throw new Error('PRED requires ordinal type')
    }
    case 'SUCC': {
      const arg = evalExpr(args[0], scope, state)
      if (arg.type.kind === 'integer') {
        return makeInteger((arg.rawValue as number) + 1)
      }
      if (arg.type.kind === 'char') {
        const code = (arg.rawValue as string).charCodeAt(0)
        return makeChar(String.fromCharCode(code + 1))
      }
      throw new Error('SUCC requires ordinal type')
    }
    case 'ODD': {
      const arg = evalExpr(args[0], scope, state)
      return makeBoolean(((arg.rawValue as number) & 1) === 1)
    }
    default:
      return null
  }
}

// ============================================================================
// 函数调用
// ============================================================================

function evalFunctionCall(fn: FunctionCallNode, scope: Scope, state: State): PascalValue {
  const name = fn.name.name.toUpperCase()

  // 尝试内置函数
  const builtinResult = evalBuiltin(name, fn.arguments, scope, state)
  if (builtinResult) return builtinResult

  // 用户定义的函数
  const funcDecl = state.declarations.findFunction(name, scope)
  if (funcDecl && funcDecl.block) {
    return evalUserFunctionCall(funcDecl, fn.arguments, scope, state)
  }

  return makeInteger(0)
}

function evalUserFunctionCall(
  funcDecl: any,
  args: ExpressionNode[],
  scope: Scope,
  state: State
): PascalValue {
  const fnScope = createScope(scope, funcDecl)
  const savedScope = state.currentScope
  state.currentScope = fnScope

  const savedReturnValue = state.returnValue
  state.returnValue = null

  // 初始化函数局部变量
  if (funcDecl.block) {
    funcDecl.block.variableDeclarations.forEach((v: any) => {
      const typeName = v.type && v.type.kind === 'SimpleType' ? v.type.name.name : 'INTEGER'
      const varType = findType(typeName) || INTEGER_TYPE
      v.names.forEach((n: any) => {
        const defaultValue = varType.kind === 'integer' ? makeInteger(0) :
                             varType.kind === 'real' ? makeReal(0) :
                             varType.kind === 'boolean' ? makeBoolean(false) :
                             varType.kind === 'char' ? makeChar('\0') :
                             varType.kind === 'string' ? makeString('') :
                             makeInteger(0)
        fnScope.variables.set(n.name.toUpperCase(), defaultValue)
        fnScope.variableTypes.set(n.name.toUpperCase(), varType)
      })
    })
  }

  // 传递参数
  let argIndex = 0
  for (const param of funcDecl.parameters) {
    for (const nameNode of param.names) {
      if (argIndex < args.length) {
        const argValue = evalExpr(args[argIndex], scope, state)
        fnScope.variables.set(nameNode.name.toUpperCase(), argValue)

        // 设置参数类型
        const paramTypeName = param.type && param.type.kind === 'SimpleType' ? param.type.name.name : 'INTEGER'
        const paramType = findType(paramTypeName) || INTEGER_TYPE
        fnScope.variableTypes.set(nameNode.name.toUpperCase(), paramType)
        argIndex++
      }
    }
  }

  // 执行函数体
  const frame = createFunctionCallFrame(funcDecl, args, state)
  state.stack.push(frame)

  while (state.stack.length > 0 && !frame.done) {
    const top = state.stack[state.stack.length - 1]
    top.step(state)
    while (state.stack.length > 0 && state.stack[state.stack.length - 1].done) {
      state.stack.pop()
    }
  }

  // 获取返回值
  const result = state.returnValue || makeInteger(0)
  state.returnValue = savedReturnValue
  state.currentScope = savedScope

  return result
}

// ============================================================================
// 类型推断
// ============================================================================

export function inferExprType(expr: ExpressionNode, scope: Scope, state: State): PascalType {
  switch (expr.kind) {
    case 'IntegerLiteral':
      return INTEGER_TYPE
    case 'RealLiteral':
      return REAL_TYPE
    case 'StringLiteral':
      return STRING_TYPE
    case 'CharLiteral':
      return CHAR_TYPE
    case 'BooleanLiteral':
      return BOOLEAN_TYPE
    case 'Identifier': {
      const name = (expr as IdentifierNode).name.toUpperCase()
      const type = lookupVariableType(name, scope)
      return type || INTEGER_TYPE
    }
    case 'BinaryExpression': {
      const bin = expr as BinaryExpressionNode
      // 比较运算返回布尔
      if (['=', '<>', '<', '<=', '>', '>='].includes(bin.operator)) {
        return BOOLEAN_TYPE
      }
      // AND/OR 返回布尔
      if (bin.operator.toUpperCase() === 'AND' || bin.operator.toUpperCase() === 'OR') {
        return BOOLEAN_TYPE
      }
      // 算术运算：整数 + 实数 = 实数
      const leftType = inferExprType(bin.left, scope, state)
      const rightType = inferExprType(bin.right, scope, state)
      if (leftType.kind === 'real' || rightType.kind === 'real') {
        return REAL_TYPE
      }
      return leftType
    }
    case 'UnaryExpression': {
      const unary = expr as UnaryExpressionNode
      if (unary.operator.toUpperCase() === 'NOT') {
        return BOOLEAN_TYPE
      }
      return inferExprType(unary.operand, scope, state)
    }
    case 'FunctionCall': {
      // 查找函数返回类型
      const fn = expr as FunctionCallNode
      const funcDecl = state.declarations.findFunction(fn.name.name, scope)
      if (funcDecl && funcDecl.returnType) {
        const typeName = funcDecl.returnType.kind === 'SimpleType'
          ? (funcDecl.returnType as any).name.name
          : 'INTEGER'
        return findType(typeName) || INTEGER_TYPE
      }
      return INTEGER_TYPE
    }
    default:
      return INTEGER_TYPE
  }
}