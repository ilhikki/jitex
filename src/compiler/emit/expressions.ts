import type {
  ArrayAccessNode,
  BinaryExpressionNode,
  ExpressionNode,
  FieldAccessNode,
  FunctionCallNode,
  IdentifierNode,
  InExpressionNode,
  SetConstructorNode,
  UnaryExpressionNode,
} from '@/ast/types'
import { BUILTIN_NO_ARG, BUILTIN_SYSCALLS, builtinReturnType, isScalar, Scope } from './utils'
import {
  arrayDimAt,
  arrayElementAfterNIndices,
  isScalarBare,
  recordFieldType,
  scalarBase,
  typeKind,
} from './types'
import type { Compiler } from '@/compiler'

export interface EmitExprResult {
  code: string
  type: string
}

export function emitExpr(compiler: Compiler, node: ExpressionNode, scope: Scope): EmitExprResult {
  switch (node.kind) {
    case 'IntegerLiteral':
      return { code: String((node as any).value), type: 'integer' }
    case 'RealLiteral':
      return { code: String((node as any).value), type: 'real' }
    case 'BooleanLiteral':
      return { code: String((node as any).value), type: 'boolean' }
    case 'StringLiteral': {
      const s = (node as any).value as string
      if (s.length === 1) {
        return { code: `ctx.box('char', ${JSON.stringify(s)})`, type: 'char' }
      }
      return { code: `ctx.box('string', ${JSON.stringify(s)})`, type: 'string' }
    }
    case 'CharLiteral':
      return { code: `ctx.box('char', ${JSON.stringify((node as any).value)})`, type: 'char' }
    case 'Identifier': {
      const name = (node as IdentifierNode).name
      if (compiler.enumConstants.has(name.toUpperCase())) {
        return { code: String(compiler.enumConstants.get(name.toUpperCase())), type: 'integer' }
      }
      const withField = findWithField(compiler, name, scope)
      if (withField) {
        const st = scalarBase(compiler, withField.fieldTypeId)
        const rawCode = `${withField.recordJsName}.raw[${JSON.stringify(name.toUpperCase())}]`
        if (st === 'integer' || st === 'real' || st === 'boolean') {
          return { code: rawCode, type: st }
        }
        return {
          code: `ctx.box(${JSON.stringify(withField.fieldTypeId)}, ${rawCode})`,
          type: withField.fieldTypeId,
        }
      }
      const vi = scope.lookup(name)
      if (!vi) {
        const procInfo = scope.lookupProc(name) || compiler.procs.get(name.toUpperCase())
        if (procInfo && procInfo.isFunction && procInfo.params.length === 0) {
          const actual = procInfo.forwardDef || procInfo
          return { code: `(await ${actual.jsName}(ctx))`, type: actual.returnType }
        }
        const upperName = name.toUpperCase()
        if (BUILTIN_NO_ARG.has(upperName)) {
          const retType = builtinReturnType(upperName)
          if (isScalar(retType) && retType !== 'char' && retType !== 'string') {
            return {
              code: `((await ctx.sysCall(${JSON.stringify(upperName)}, [])).raw)`,
              type: retType,
            }
          }
          return { code: `(await ctx.sysCall(${JSON.stringify(upperName)}, []))`, type: retType }
        }
        throw new Error(`JS VM: undefined variable ${name}`)
      }
      if (vi.isVar && isScalarBare(compiler, vi.typeId)) {
        return { code: `${vi.jsName}.v`, type: vi.typeId }
      }
      return { code: vi.jsName, type: vi.typeId }
    }
    case 'ParenthesizedExpression': {
      const inner = emitExpr(compiler, (node as any).expression, scope)
      return { code: `(${inner.code})`, type: inner.type }
    }
    case 'BinaryExpression':
      return emitBinary(compiler, node as BinaryExpressionNode, scope)
    case 'UnaryExpression':
      return emitUnary(compiler, node as UnaryExpressionNode, scope)
    case 'FunctionCall':
      return emitFunctionCall(compiler, node as FunctionCallNode, scope)
    case 'ArrayAccess':
      return emitArrayAccess(compiler, node as ArrayAccessNode, scope)
    case 'FieldAccess':
      return emitFieldAccess(compiler, node as FieldAccessNode, scope)
    case 'SetConstructor':
      return emitSetConstructor(compiler, node as SetConstructorNode, scope)
    case 'InExpression':
      return emitInExpression(compiler, node as InExpressionNode, scope)
    default:
      throw new Error(`JS VM: unsupported expression ${(node as any).kind}`)
  }
}

