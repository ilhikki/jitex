/**
 * Pascal 表达式求值器 (M2/M3 - 类型系统 + 复合类型)
 */

import type {
  ArrayAccessNode,
  BinaryExpressionNode,
  BooleanLiteralNode,
  CharLiteralNode,
  ExpressionNode,
  FieldAccessNode,
  FunctionCallNode,
  IdentifierNode,
  InExpressionNode,
  IntegerLiteralNode,
  ParenthesizedExpressionNode,
  RealLiteralNode,
  SetConstructorNode,
  StringLiteralNode,
  UnaryExpressionNode,
} from '../ast/types'
import type { PascalType, PascalValue, Scope, State } from './types'
import { findVarRef, resolveType } from './types'
import {
  arrayGetElement,
  ArrayType,
  binaryOp,
  BOOLEAN_TYPE,
  CHAR_TYPE,
  coerceToType,
  getBigInt,
  getBoolValue,
  getCharCode,
  getNum,
  INTEGER_TYPE,
  LONGINT_TYPE,
  LONGWORD_TYPE,
  makeBoolean,
  makeChar,
  makeInteger,
  makeLongInt,
  makeReal,
  PascalArray,
  PascalRecord,
  REAL_TYPE,
  RecordType,
  SetType,
  SubrangeType,
  unaryOp,
} from './types/pascal-value'
import type { PascalFile } from './io'
import { createFunctionFrame } from './frames'

// ============================================================================
// 主要求值函数
// ============================================================================

