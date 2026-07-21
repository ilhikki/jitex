import type {
  BlockNode,
  ConstDeclarationNode,
  FunctionDeclarationNode,
  ParameterDeclarationNode,
  ProcedureDeclarationNode,
  VariableDeclarationNode,
} from '../../ast/types'
import { ProcInfo, Scope } from './utils'
import { coerce, emitExpr, inferType } from './expressions'
import { resolveTypeId, scalarBase, subrangeBounds, tryEvalConstInt } from './types'
import { collectLabelsFromCompound, emitCompound } from './statements'
import { emitBlockWithGoto } from '../strategy'
import type { Compiler } from '../compiler'

export function collectConsts(compiler: Compiler, consts: ConstDeclarationNode[]) {
  for (const c of consts) {
    const t = inferType(compiler, c.value, compiler.globalScope)
    compiler.globalScope.declare(c.name.name, t)
  }
}

export function collectGlobals(compiler: Compiler, vars: VariableDeclarationNode[]) {
  for (const decl of vars) {
    const t = resolveTypeId(compiler, decl.type)
    const st = scalarBase(compiler, t)
    for (const n of decl.names) {
      compiler.globalScope.declare(n.name, st, false, t)
    }
  }
}

export function collectProcs(
  compiler: Compiler,
  procs: ProcedureDeclarationNode[],
  funcs: FunctionDeclarationNode[]
) {
  collectProcsRecursive(compiler, procs, funcs, null, '')
}

export function collectProcsRecursive(
  compiler: Compiler,
  procs: ProcedureDeclarationNode[],
  funcs: FunctionDeclarationNode[],
  parent: ProcInfo | null,
  parentJsName: string
) {
  const makeJsName = (base: string) =>
    parentJsName ? `${parentJsName}__${base.toLowerCase()}` : `p_${base.toLowerCase()}`
  const findForward = (name: string): ProcInfo | undefined => {
    if (parent) return parent.children.find((c) => c.name === name && c.isForward)
    return compiler.procs.get(name)
  }
  const recurseNested = (info: ProcInfo, block: BlockNode) => {
    collectProcsRecursive(
      compiler,
      block.procedureDeclarations,
      block.functionDeclarations,
      info,
      info.jsName
    )
  }
  for (const p of procs) {
    const name = p.name.name.toUpperCase()
    const params = collectParams(compiler, p.parameters)
    const info: ProcInfo = {
      jsName: makeJsName(p.name.name),
      name,
      isFunction: false,
      returnType: 'void',
      params,
      block: p.block,
      parent,
      children: [],
      isForward: p.isForward,
    }
    if (!p.isForward) {
      const existing = findForward(name)
      if (existing && existing.isForward) {
        existing.forwardDef = info
        if (p.block) recurseNested(info, p.block)
        continue
      }
    }
    if (parent) parent.children.push(info)
    else compiler.procs.set(name, info)
    if (p.block) recurseNested(info, p.block)
  }
  for (const f of funcs) {
    const name = f.name.name.toUpperCase()
    const params = collectParams(compiler, f.parameters)
    const retType = scalarBase(compiler, resolveTypeId(compiler, f.returnType))
    const info: ProcInfo = {
      jsName: makeJsName(f.name.name),
      name,
      isFunction: true,
      returnType: retType,
      params,
      block: f.block,
      parent,
      children: [],
      isForward: f.isForward,
    }
    if (!f.isForward) {
      const existing = findForward(name)
      if (existing && existing.isForward) {
        existing.forwardDef = info
        if (f.block) recurseNested(info, f.block)
        continue
      }
    }
    if (parent) parent.children.push(info)
    else compiler.procs.set(name, info)
    if (f.block) recurseNested(info, f.block)
  }
}

export function collectParams(
  compiler: Compiler,
  params: ParameterDeclarationNode[]
): { name: string; typeId: string; isVar: boolean }[] {
  const result: { name: string; typeId: string; isVar: boolean }[] = []
  for (const p of params) {
    const t = resolveTypeId(compiler, p.type)
    const st = scalarBase(compiler, t)
    for (const n of p.names) {
      result.push({ name: n.name, typeId: st, isVar: p.isVar })
    }
  }
  return result
}

export function emitGlobalDecls(compiler: Compiler, block: BlockNode): string {
  const lines: string[] = []
  for (const c of block.constDeclarations) {
    const { code, type } = emitExpr(compiler, c.value, compiler.globalScope)
    lines.push(
      `const ${c.name.name} = ${coerce(compiler, code, type, inferType(compiler, c.value, compiler.globalScope))}`
    )
  }
  for (const decl of block.variableDeclarations) {
    const t = resolveTypeId(compiler, decl.type)
    const st = scalarBase(compiler, t)
    const init = defaultInit(compiler, t, st)
    for (const n of decl.names) {
      lines.push(`let ${n.name} = ${init}`)
    }
  }
  return lines.join('\n')
}