export function emitArrayAccess(
  compiler: Compiler,
  node: ArrayAccessNode,
  scope: Scope
): EmitExprResult {
  const arr = emitExpr(compiler, node.array, scope)
  const elemTypeId = arrayElementAfterNIndices(compiler, arr.type, node.indices.length)
  if (!elemTypeId) throw new Error(`JS VM: ${arr.type} is not indexable`)
  const idxCodes: string[] = []
  for (let i = 0; i < node.indices.length; i++) {
    const idxExpr = node.indices[i]
    const idx = emitExpr(compiler, idxExpr, scope)
    let idxCode = toInt(compiler, idx.code, idx.type)
    const d = arrayDimAt(compiler, arr.type, i)
    if (d) {
      idxCode = `ctx.checkArrayIndex(${idxCode}, ${d.low}, ${d.high})`
    }
    idxCodes.push(idxCode)
  }
  let code = `${arr.code}.raw`
  for (const idxCode of idxCodes) {
    code += `[${idxCode}]`
  }
  const st = scalarBase(compiler, elemTypeId)
  if (st === 'integer' || st === 'real' || st === 'boolean') {
    return { code, type: st }
  }
  return { code: `ctx.box(${JSON.stringify(elemTypeId)}, ${code})`, type: elemTypeId }
}

export function emitFieldAccess(
  compiler: Compiler,
  node: FieldAccessNode,
  scope: Scope
): EmitExprResult {
  const obj = emitExpr(compiler, node.object, scope)
  const fieldName = node.field.name.toUpperCase()
  if (fieldName === '^') {
    if (obj.type === 'text' || obj.type === 'file-of-char') {
      return {
        code: `ctx.box('char', ctx.io ? String.fromCharCode(await ctx.io.file.bufferChar(${obj.code}.raw)) : ' ')`,
        type: 'char',
      }
    }
    throw new Error(`JS VM: F^ on ${obj.type} not supported yet`)
  }
  const fieldTypeId = recordFieldType(compiler, obj.type, fieldName)
  if (!fieldTypeId) throw new Error(`JS VM: record ${obj.type} has no field ${fieldName}`)
  const rawCode = `${obj.code}.raw[${JSON.stringify(fieldName)}]`
  const st = scalarBase(compiler, fieldTypeId)
  if (st === 'integer' || st === 'real' || st === 'boolean') {
    return { code: rawCode, type: st }
  }
  return { code: `ctx.box(${JSON.stringify(fieldTypeId)}, ${rawCode})`, type: fieldTypeId }
}

export function emitSetConstructor(
  compiler: Compiler,
  node: SetConstructorNode,
  scope: Scope
): EmitExprResult {
  const elems: string[] = []
  for (const [start, end] of node.elements) {
    const s = emitExpr(compiler, start, scope)
    if (end) {
      const e = emitExpr(compiler, end, scope)
      elems.push(
        `...Array.from({length: (${e.code}) - (${s.code}) + 1}, (_, i) => i + (${s.code}))`
      )
    } else {
      elems.push(toInt(compiler, s.code, s.type))
    }
  }
  return { code: `ctx.box('set', new Set([${elems.join(', ')}]))`, type: 'set' }
}

export function emitInExpression(
  compiler: Compiler,
  node: InExpressionNode,
  scope: Scope
): EmitExprResult {
  const l = emitExpr(compiler, node.left, scope)
  const r = emitExpr(compiler, node.right, scope)
  return { code: `(${r.code}).raw.has(${toInt(compiler, l.code, l.type)})`, type: 'boolean' }
}

