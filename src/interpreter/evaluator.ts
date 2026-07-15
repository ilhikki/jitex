/**
 * Pascal 表达式求值器 (M2/M3 - 类型系统 + 复合类型)
 */

import type { ExpressionNode } from '../ast/types'
import type { State, Scope, PascalValue, PascalType } from './types'
import {
  binaryOp,
  unaryOp,
  makeInteger,
  makeReal,
  makeChar,
  makeBoolean,
  makeString,
  makeDefaultValue,
  makeLongInt,
  findType,
  coerceToType,
  INTEGER_TYPE,
  REAL_TYPE,
  CHAR_TYPE,
  BOOLEAN_TYPE,
  STRING_TYPE,
  BYTE_TYPE,
  LONGINT_TYPE,
  LONGWORD_TYPE,
  ArrayType,
  RecordType,
  FileType,
  createEmptyFile,
  arrayIndex,
  getNum,
  getCharCode,
  getBoolValue,
  getStringChars,
  getBigInt,
  PascalArray,
  PascalRecord,
  PascalFile,
  fileBufferChar,
  fileEof,
  fileEoln,
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
  ArrayAccessNode,
  FieldAccessNode,
  ParenthesizedExpressionNode,
  VariableDeclarationNode,
} from '../ast/types'
import { createScope, resolveType } from './types'
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

    case 'Identifier':
      return evalIdentifier(expr as IdentifierNode, scope, state)

    case 'BinaryExpression': {
      const bin = expr as BinaryExpressionNode
      const left = evalExpr(bin.left, scope, state)
      const right = evalExpr(bin.right, scope, state)
      if (!left) {
        throw new Error(`Left operand of ${bin.operator} evaluated to undefined: ${JSON.stringify(bin.left)}`)
      }
      if (!right) {
        throw new Error(`Right operand of ${bin.operator} evaluated to undefined: ${JSON.stringify(bin.right)}`)
      }
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

    case 'ArrayAccess': {
      const access = expr as ArrayAccessNode
      return evalArrayRead(access, scope, state)
    }

    case 'FieldAccess': {
      const access = expr as FieldAccessNode
      return evalFieldRead(access, scope, state)
    }

    case 'ParenthesizedExpression': {
      const paren = expr as ParenthesizedExpressionNode
      return evalExpr(paren.expression, scope, state)
    }

    default:
      throw new Error(`Unsupported expression type: ${expr.kind}`)
  }
}

// ============================================================================
// 标识符求值
// ============================================================================

function evalIdentifier(expr: IdentifierNode, scope: Scope, state: State): PascalValue {
  const name = expr.name.toUpperCase()
  const value = lookupVariable(name, scope)
  if (value) return value

  // 尝试作为无参内置函数调用
  const builtinResult = evalBuiltin(name, [], scope, state)
  if (builtinResult) return builtinResult

  // 尝试调用用户定义的函数（无参）
  const funcDecl = state.declarations.findFunction(expr.name, scope)
  if (funcDecl) {
    return evalUserFunctionCall(funcDecl, [], scope, state)
  }

  // 未找到，返回默认整数
  return makeInteger(0)
}

// ============================================================================
// 数组读取
// ============================================================================

function evalArrayRead(access: ArrayAccessNode, scope: Scope, state: State): PascalValue {
  const arrValue = evalLValueBase(access.array, scope, state)
  if (arrValue.type.kind !== 'array') {
    throw new Error(`Array access on non-array type ${arrValue.type.name}`)
  }

  const arr = arrValue.rawValue as PascalArray
  const indices = access.indices.map(idx => getNum(evalExpr(idx, scope, state)))
  const flatIndex = arrayIndex(arr, indices)
  return arr.elements[flatIndex]
}

// ============================================================================
// 字段读取
// ============================================================================

function evalFieldRead(access: FieldAccessNode, scope: Scope, state: State): PascalValue {
  const objValue = evalLValueBase(access.object, scope, state)
  if (objValue.type.kind === 'file') {
    const fieldName = access.field.name
    if (fieldName === '^') {
      const file = objValue.rawValue as PascalFile
      return makeChar(fileBufferChar(file))
    }
    throw new Error(`Unknown file field: ${fieldName}`)
  }

  if (objValue.type.kind !== 'record') {
    throw new Error(`Field access on non-record type ${objValue.type.name}`)
  }

  const rec = objValue.rawValue as PascalRecord
  const fieldName = access.field.name.toUpperCase()
  const value = rec.fields.get(fieldName)
  if (!value) {
    throw new Error(`Unknown field: ${access.field.name}`)
  }
  return value
}

