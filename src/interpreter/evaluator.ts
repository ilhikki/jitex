import type {
  ExpressionNode,
  IntegerLiteralNode,
  RealLiteralNode,
  StringLiteralNode,
  CharLiteralNode,
  BooleanLiteralNode,
  IdentifierNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  FunctionCallNode,
  ArrayAccessNode,
  FieldAccessNode,
  ParenthesizedExpressionNode,
  InExpressionNode,
} from '../ast/types'
import type { Scope, Value, State } from './types'

export function evalExpr(expr: ExpressionNode, scope: Scope, state: State): Value {
  switch (expr.kind) {
    case 'IntegerLiteral':
      return (expr as IntegerLiteralNode).value

    case 'RealLiteral':
      return (expr as RealLiteralNode).value

    case 'StringLiteral':
      return (expr as StringLiteralNode).value

    case 'CharLiteral':
      return (expr as CharLiteralNode).value

    case 'BooleanLiteral':
      return (expr as BooleanLiteralNode).value

    case 'Identifier': {
      const name = (expr as IdentifierNode).name.toUpperCase()
      const varValue = lookupVariable(name, scope)
      if (varValue !== 0 || hasVariable(name, scope)) {
        return varValue
      }
      const builtinResult = evalBuiltin(name, [], scope, state)
      if (builtinResult !== undefined) {
        return builtinResult
      }
      const funcDecl = state.declarations.findFunction((expr as IdentifierNode).name, scope)
      if (funcDecl) {
        const savedReturnValue = state.returnValue
        state.returnValue = null
        const fnScope = createScope(scope, funcDecl)
        const savedScope = state.currentScope
        state.currentScope = fnScope

        if (funcDecl.block) {
          funcDecl.block.variableDeclarations.forEach(v => {
            v.names.forEach(n => {
              fnScope.variables.set(n.name.toUpperCase(), 0)
            })
          })
        }

        const frame = createFunctionCallFrame(funcDecl, [], state)
        state.stack.push(frame)

        while (state.stack.length > 0 && !frame.done) {
          const top = state.stack[state.stack.length - 1]
          top.step(state)
          while (state.stack.length > 0 && state.stack[state.stack.length - 1].done) {
            state.stack.pop()
          }
        }

        const result = state.returnValue ?? 0
        state.returnValue = savedReturnValue
        state.currentScope = savedScope
        return result
      }
      return varValue
    }

    case 'BinaryExpression': {
      const bin = expr as BinaryExpressionNode
      const left = evalExpr(bin.left, scope, state)
      const right = evalExpr(bin.right, scope, state)
      return evalBinary(bin.operator, left, right)
    }

    case 'UnaryExpression': {
      const un = expr as UnaryExpressionNode
      const operand = evalExpr(un.operand, scope, state)
      return evalUnary(un.operator, operand)
    }

    case 'FunctionCall': {
      const fn = expr as FunctionCallNode
      return evalFunctionCall(fn, scope, state)
    }

    case 'ArrayAccess': {
      const arr = expr as ArrayAccessNode
      const _arrayValue = evalExpr(arr.array, scope, state)
      const _indices = arr.indices.map(i => evalExpr(i, scope, state))
      return 0
    }

    case 'FieldAccess': {
      const fa = expr as FieldAccessNode
      const _obj = evalExpr(fa.object, scope, state)
      return 0
    }

    case 'ParenthesizedExpression': {
      const pe = expr as ParenthesizedExpressionNode
      return evalExpr(pe.expression, scope, state)
    }

    case 'InExpression': {
      const ie = expr as InExpressionNode
      const left = evalExpr(ie.left, scope, state)
      const right = evalExpr(ie.right, scope, state)
      return false
    }

    default:
      return 0
  }
}