export function emitBinary(
  compiler: Compiler,
  node: BinaryExpressionNode,
  scope: Scope
): EmitExprResult {
  const L = emitExpr(compiler, node.left, scope)
  const R = emitExpr(compiler, node.right, scope)
  const op = node.operator.toUpperCase()
  const resultType = binaryResultType(compiler, op, L.type, R.type)
  const isStrChar = (t: string) => t === 'string' || t === 'char'

  switch (op) {
    case '+':
    case '-':
    case '*': {
      if (typeKind(compiler, resultType) === 'set') {
        if (op === '+') {
          return {
            code: `ctx.box(${JSON.stringify(resultType)}, new Set([...${L.code}.raw, ...${R.code}.raw]))`,
            type: resultType,
          }
        }
        if (op === '*') {
          return {
            code: `ctx.box(${JSON.stringify(resultType)}, new Set([...${L.code}.raw].filter(x => ${R.code}.raw.has(x))))`,
            type: resultType,
          }
        }
        return {
          code: `ctx.box(${JSON.stringify(resultType)}, new Set([...${L.code}.raw].filter(x => !${R.code}.raw.has(x))))`,
          type: resultType,
        }
      }
      if (resultType === 'integer') {
        return { code: `((${L.code}) ${op} (${R.code})) | 0`, type: 'integer' }
      }
      if (resultType === 'real') {
        return { code: `((${L.code}) ${op} (${R.code}))`, type: 'real' }
      }
      if (resultType === 'string') {
        return { code: `ctx.box('string', (${L.code}).raw + (${R.code}).raw)`, type: 'string' }
      }
      throw new Error(`JS VM: unsupported + for ${L.type}/${R.type}`)
    }
    case '/':
      return { code: `((${L.code}) / (${R.code}))`, type: 'real' }
    case 'DIV':
      return {
        code: `(() => { const __d = ${R.code}; if (__d === 0) throw new Error('JS VM: division by zero'); return (Math.trunc((${L.code}) / __d)) | 0 })()`,
        type: 'integer',
      }
    case 'MOD':
      return {
        code: `(() => { const __m = ${R.code}; if (__m === 0) throw new Error('JS VM: division by zero'); const __l = ${L.code}; return (__l - Math.trunc(__l / __m) * __m) | 0 })()`,
        type: 'integer',
      }
    case '=':
    case '<>':
    case '<':
    case '<=':
    case '>':
    case '>=': {
      const jsOp = op === '=' ? '===' : op === '<>' ? '!==' : op
      if (isStrChar(L.type) || isStrChar(R.type)) {
        return { code: `((${L.code}).raw ${jsOp} (${R.code}).raw)`, type: 'boolean' }
      }
      return { code: `((${L.code}) ${jsOp} (${R.code}))`, type: 'boolean' }
    }
    case 'AND':
      if (resultType === 'boolean') return { code: `((${L.code}) && (${R.code}))`, type: 'boolean' }
      return { code: `((${L.code}) & (${R.code}))`, type: 'integer' }
    case 'OR':
      if (resultType === 'boolean') return { code: `((${L.code}) || (${R.code}))`, type: 'boolean' }
      return { code: `((${L.code}) | (${R.code}))`, type: 'integer' }
    default:
      throw new Error(`JS VM: unsupported binary operator ${op}`)
  }
}

export function emitUnary(
  compiler: Compiler,
  node: UnaryExpressionNode,
  scope: Scope
): EmitExprResult {
  const operand = emitExpr(compiler, node.operand, scope)
  const op = node.operator.toUpperCase()
  switch (op) {
    case '-':
      if (operand.type === 'integer') return { code: `(-(${operand.code})) | 0`, type: 'integer' }
      return { code: `(-(${operand.code}))`, type: 'real' }
    case '+':
      return operand
    case 'NOT':
      if (operand.type === 'boolean') return { code: `(!(${operand.code}))`, type: 'boolean' }
      return { code: `(~(${operand.code}))`, type: 'integer' }
    default:
      throw new Error(`JS VM: unsupported unary operator ${op}`)
  }
}

export function emitFunctionCall(
  compiler: Compiler,
  node: FunctionCallNode,
  scope: Scope
): EmitExprResult {
  const name = node.name.name.toUpperCase()
  if (BUILTIN_SYSCALLS.has(name)) {
    const argExprs = node.arguments.map((a) => emitExpr(compiler, a, scope))
    const args = argExprs.map((e) => emitArgFromExpr(e))
    const firstArgType = argExprs[0]?.type
    const retType = builtinReturnType(name, firstArgType)
    if (isScalar(retType) && retType !== 'char' && retType !== 'string') {
      return {
        code: `((await ctx.sysCall(${JSON.stringify(name)}, [${args.join(', ')}])).raw)`,
        type: retType,
      }
    }
    return {
      code: `(await ctx.sysCall(${JSON.stringify(name)}, [${args.join(', ')}]))`,
      type: retType,
    }
  }
  const info = scope.lookupProc(name) || compiler.procs.get(name)
  if (!info || !info.isFunction) throw new Error(`JS VM: unknown function ${node.name.name}`)
  const args = node.arguments.map((a, i) => {
    const pType = info.params[i]?.typeId || 'integer'
    const e = emitExpr(compiler, a, scope)
    return coerce(compiler, e.code, e.type, pType)
  })
  return { code: `(await ${info.jsName}(ctx, ${args.join(', ')}))`, type: info.returnType }
}

