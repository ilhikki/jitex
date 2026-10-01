import * as JsonCode from '@/middle/ir/json-code.ts'
import { Analysis, AnalysisSymbol, TypeInfo } from '@/middle/analysis/analysis-type.ts'
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
  AssertionError,
  callExpr,
  litBool,
  litBytes,
  litChar,
  litField,
  litInt,
  litNull,
  litReal,
  ref,
  syscall,
  SyscallKey,
  syscallKeys,
  WithBinding,
} from './helpers.ts'
import { typeDescLiteral } from './type.ts'

export function loweringExpr(node: ExpressionNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  switch (node.kind) {
    case 'IntegerLiteral':
      return litInt(node.raw)
    case 'RealLiteral':
      return litReal(node.raw)
    case 'StringLiteral':
      return litBytes(node.value)
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
  }
}

function loweringIdentifier(node: IdentifierNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  for (let i = ws.length - 1; i >= 0; i--) {
    const binding = ws[i]
    const fname = node.name.toLowerCase()
    if (binding.fields.has(fname)) {
      return syscall(syscallKeys.recAccess, [
        ref(binding.tempVarId),
        litField(fname),
        typeDescLiteral(binding.typeInfo),
      ])
    }
  }

  const sym = resolveSymbol(node, a, ws)

  if (sym?.kind === 'param' && sym.callable) {
    return syscall(syscallKeys.callIndirect, [ref(sym.varId)])
  }

  if (sym?.kind === 'var' || sym?.kind === 'param') {
    if (sym.isVarParam) {
      return syscall(syscallKeys.cellGet, [ref(sym.varId)])
    }
    return ref(sym.varId)
  }

  if (sym?.kind === 'const') {
    if (sym.typeInfo.tag === 'array') {
      return litBytes(sym.literal.arg)
    }
    if (sym.typeInfo.tag === 'char') {
      return litInt(sym.literal.arg.charCodeAt(0))
    }
    return { kind: 'literal', key: sym.literal.key, arg: sym.literal.arg }
  }

  if (sym?.kind === 'func') {
    return callExpr(sym.funcId, [])
  }

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

  if (name === 'eof' || name === 'eoln') {
    return syscall(callKey(name), [])
  }

  throw new AssertionError(`loweringIdentifier: undefined identifier ${node.name}`)
}

function loweringBinary(node: BinaryExpressionNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const L = loweringExpr(node.left, a, ws)
  const R = loweringExpr(node.right, a, ws)
  const lt = a.typeOf(node.left)
  const rt = a.typeOf(node.right)

  const op = node.operator.toUpperCase()

  const withTypes = (key: SyscallKey): JsonCode.Syscall =>
    syscall(key, [L, typeDescLiteral(lt), R, typeDescLiteral(rt)])

  switch (op) {
    case '+':
      return withTypes(syscallKeys.add)
    case '-':
      return withTypes(syscallKeys.sub)
    case '*':
      return withTypes(syscallKeys.mul)

    case '/':
      return syscall(syscallKeys.div, [L, R])
    case 'DIV':
      return syscall(syscallKeys.intDiv, [L, R])
    case 'MOD':
      return syscall(syscallKeys.mod, [L, R])

    case 'AND':
      return withTypes(syscallKeys.and)
    case 'OR':
      return withTypes(syscallKeys.or)

    case '=':
      return withTypes(syscallKeys.eq)
    case '<>':
      return withTypes(syscallKeys.ne)
    case '<':
      return withTypes(syscallKeys.lt)
    case '<=':
      return withTypes(syscallKeys.le)
    case '>':
      return withTypes(syscallKeys.gt)
    case '>=':
      return withTypes(syscallKeys.ge)
    default:
      throw new AssertionError(`loweringBinary: unknown operator ${op}`)
  }
}

function loweringUnary(node: UnaryExpressionNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const X = loweringExpr(node.operand, a, ws)
  const ti = a.typeOf(node.operand)

  const op = node.operator.toUpperCase()

  const withType = (key: SyscallKey): JsonCode.Syscall => syscall(key, [X, typeDescLiteral(ti)])

  if (op === 'NOT') {
    return withType(syscallKeys.not)
  }
  if (op === '-') {
    return withType(syscallKeys.neg)
  }
  if (op === '+') {
    return X
  }
  throw new AssertionError(`loweringUnary: unknown operator ${op}`)
}

export function callKey(name: string): SyscallKey {
  return `${syscallKeys.callPrefix}${name.toLowerCase()}` as SyscallKey
}

function splitWidthSpec(arg: ExpressionNode): ExpressionNode[] | undefined {
  if (arg.kind !== 'BinaryExpression' || (arg as BinaryExpressionNode).operator !== ':') {
    return undefined
  }
  const outer = arg as BinaryExpressionNode
  if (
    outer.left.kind === 'BinaryExpression' &&
    (outer.left as BinaryExpressionNode).operator === ':'
  ) {
    const inner = outer.left as BinaryExpressionNode
    return [inner.left, inner.right, outer.right]
  }
  return [outer.left, outer.right]
}