// ============================================================================
// 左值基址求值（用于数组/字段访问）
// ============================================================================

function evalLValueBase(expr: ExpressionNode, scope: Scope, state: State): PascalValue {
  if (expr.kind === 'Identifier') {
    const value = lookupVariable((expr as IdentifierNode).name.toUpperCase(), scope)
    if (!value) {
      throw new Error(`Unknown variable: ${(expr as IdentifierNode).name}`)
    }
    return value
  }
  if (expr.kind === 'FieldAccess') {
    return evalFieldRead(expr as FieldAccessNode, scope, state)
  }
  if (expr.kind === 'ArrayAccess') {
    return evalArrayRead(expr as ArrayAccessNode, scope, state)
  }
  if (expr.kind === 'ParenthesizedExpression') {
    return evalLValueBase((expr as ParenthesizedExpressionNode).expression, scope, state)
  }
  throw new Error(`Unsupported lvalue base: ${expr.kind}`)
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

export function findVariableScope(name: string, scope: Scope): Scope | null {
  let s: Scope | null = scope
  while (s) {
    if (s.variables.has(name)) {
      return s
    }
    s = s.parent
  }
  return null
}

function hasVariable(name: string, scope: Scope): boolean {
  return findVariableScope(name, scope) !== null
}

// ============================================================================
// 内置函数
// ============================================================================

function evalBuiltin(name: string, args: ExpressionNode[], scope: Scope, state: State): PascalValue | null {
  switch (name) {
    case 'CHR': {
      const arg = evalExpr(args[0], scope, state)
      return makeChar(getNum(arg))
    }
    case 'ORD': {
      const arg = evalExpr(args[0], scope, state)
      if (arg.type.kind === 'char') {
        return makeInteger(getCharCode(arg))
      }
      return makeInteger(getNum(arg))
    }
    case 'ABS': {
      const arg = evalExpr(args[0], scope, state)
      if (arg.type === LONGINT_TYPE || arg.type === LONGWORD_TYPE) {
        const b = getBigInt(arg)
        return b < 0 ? makeLongInt(-b) : makeLongInt(b)
      }
      const val = getNum(arg)
      return arg.type.kind === 'integer' ? makeInteger(Math.abs(val)) : makeReal(Math.abs(val))
    }
    case 'ROUND': {
      const arg = evalExpr(args[0], scope, state)
      return makeInteger(Math.round(getNum(arg)))
    }
    case 'TRUNC': {
      const arg = evalExpr(args[0], scope, state)
      return makeInteger(Math.trunc(getNum(arg)))
    }
    case 'EOF': {
      if (args.length > 0) {
        const arg = evalExpr(args[0], scope, state)
        if (arg.type.kind === 'file') {
          return makeBoolean(fileEof(arg.rawValue as PascalFile))
        }
      }
      return makeBoolean(state.inputQueue.length === 0)
    }
    case 'EOLN': {
      if (args.length > 0) {
        const arg = evalExpr(args[0], scope, state)
        if (arg.type.kind === 'file') {
          return makeBoolean(fileEoln(arg.rawValue as PascalFile))
        }
      }
      return makeBoolean(state.inputQueue.length === 0 || state.inputQueue[0] === '\n')
    }
    case 'SQR': {
      const arg = evalExpr(args[0], scope, state)
      const val = getNum(arg)
      return arg.type.kind === 'integer' ? makeInteger(val * val) : makeReal(val * val)
    }
    case 'SQRT': {
      const arg = evalExpr(args[0], scope, state)
      return makeReal(Math.sqrt(getNum(arg)))
    }
    case 'SIN': {
      const arg = evalExpr(args[0], scope, state)
      return makeReal(Math.sin(getNum(arg)))
    }
    case 'COS': {
      const arg = evalExpr(args[0], scope, state)
      return makeReal(Math.cos(getNum(arg)))
    }
    case 'LN': {
      const arg = evalExpr(args[0], scope, state)
      return makeReal(Math.log(getNum(arg)))
    }
    case 'EXP': {
      const arg = evalExpr(args[0], scope, state)
      return makeReal(Math.exp(getNum(arg)))
    }
    case 'PRED': {
      const arg = evalExpr(args[0], scope, state)
      if (arg.type.kind === 'integer') {
        const val = getNum(arg)
        return arg.type === LONGINT_TYPE || arg.type === LONGWORD_TYPE
          ? makeLongInt(BigInt(val) - BigInt(1))
          : makeInteger(val - 1)
      }
      if (arg.type.kind === 'char') {
        return makeChar(getCharCode(arg) - 1)
      }
      throw new Error('PRED requires ordinal type')
    }
    case 'SUCC': {
      const arg = evalExpr(args[0], scope, state)
      if (arg.type.kind === 'integer') {
        const val = getNum(arg)
        return arg.type === LONGINT_TYPE || arg.type === LONGWORD_TYPE
          ? makeLongInt(BigInt(val) + BigInt(1))
          : makeInteger(val + 1)
      }
      if (arg.type.kind === 'char') {
        return makeChar(getCharCode(arg) + 1)
      }
      throw new Error('SUCC requires ordinal type')
    }
    case 'ODD': {
      const arg = evalExpr(args[0], scope, state)
      return makeBoolean((getNum(arg) & 1) === 1)
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
    funcDecl.block.variableDeclarations.forEach((v: VariableDeclarationNode) => {
      const varType = resolveType(v.type, state)
      v.names.forEach(n => {
        const name = n.name.toUpperCase()
        fnScope.variables.set(name, makeDefaultValue(varType))
        fnScope.variableTypes.set(name, varType)
      })
    })
  }

  // 传递参数
  bindArguments(funcDecl.parameters, args, fnScope, scope, state)

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

export function bindArguments(
  parameters: any[],
  args: ExpressionNode[],
  fnScope: Scope,
  callerScope: Scope,
  state: State
): void {
  let argIndex = 0
  for (const param of parameters) {
    const paramType = resolveType(param.type, state)
    const isVar = param.isVar || false

    for (const nameNode of param.names) {
      if (argIndex < args.length) {
        const argExpr = args[argIndex]
        const name = nameNode.name.toUpperCase()

        if (isVar) {
          // var 参数：传递引用（通过左值寻址）
          fnScope.variableTypes.set(name, paramType)
          // 对于简单变量 var 参数，我们直接复制当前值，但标记为引用
          // 更严格的实现需要左值引用对象
          if (argExpr.kind === 'Identifier') {
            const varName = (argExpr as IdentifierNode).name.toUpperCase()
            const value = lookupVariable(varName, callerScope)
            if (value) {
              fnScope.variables.set(name, value)
            }
          }
        } else {
          // 值参：求值并复制
          const argValue = evalExpr(argExpr, callerScope, state)
          fnScope.variables.set(name, coerceToType(argValue, paramType))
          fnScope.variableTypes.set(name, paramType)
        }
        argIndex++
      }
    }
  }
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
      return lookupVariableType(name, scope) || INTEGER_TYPE
    }
    case 'BinaryExpression': {
      const bin = expr as BinaryExpressionNode
      if (['=', '<>', '<', '<=', '>', '>='].includes(bin.operator)) {
        return BOOLEAN_TYPE
      }
      if (bin.operator.toUpperCase() === 'AND' || bin.operator.toUpperCase() === 'OR') {
        return BOOLEAN_TYPE
      }
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
      const fn = expr as FunctionCallNode
      const funcDecl = state.declarations.findFunction(fn.name.name, scope)
      if (funcDecl && funcDecl.returnType) {
        return resolveType(funcDecl.returnType, state)
      }
      return INTEGER_TYPE
    }
    case 'ArrayAccess': {
      const access = expr as ArrayAccessNode
      const arrType = inferExprType(access.array, scope, state)
      if (arrType.kind === 'array') {
        return (arrType as ArrayType).elementType
      }
      return INTEGER_TYPE
    }
    case 'FieldAccess': {
      const access = expr as FieldAccessNode
      const objType = inferExprType(access.object, scope, state)
      if (objType.kind === 'record') {
        return (objType as RecordType).fieldTypes.get(access.field.name.toUpperCase()) || INTEGER_TYPE
      }
      return INTEGER_TYPE
    }
    default:
      return INTEGER_TYPE
  }
}

// ============================================================================
// 辅助函数：输出格式化
// ============================================================================

export function formatValue(value: PascalValue): string {
  switch (value.type.kind) {
    case 'char':
      return String.fromCharCode(getCharCode(value))
    case 'string':
      return getStringChars(value).map(c => String.fromCharCode(c)).join('')
    case 'boolean':
      return getBoolValue(value) ? 'TRUE' : 'FALSE'
    case 'integer':
    case 'real':
    case 'subrange':
      return String(value.rawValue)
    default:
      return String(value.rawValue)
  }
}