export function emitArg(compiler: Compiler, node: ExpressionNode, scope: Scope): string {
  const e = emitExpr(compiler, node, scope)
  return emitArgFromExpr(e)
}

export function emitArgFromExpr(e: EmitExprResult): string {
  if (e.type === 'integer') return `ctx.box('integer', ${e.code})`
  if (e.type === 'real') return `ctx.box('real', ${e.code})`
  if (e.type === 'boolean') return `ctx.box('boolean', ${e.code})`
  return e.code
}

export function inferType(compiler: Compiler, node: ExpressionNode, scope: Scope): string {
  switch (node.kind) {
    case 'IntegerLiteral':
      return 'integer'
    case 'RealLiteral':
      return 'real'
    case 'BooleanLiteral':
      return 'boolean'
    case 'StringLiteral': {
      const s = (node as any).value as string
      return s.length === 1 ? 'char' : 'string'
    }
    case 'CharLiteral':
      return 'char'
    case 'Identifier': {
      const vi = scope.lookup((node as IdentifierNode).name)
      return vi ? vi.typeId : 'integer'
    }
    case 'ParenthesizedExpression':
      return inferType(compiler, (node as any).expression, scope)
    case 'BinaryExpression':
      return binaryResultType(
        compiler,
        (node as BinaryExpressionNode).operator.toUpperCase(),
        inferType(compiler, (node as BinaryExpressionNode).left, scope),
        inferType(compiler, (node as BinaryExpressionNode).right, scope)
      )
    case 'UnaryExpression': {
      const u = node as UnaryExpressionNode
      return inferType(compiler, u.operand, scope)
    }
    case 'FunctionCall': {
      const fc = node as FunctionCallNode
      const argType =
        fc.arguments.length > 0 ? inferType(compiler, fc.arguments[0], scope) : undefined
      return builtinReturnType(fc.name.name.toUpperCase(), argType)
    }
    default:
      return 'integer'
  }
}

export function binaryResultType(compiler: Compiler, op: string, lt: string, rt: string): string {
  if (typeKind(compiler, lt) === 'set' && typeKind(compiler, rt) === 'set') {
    if (op === '+' || op === '-' || op === '*') return lt
  }
  switch (op) {
    case '+':
    case '-':
    case '*':
      if (lt === 'real' || rt === 'real') return 'real'
      if (lt === 'string' || rt === 'string') return 'string'
      return 'integer'
    case '/':
      return 'real'
    case 'DIV':
    case 'MOD':
    case 'AND':
    case 'OR':
      if (op === 'AND' || op === 'OR') {
        if (lt === 'boolean' && rt === 'boolean') return 'boolean'
        return 'integer'
      }
      return 'integer'
    case '=':
    case '<>':
    case '<':
    case '<=':
    case '>':
    case '>=':
      return 'boolean'
    default:
      return 'integer'
  }
}

export function coerce(compiler: Compiler, code: string, fromType: string, toType: string): string {
  if (fromType === toType) return code
  if (toType === 'integer') return toInt(compiler, code, fromType)
  if (toType === 'real') return `(+${code})`
  if (toType === 'boolean') return toBool(compiler, code, fromType)
  return code
}

export function toInt(compiler: Compiler, code: string, fromType: string): string {
  if (fromType === 'integer') return `(${code}) | 0`
  if (fromType === 'real') return `Math.trunc(${code}) | 0`
  if (fromType === 'boolean') return `(${code} ? 1 : 0)`
  if (fromType === 'char') return `(${code}.raw.charCodeAt(0)) | 0`
  return code
}

export function toBool(compiler: Compiler, code: string, fromType: string): string {
  if (fromType === 'boolean') return code
  if (fromType === 'integer') return `(${code} !== 0)`
  return `Boolean(${code})`
}

export function findWithField(
  compiler: Compiler,
  name: string,
  scope: Scope
): { recordJsName: string; fieldTypeId: string } | null {
  const upper = name.toUpperCase()
  for (const wr of scope.allWithRecords()) {
    const fieldTypeId = recordFieldType(compiler, wr.typeId, upper)
    if (fieldTypeId) {
      return { recordJsName: wr.jsName, fieldTypeId }
    }
  }
  return null
}