function lookupVariable(name: string, scope: Scope): Value {
  let s: Scope | null = scope
  while (s) {
    if (s.variables.has(name)) {
      return s.variables.get(name)!
    }
    s = s.parent
  }
  return 0
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

function evalBinary(operator: string, left: Value, right: Value): Value {
  const op = operator.toUpperCase()

  switch (op) {
    case '+':
      return (left as number) + (right as number)
    case '-':
      return (left as number) - (right as number)
    case '*':
      return (left as number) * (right as number)
    case '/':
      return (left as number) / (right as number)
    case 'DIV':
      return Math.floor((left as number) / (right as number))
    case 'MOD':
      return (left as number) % (right as number)

    case 'AND':
      return Boolean(left) && Boolean(right)
    case 'OR':
      return Boolean(left) || Boolean(right)

    case '=':
      return left === right
    case '<>':
      return left !== right
    case '<':
      return (left as number) < (right as number)
    case '<=':
      return (left as number) <= (right as number)
    case '>':
      return (left as number) > (right as number)
    case '>=':
      return (left as number) >= (right as number)

    default:
      return 0
  }
}

function evalUnary(operator: string, operand: Value): Value {
  const op = operator.toUpperCase()

  switch (op) {
    case '+':
      return operand
    case '-':
      return -(operand as number)
    case 'NOT':
      return !Boolean(operand)

    default:
      return operand
  }
}

function evalBuiltin(name: string, args: ExpressionNode[], scope: Scope, state: State): Value | undefined {
  switch (name) {
    case 'CHR': {
      const code = evalExpr(args[0], scope, state) as number
      return String.fromCharCode(code)
    }
    case 'ORD': {
      const str = evalExpr(args[0], scope, state) as string
      return str.charCodeAt(0)
    }
    case 'ABS': {
      const val = evalExpr(args[0], scope, state) as number
      return Math.abs(val)
    }
    case 'ROUND': {
      const val = evalExpr(args[0], scope, state) as number
      return Math.round(val)
    }
    case 'TRUNC': {
      const val = evalExpr(args[0], scope, state) as number
      return Math.trunc(val)
    }
    case 'EOF':
      return state.inputQueue.length === 0
    case 'EOLN':
      return state.inputQueue.length === 0 || state.inputQueue[0] === '\n'
    default:
      return undefined
  }
}

function evalFunctionCall(fn: FunctionCallNode, scope: Scope, state: State): Value {
  const name = fn.name.name.toUpperCase()

  const builtinResult = evalBuiltin(name, fn.arguments, scope, state)
  if (builtinResult !== undefined) {
    return builtinResult
  }

  const funcDecl = state.declarations.findFunction(name, scope)
  if (funcDecl && funcDecl.block) {
    const fnScope = createScope(scope, funcDecl)
    const savedScope = state.currentScope
    state.currentScope = fnScope

    const savedReturnValue = state.returnValue
    state.returnValue = null

    funcDecl.block.variableDeclarations.forEach(v => {
      v.names.forEach(n => {
        fnScope.variables.set(n.name.toUpperCase(), 0)
      })
    })

    let argIndex = 0
    for (const param of funcDecl.parameters) {
      for (const nameNode of param.names) {
        if (argIndex < fn.arguments.length) {
          const argValue = evalExpr(fn.arguments[argIndex], scope, state)
          fnScope.variables.set(nameNode.name.toUpperCase(), argValue)
          argIndex++
        }
      }
    }

    const frame = createFunctionCallFrame(funcDecl, fn.arguments, state)
    state.stack.push(frame)

    while (state.stack.length > 0 && !frame.done) {
      const top = state.stack[state.stack.length - 1]
      top.step(state)
      while (state.stack.length > 0 && state.stack[state.stack.length - 1].done) {
        state.stack.pop()
      }
    }

    const result = state.returnValue
    state.returnValue = savedReturnValue
    state.currentScope = savedScope

    return result ?? 0
  }

  return 0
}

import { createScope } from './types'
import type { FunctionDeclarationNode } from '../ast/types'
import { createCompoundFrame } from './frames'

function createFunctionCallFrame(
  decl: FunctionDeclarationNode,
  _args: ExpressionNode[],
  state: State
): Frame {
  let phase: 'init' | 'running' = 'init'

  return {
    kind: 'FunctionCall',
    done: false,
    step(state: State) {
      if (phase === 'init') {
        if (decl.block) {
          state.stack.push(createCompoundFrame(decl.block.compound))
        }
        phase = 'running'
        return
      }
      this.done = true
    },
  }
}

import type { Frame } from './types'

export function evalCondition(expr: ExpressionNode, scope: Scope, state: State): boolean {
  const value = evalExpr(expr, scope, state)
  return Boolean(value)
}