export function defaultInit(compiler: Compiler, t: string, st: string): string {
  if (st === 'integer' || st === 'char' || st === 'boolean') {
    const b = subrangeBounds(t)
    if (b) {
      if (st === 'char') return `ctx.box('char', String.fromCharCode(${b.min}))`
      if (st === 'boolean') return b.min ? 'true' : 'false'
      return `${b.min}`
    }
  }
  switch (st) {
    case 'integer':
      return '0'
    case 'real':
      return '0.0'
    case 'boolean':
      return 'false'
    case 'char':
      return "ctx.box('char', '\\u0000')"
    case 'string':
      return "ctx.box('string', '')"
  }
  return `ctx.defaultOf(${JSON.stringify(t)})`
}

export function emitProc(
  compiler: Compiler,
  info: ProcInfo,
  parentScope: Scope = compiler.globalScope
): string {
  if (info.isForward && !info.forwardDef) return ''
  const actual = info.forwardDef || info
  const block = actual.block
  if (!block) return ''
  const scope = new Scope(parentScope)
  for (const child of actual.children) {
    scope.procs.set(child.name, child)
  }
  const paramDecls: string[] = []
  for (const p of actual.params) {
    scope.declare(p.name, p.typeId, p.isVar)
    paramDecls.push(p.name)
  }
  const localDecls: string[] = []
  let hasRet = false
  if (actual.isFunction) {
    hasRet = true
    scope.vars.set(actual.name, {
      jsName: '__ret',
      typeId: actual.returnType,
      origTypeId: actual.returnType,
      isVar: false,
    })
    localDecls.push(`let __ret = ${defaultInit(compiler, actual.returnType, actual.returnType)}`)
  }
  const savedAliases: [string, string | undefined][] = []
  const savedConstInts: [string, number | undefined][] = []
  for (const c of block.constDeclarations) {
    const v = tryEvalConstInt(compiler, c.value)
    if (v !== undefined) {
      const key = c.name.name.toUpperCase()
      savedConstInts.push([key, compiler.constInts.get(key)])
      compiler.constInts.set(key, v)
    }
  }
  for (const t of block.typeDeclarations) {
    const key = t.name.name.toUpperCase()
    savedAliases.push([key, compiler.aliasMap.get(key)])
    const typeId = resolveTypeId(compiler, t.typeDef)
    compiler.aliasMap.set(key, typeId)
  }
  for (const decl of block.variableDeclarations) {
    const t = resolveTypeId(compiler, decl.type)
    const st = scalarBase(compiler, t)
    const init = defaultInit(compiler, t, st)
    for (const n of decl.names) {
      scope.declare(n.name, st, false, t)
      localDecls.push(`let ${n.name} = ${init}`)
    }
  }
  for (const c of block.constDeclarations) {
    const { code, type } = emitExpr(compiler, c.value, scope)
    const inferT = inferType(compiler, c.value, scope)
    localDecls.push(`const ${c.name.name} = ${coerce(compiler, code, type, inferT)}`)
    scope.declare(c.name.name, inferT)
  }
  const nestedDefs = actual.children
    .filter((c) => !c.isForward || c.forwardDef)
    .map((c) => emitProc(compiler, c, scope))
    .filter((s) => s.length > 0)
  const body = emitBody(compiler, block, scope, 2)
  for (const [k, v] of savedAliases) {
    if (v === undefined) compiler.aliasMap.delete(k)
    else compiler.aliasMap.set(k, v)
  }
  for (const [k, v] of savedConstInts) {
    if (v === undefined) compiler.constInts.delete(k)
    else compiler.constInts.set(k, v)
  }
  const params = ['ctx', ...paramDecls].join(', ')
  const lines: string[] = []
  lines.push(`async function ${actual.jsName}(${params}) {`)
  if (localDecls.length) lines.push('  ' + localDecls.join('\n  '))
  if (nestedDefs.length)
    lines.push(nestedDefs.map((d) => '  ' + d.replace(/\n/g, '\n  ')).join('\n\n'))
  lines.push(body)
  if (hasRet) lines.push('  return __ret')
  lines.push('}')
  return lines.join('\n')
}

export function emitBody(
  compiler: Compiler,
  block: BlockNode,
  scope: Scope,
  indent: number
): string {
  const declaredLabels = block.labelDeclarations ? block.labelDeclarations.labels : []
  let allLabels = declaredLabels
  if (compiler.allowUndeclaredLabels) {
    const inferred = collectLabelsFromCompound(block.compound)
    const declaredSet = new Set(declaredLabels.map((l) => l.value))
    for (const l of inferred) {
      if (!declaredSet.has(l.value)) {
        allLabels = [...allLabels, l]
      }
    }
  }
  if (allLabels.length === 0) {
    return emitCompound(compiler, block.compound, scope, indent)
  }

  return emitBlockWithGoto(block.compound, scope, indent, allLabels, compiler)
}
