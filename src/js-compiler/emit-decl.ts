// 声明编译：collect*、emitProc、emitBody、emitGlobalDecls、defaultInit 等
//
// 由原 compiler.ts 中的 private 方法提取为独立函数，所有函数接收 compiler 实例。
import type {
  BlockNode,
  ConstDeclarationNode,
  FunctionDeclarationNode,
  ParameterDeclarationNode,
  ProcedureDeclarationNode,
  VariableDeclarationNode,
} from '../ast/types'
import { ProcInfo, Scope } from './emit-utils'
import { emitExpr, inferType, coerce } from './emit-expr'
import {
  resolveTypeId,
  scalarBase,
  subrangeBounds,
  tryEvalConstInt,
} from './emit-type'
import { emitStmt, emitCompound, collectLabelsFromCompound } from './emit-stmt'
import { emitBlockWithGoto } from './strategy'
import type { Compiler } from './compiler'

// ---- 收集 ----

export function collectConsts(compiler: Compiler, consts: ConstDeclarationNode[]) {
  // 常量在全局作用域，作为全局变量
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

// 递归收集过程（含嵌套）。parentJsName 用于生成唯一 jsName（如 p_outer__inner）
export function collectProcsRecursive(
  compiler: Compiler,
  procs: ProcedureDeclarationNode[],
  funcs: FunctionDeclarationNode[],
  parent: ProcInfo | null,
  parentJsName: string
) {
  const makeJsName = (base: string) =>
    parentJsName ? `${parentJsName}__${base.toLowerCase()}` : `p_${base.toLowerCase()}`
  // 在父作用域（parent.children 或 this.procs）中查找同名 forward
  const findForward = (name: string): ProcInfo | undefined => {
    if (parent) return parent.children.find((c) => c.name === name && c.isForward)
    return compiler.procs.get(name)
  }
  // 递归收集嵌套
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

// ---- 全局声明生成 ----

export function emitGlobalDecls(compiler: Compiler, block: BlockNode): string {
  const lines: string[] = []
  // 常量
  for (const c of block.constDeclarations) {
    const { code, type } = emitExpr(compiler, c.value, compiler.globalScope)
    lines.push(
      `const ${c.name.name} = ${coerce(compiler, code, type, inferType(compiler, c.value, compiler.globalScope))}`
    )
  }
  // 全局变量
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

// defaultInit：t 是原始 typeId，st 是缩并后的 scalar 类型
export function defaultInit(compiler: Compiler, t: string, st: string): string {
  // subrange：用下界作为默认值
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
  // array/record/set/file/text：调用 ctx.defaultOf(原始 typeId)
  return `ctx.defaultOf(${JSON.stringify(t)})`
}

// ---- 过程生成 ----

export function emitProc(
  compiler: Compiler,
  info: ProcInfo,
  parentScope: Scope = compiler.globalScope
): string {
  // FORWARD 声明：跳过（实际定义通过 forwardDef 引用）
  if (info.isForward && !info.forwardDef) return ''
  // 实际定义：用 forwardDef 指向的 info（含 block）
  const actual = info.forwardDef || info
  const block = actual.block
  if (!block) return ''
  // 嵌套过程的 scope 继承父过程 scope（JS 闭包能访问外层局部变量）
  const scope = new Scope(parentScope)
  // 注册嵌套过程到 scope.procs（供过程体调用解析）
  for (const child of actual.children) {
    scope.procs.set(child.name, child)
  }
  const paramDecls: string[] = []
  for (const p of actual.params) {
    scope.declare(p.name, p.typeId, p.isVar)
    paramDecls.push(p.name)
  }
  const localDecls: string[] = []
  // 函数返回值：Pascal 通过给函数名赋值返回，映射到 __ret 变量
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
  // 局部 const integer（type 边界可能引用）— 先于 type 处理
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
  // 局部类型声明：注册到 aliasMap（暂用 save/restore 模拟作用域）
  for (const t of block.typeDeclarations) {
    const key = t.name.name.toUpperCase()
    savedAliases.push([key, compiler.aliasMap.get(key)])
    const typeId = resolveTypeId(compiler, t.typeDef)
    compiler.aliasMap.set(key, typeId)
  }
  // 局部变量
  for (const decl of block.variableDeclarations) {
    const t = resolveTypeId(compiler, decl.type)
    const st = scalarBase(compiler, t)
    const init = defaultInit(compiler, t, st)
    for (const n of decl.names) {
      scope.declare(n.name, st, false, t)
      localDecls.push(`let ${n.name} = ${init}`)
    }
  }
  // 局部常量
  for (const c of block.constDeclarations) {
    const { code, type } = emitExpr(compiler, c.value, scope)
    const inferT = inferType(compiler, c.value, scope)
    localDecls.push(`const ${c.name.name} = ${coerce(compiler, code, type, inferT)}`)
    scope.declare(c.name.name, inferT)
  }
  // 嵌套过程的 JS 函数定义（放在父过程函数体内，闭包捕获父局部变量）
  const nestedDefs = actual.children
    .filter((c) => !c.isForward || c.forwardDef)
    .map((c) => emitProc(compiler, c, scope))
    .filter((s) => s.length > 0)
  // 函数体
  const body = emitBody(compiler, block, scope, 2)
  // 恢复 aliasMap / constInts
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

// ---- 语句生成 ----

// 过程/主程序体生成：根据 label 分析选择最优策略
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