export function loweringCallActuals(
  args: ExpressionNode[],
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr[] {
  const out: JsonCode.Expr[] = []
  for (const arg of args) {
    const spec = splitWidthSpec(arg)
    if (spec) {
      out.push(
        syscall(syscallKeys.widthSpec, spec.flatMap((x) => [loweringExpr(x, a, ws), typeDescLiteral(a.typeOf(x))])),
        typeDescLiteral(a.typeOf(arg)),
      )
      continue
    }
    out.push(loweringExpr(arg, a, ws), typeDescLiteral(a.typeOf(arg)))
  }
  return out
}

function loweringFunctionCall(
  node: FunctionCallNode,
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr {
  const sym = resolveSymbol(node.name, a, ws)

  if (sym?.kind === 'param' && sym.callable) {
    const args = node.arguments.map((x) => loweringExpr(x, a, ws))
    return syscall(syscallKeys.callIndirect, [ref(sym.varId), ...args])
  }

  if (sym?.kind === 'func') {
    const info = a.funcInfo(sym.funcId)
    const args = node.arguments.map((x, i) =>
      info.params[i]?.callable ? loweringCallableArgument(x, a, ws) : loweringExpr(x, a, ws)
    )
    return callExpr(sym.funcId, args)
  }

  return syscall(callKey(node.name.name), loweringCallActuals(node.arguments, a, ws))
}

function loweringArrayAccess(node: ArrayAccessNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const arr = loweringExpr(node.array, a, ws)
  const indices = node.indices.map((i) => {
    const expr = loweringExpr(i, a, ws)

    const ti = a.typeOf(i)
    if (ti.tag === 'char') {
      return syscall(callKey('ord'), [expr, typeDescLiteral(ti)])
    }
    return expr
  })
  return syscall(syscallKeys.arrayAccess, [
    arr,
    ...indices,
    typeDescLiteral(a.typeOf(node.array)),
  ])
}

function resolveObjType(node: ExpressionNode, a: Analysis, ws: WithBinding[]): TypeInfo {
  const ti = a.typeOf(node)
  if (ti.tag !== 'unknown') {
    return ti
  }
  if (node.kind === 'ArrayAccess') {
    const base = (node as ArrayAccessNode).array
    if (base.kind === 'Identifier') {
      const sym = resolveSymbol(base as IdentifierNode, a, ws)
      if (sym && (sym.kind === 'var' || sym.kind === 'param') && sym.typeInfo.elem) {
        return sym.typeInfo.elem
      }
    }
    const inner = resolveObjType(base, a, ws)
    if (inner.elem) {
      return inner.elem
    }
  }
  return ti
}

function loweringFieldAccess(node: FieldAccessNode, a: Analysis, ws: WithBinding[]): JsonCode.Expr {
  const objType = resolveObjType(node.object, a, ws)
  const obj = loweringExpr(node.object, a, ws)
  if (node.field.name === '^') {
    if (objType.tag === 'pointer') {
      return syscall(syscallKeys.ptrDeref, [obj])
    }

    return syscall(syscallKeys.filePeek, [obj, typeDescLiteral(objType)])
  }
  return syscall(syscallKeys.recAccess, [
    obj,
    litField(node.field.name.toLowerCase()),
    typeDescLiteral(objType),
  ])
}

function loweringSetConstructor(
  node: SetConstructorNode,
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr {
  const td = typeDescLiteral(a.typeOf(node))
  if (node.elements.length === 0) {
    return syscall(syscallKeys.setEmpty, [td])
  }

  const elems: JsonCode.Expr[] = []
  for (const [start, end] of node.elements) {
    const sExpr = loweringExpr(start, a, ws)
    if (end) {
      const eExpr = loweringExpr(end, a, ws)
      elems.push(syscall(syscallKeys.setRange, [sExpr, eExpr, td]))
    } else {
      elems.push(syscall(syscallKeys.setElem, [sExpr, td]))
    }
  }
  return syscall(syscallKeys.setLiteral, [...elems, td])
}

function loweringInExpression(
  node: InExpressionNode,
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr {
  const L = loweringExpr(node.left, a, ws)
  const R = loweringExpr(node.right, a, ws)

  return syscall(syscallKeys.in, [
    L,
    typeDescLiteral(a.typeOf(node.left)),
    R,
    typeDescLiteral(a.typeOf(node.right)),
  ])
}

export function resolveSymbol(node: IdentifierNode, a: Analysis, _ws: WithBinding[]): AnalysisSymbol | undefined {
  return a.symbolOf(node)
}

export function loweringCallableArgument(
  arg: ExpressionNode,
  a: Analysis,
  ws: WithBinding[],
): JsonCode.Expr {
  if (arg.kind !== 'Identifier') {
    throw new AssertionError('loweringCallableArgument: actual callable parameter must be an identifier')
  }
  const sym = resolveSymbol(arg, a, ws)
  if (sym?.kind === 'func') {
    return ref(sym.funcId)
  }

  if (sym?.kind === 'param' && sym.callable) {
    return ref(sym.varId)
  }
  throw new AssertionError(`loweringCallableArgument: '${arg.name}' is not a procedure/function identifier`)
}