export function evalExpr(expr: ExpressionNode, scope: Scope, state: State): PascalValue {
  switch (expr.kind) {
    case 'IntegerLiteral':
      return makeInteger((expr as IntegerLiteralNode).value)

    case 'RealLiteral':
      return makeReal((expr as RealLiteralNode).value)

    case 'StringLiteral': {
      const str = (expr as StringLiteralNode).value
      const chars: number[] = []
      for (let i = 0; i < str.length; i++) {
        chars.push(str.charCodeAt(i) & 0xff)
      }
      const arrayType = new ArrayType(`array[1..${str.length}] of char`, CHAR_TYPE, [
        { low: 1, high: str.length },
      ])
      return { type: arrayType, rawValue: chars }
    }

    case 'CharLiteral':
      return makeChar((expr as CharLiteralNode).value)

    case 'BooleanLiteral':
      return makeBoolean((expr as BooleanLiteralNode).value)

    case 'Identifier':
      return evalIdentifier(expr as IdentifierNode, scope, state)

    case 'BinaryExpression': {
      const bin = expr as BinaryExpressionNode
      const opLower = bin.operator.toLowerCase()
      // Pascal82 短路求值：AND/OR 的右操作数按需计算
      if (opLower === 'and') {
        const left = evalExpr(bin.left, scope, state)
        if (!left) throw new Error(`Left operand of and evaluated to undefined`)
        if (!getBoolValue(left)) return makeBoolean(false)
        const right = evalExpr(bin.right, scope, state)
        if (!right) throw new Error(`Right operand of and evaluated to undefined`)
        return makeBoolean(getBoolValue(right))
      }
      if (opLower === 'or') {
        const left = evalExpr(bin.left, scope, state)
        if (!left) throw new Error(`Left operand of or evaluated to undefined`)
        if (getBoolValue(left)) return makeBoolean(true)
        const right = evalExpr(bin.right, scope, state)
        if (!right) throw new Error(`Right operand of or evaluated to undefined`)
        return makeBoolean(getBoolValue(right))
      }
      const left = evalExpr(bin.left, scope, state)
      const right = evalExpr(bin.right, scope, state)
      if (!left) {
        throw new Error(
          `Left operand of ${bin.operator} evaluated to undefined: ${JSON.stringify(bin.left)}`
        )
      }
      if (!right) {
        throw new Error(
          `Right operand of ${bin.operator} evaluated to undefined: ${JSON.stringify(bin.right)}`
        )
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

    case 'SetConstructor': {
      // Pascal82 集合构造器 [1, 2, 3] 或 [1..3] 或 [1, 3..5]
      // 元素以序数值存入 Set<number>。类型在赋值时由 coerceToType 确定目标类型。
      const ctor = expr as SetConstructorNode
      const result = new Set<number>()
      for (const [startExpr, endExpr] of ctor.elements) {
        const startVal = evalExpr(startExpr, scope, state)
        const startOrd = ordinalOf(startVal)
        if (endExpr === null) {
          result.add(startOrd)
        } else {
          const endVal = evalExpr(endExpr, scope, state)
          const endOrd = ordinalOf(endVal)
          if (startOrd > endOrd) {
            throw new Error(`Invalid set range ${startOrd}..${endOrd}`)
          }
          for (let i = startOrd; i <= endOrd; i++) result.add(i)
        }
      }
      // 临时集合类型：baseType 为 INTEGER，范围 0..255（赋值时由目标类型重新约束）
      const tmpType = new SetType('SET', INTEGER_TYPE, 0, 255)
      return { type: tmpType, rawValue: result }
    }

    case 'InExpression': {
      // Pascal82: expr IN set —— 判断元素是否属于集合
      const inExpr = expr as InExpressionNode
      const elemVal = evalExpr(inExpr.left, scope, state)
      const setVal = evalExpr(inExpr.right, scope, state)
      if (setVal.type.kind !== 'set') {
        throw new Error(`IN operator requires a set on the right, got ${setVal.type.name}`)
      }
      const ord = ordinalOf(elemVal)
      const set = setVal.rawValue as Set<number>
      return makeBoolean(set.has(ord))
    }

    default:
      throw new Error(`Unsupported expression type: ${(expr as { kind: string }).kind}`)
  }
}

/**
 * 计算一个 PascalValue 的序数值（整数用数值，字符用 ASCII 码，布尔用 0/1）。
 * 用于集合元素存储和 IN 运算。
 */
function ordinalOf(v: PascalValue): number {
  switch (v.type.kind) {
    case 'integer':
    case 'subrange':
      return getNum(v)
    case 'char':
      return getCharCode(v)
    case 'boolean':
      return getBoolValue(v) ? 1 : 0
    default:
      throw new Error(`Cannot convert ${v.type.name} to set element ordinal`)
  }
}

// ============================================================================
// 标识符求值
// ============================================================================

function evalIdentifier(expr: IdentifierNode, scope: Scope, state: State): PascalValue {
  const name = expr.name.toUpperCase()
  const value = lookupVariable(name, scope)
  if (value) return value

  // 尝试调用用户定义的函数（无参）
  const funcDecl = state.declarations.findFunction(expr.name, scope)
  if (funcDecl) {
    return evalUserFunctionCall(funcDecl, [], scope, state)
  }

  // 回退到系统函数（无参调用）
  const handler = state.systemFunctions.get(name)
  if (handler) {
    return handler([], scope, state)
  }

  // Pascal82: 未定义标识符必须报错（不能静默返回 0）
  throw new Error(`Unknown identifier: ${expr.name}`)
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
  const indices = access.indices.map((idx) => getNum(evalExpr(idx, scope, state)))
  return arrayGetElement(arr, indices)
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
      return makeChar(state.io.file.bufferChar(file))
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
    // 优先检查 var 绑定：var 参数的值从调用方 scope 读取
    if (s.varBindings && s.varBindings.has(name)) {
      const ref = s.varBindings.get(name)!
      return ref.scope.variables.get(ref.name) || null
    }
    // 检查 WITH 绑定：WITH 语句中的标识符可能是记录字段
    if (s.withRecords && s.withRecords.has(name)) {
      const recordValue = s.withRecords.get(name)!
      const rec = recordValue.rawValue as PascalRecord
      return rec.fields.get(name) || null
    }
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
    // 检查 WITH 绑定的字段类型
    if (s.withRecords && s.withRecords.has(name)) {
      const recordValue = s.withRecords.get(name)!
      const recType = recordValue.type as RecordType
      return recType.fieldTypes.get(name) || null
    }
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
// 内置函数注册
// ============================================================================

export function populateSystemFunctions(state: State): void {
  state.systemFunctions.set('CHR', (args, scope, state) => {
    const arg = evalExpr(args[0], scope, state)
    return makeChar(getNum(arg))
  })
  state.systemFunctions.set('ORD', (args, scope, state) => {
    const arg = evalExpr(args[0], scope, state)
    if (arg.type.kind === 'char') {
      return makeInteger(getCharCode(arg))
    }
    return makeInteger(getNum(arg))
  })
  state.systemFunctions.set('ABS', (args, scope, state) => {
    const arg = evalExpr(args[0], scope, state)
    if (arg.type === LONGINT_TYPE || arg.type === LONGWORD_TYPE) {
      const b = getBigInt(arg)
      return b < 0 ? makeLongInt(-b) : makeLongInt(b)
    }
    const val = getNum(arg)
    return arg.type.kind === 'integer' ? makeInteger(Math.abs(val)) : makeReal(Math.abs(val))
  })
  state.systemFunctions.set('ROUND', (args, scope, state) => {
    const arg = evalExpr(args[0], scope, state)
    return makeInteger(Math.round(getNum(arg)))
  })
  state.systemFunctions.set('TRUNC', (args, scope, state) => {
    const arg = evalExpr(args[0], scope, state)
    return makeInteger(Math.trunc(getNum(arg)))
  })
  state.systemFunctions.set('EOF', (args, scope, state) => {
    if (args.length > 0) {
      const arg = evalExpr(args[0], scope, state)
      if (arg.type.kind === 'file') {
        return makeBoolean(state.io.file.eof(arg.rawValue as PascalFile))
      }
    }
    return makeBoolean(state.io.console.eof())
  })
  state.systemFunctions.set('EOLN', (args, scope, state) => {
    if (args.length > 0) {
      const arg = evalExpr(args[0], scope, state)
      if (arg.type.kind === 'file') {
        return makeBoolean(state.io.file.eoln(arg.rawValue as PascalFile))
      }
    }
    return makeBoolean(state.io.console.eoln())
  })
  state.systemFunctions.set('SQR', (args, scope, state) => {
    const arg = evalExpr(args[0], scope, state)
    const val = getNum(arg)
    return arg.type.kind === 'integer' ? makeInteger(val * val) : makeReal(val * val)
  })
  state.systemFunctions.set('SQRT', (args, scope, state) => {
    const arg = evalExpr(args[0], scope, state)
    return makeReal(Math.sqrt(getNum(arg)))
  })
  state.systemFunctions.set('SIN', (args, scope, state) => {
    const arg = evalExpr(args[0], scope, state)
    return makeReal(Math.sin(getNum(arg)))
  })
  state.systemFunctions.set('COS', (args, scope, state) => {
    const arg = evalExpr(args[0], scope, state)
    return makeReal(Math.cos(getNum(arg)))
  })
  state.systemFunctions.set('LN', (args, scope, state) => {
    const arg = evalExpr(args[0], scope, state)
    return makeReal(Math.log(getNum(arg)))
  })
  state.systemFunctions.set('EXP', (args, scope, state) => {
    const arg = evalExpr(args[0], scope, state)
    return makeReal(Math.exp(getNum(arg)))
  })
  state.systemFunctions.set('PRED', (args, scope, state) => {
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
  })
  state.systemFunctions.set('SUCC', (args, scope, state) => {
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
  })
  state.systemFunctions.set('ODD', (args, scope, state) => {
    const arg = evalExpr(args[0], scope, state)
    return makeBoolean((getNum(arg) & 1) === 1)
  })
}

// ============================================================================
// 函数调用
// ============================================================================

function evalFunctionCall(fn: FunctionCallNode, scope: Scope, state: State): PascalValue {
  const name = fn.name.name.toUpperCase()

  // 优先查找用户定义的函数
  const funcDecl = state.declarations.findFunction(name, scope)
  if (funcDecl && funcDecl.block) {
    return evalUserFunctionCall(funcDecl, fn.arguments, scope, state)
  }

  // 回退到系统函数
  const handler = state.systemFunctions.get(name)
  if (handler) {
    return handler(fn.arguments, scope, state)
  }

  throw new Error(`Unknown function: ${name}`)
}

function evalUserFunctionCall(
  funcDecl: any,
  args: ExpressionNode[],
  scope: Scope,
  state: State
): PascalValue {
  const savedScope = state.currentScope
  const savedReturnValue = state.returnValue
  state.returnValue = null

  // 创建函数帧（参数绑定在 createFunctionFrame 的 init 阶段处理）
  const frame = createFunctionFrame(funcDecl, args)
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
          // var 参数：传递引用（Pascal82 标准）
          // 必须传变量标识符，不能传表达式
          fnScope.variableTypes.set(name, paramType)
          if (argExpr.kind !== 'Identifier') {
            throw new Error(`VAR parameter must be a variable, got ${argExpr.kind}`)
          }
          const varName = (argExpr as IdentifierNode).name.toUpperCase()

          // 检查实参本身是否也是 var 参数（递归传递 var 参数）
          // 如果是，直接复用其引用绑定，确保始终指向原始调用方变量
          const existingRef = findVarRef(varName, callerScope)
          if (existingRef) {
            if (!fnScope.varBindings) fnScope.varBindings = new Map()
            fnScope.varBindings.set(name, existingRef)
            const value = existingRef.scope.variables.get(existingRef.name)
            if (value) fnScope.variables.set(name, value)
          } else {
            const targetScope = findVariableScope(varName, callerScope)
            if (!targetScope) {
              throw new Error(`Unknown variable '${varName}' as VAR parameter`)
            }
            if (!fnScope.varBindings) fnScope.varBindings = new Map()
            fnScope.varBindings.set(name, { scope: targetScope, name: varName })
            const value = targetScope.variables.get(varName)
            if (value) fnScope.variables.set(name, value)
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
    case 'StringLiteral': {
      const len = (expr as StringLiteralNode).value.length
      return new ArrayType(`array[1..${len}] of char`, CHAR_TYPE, [{ low: 1, high: len }])
    }
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
        return (
          (objType as RecordType).fieldTypes.get(access.field.name.toUpperCase()) || INTEGER_TYPE
        )
      }
      return INTEGER_TYPE
    }
    case 'SetConstructor': {
      // 集合构造器的具体类型由赋值目标决定；此处返回通用集合类型
      return new SetType('SET', INTEGER_TYPE, 0, 255)
    }
    case 'InExpression': {
      // IN 运算结果为布尔
      return BOOLEAN_TYPE
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
    case 'array': {
      const arrType = value.type as ArrayType
      if (arrType.elementType.kind === 'char') {
        return (value.rawValue as number[]).map((c) => String.fromCharCode(c)).join('')
      }
      return String(value.rawValue)
    }
    case 'boolean':
      return getBoolValue(value) ? 'TRUE' : 'FALSE'
    case 'subrange': {
      // Pascal82 §6.4.3.2: char/boolean 子界按基类型输出
      const sub = value.type as SubrangeType
      if (sub.baseType.kind === 'char') {
        return String.fromCharCode(value.rawValue as number)
      }
      if (sub.baseType.kind === 'boolean') {
        return value.rawValue ? 'TRUE' : 'FALSE'
      }
      return String(value.rawValue)
    }
    case 'integer':
    case 'real':
      return String(value.rawValue)
    default:
      return String(value.rawValue)
  }
}
