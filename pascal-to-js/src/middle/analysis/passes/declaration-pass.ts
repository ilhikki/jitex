/*
 * Pass 1: 声明处理。
 *
 * 递归遍历每个 block，处理 label/const/type/var/param 声明 + allocFunc 建函数表。
 * 建立作用域快照（blockScopes），供 Pass 2 只读 lookup。
 *
 * 输入：ProgramNode, AnalysisContext
 * 输出：DeclarationResult
 */

import {
  BlockNode,
  CallableParameterSpec,
  ConstDeclarationNode,
  ExpressionNode,
  FunctionDeclarationNode,
  ParameterDeclarationNode,
  ProcedureDeclarationNode,
  ProgramNode,
  RecordVariantPartNode,
  TypeNode,
} from '@/frontend/node.ts'
import {
  AnalysisSymbol,
  CallableParamInfo,
  CallableParamSig,
  evalConstInt,
  evalLiteral,
  FuncInfo,
  FuncKind,
  LiteralValue,
  SIMPLE_TYPES,
  TypeInfo,
  TypeTag,
  VariantBranchInfo,
  VariantPartInfo,
  VarSymbol,
} from '../analysis-type.ts'
import { AnalysisContext, DeclarationResult, ScopeSnapshot } from '../stage-types.ts'

// 内部作用域栈

interface MutableScope extends ScopeSnapshot {}

// Pass 1 入口

export function runDeclarationPass(
  program: ProgramNode,
  ctx: AnalysisContext,
): DeclarationResult {
  const pass = new DeclarationPass(ctx)
  pass.run(program)
  return pass.result()
}

// DeclarationPass

class DeclarationPass {
  private ctx: AnalysisContext

  // 输出
  private funcInfos = new Map<number, FuncInfo>()
  private blockFunc = new Map<BlockNode, number>()
  private declFunc = new Map<ProcedureDeclarationNode | FunctionDeclarationNode, number>()
  private blockScopes = new Map<BlockNode, ScopeSnapshot>()
  private typeAliases = new Map<string, TypeInfo>()
  private typeNodeInfo = new Map<TypeNode, TypeInfo>()
  private idNames = new Map<number, string>()
  private nextId_ = 1
  private forwardFuncs = new Map<string, number>()
  private labels = new Map<number, Map<number, { labelId: number; funcId: number }>>()
  private globalBindings = new Map<string, AnalysisSymbol>()

  // 运行时作用域栈
  private scopeStack: MutableScope[] = []

  constructor(ctx: AnalysisContext) {
    this.ctx = ctx
  }

  run(program: ProgramNode): void {
    const topFuncId = this.allocFunc(program.block, undefined, 'program', undefined)
    this.pushScope(topFuncId, program.block)
    this.analyzeBlock(program.block, topFuncId)
    this.globalBindings = this.currentScope().bindings
    this.popScope()
  }

  result(): DeclarationResult {
    return {
      funcInfos: this.funcInfos,
      blockFunc: this.blockFunc,
      declFunc: this.declFunc,
      blockScopes: this.blockScopes,
      typeAliases: this.typeAliases,
      typeNodeInfo: this.typeNodeInfo,
      idNames: this.idNames,
      nextId: this.nextId_,
      forwardFuncs: this.forwardFuncs,
      labels: this.labels,
      globalBindings: this.globalBindings,
    }
  }

  // ID 分配

  private allocId(): number {
    return this.nextId_++
  }

  private recordName(id: number, name: string): void {
    const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
    if (cleaned) {
      this.idNames.set(id, cleaned)
    }
  }

  // 作用域

  private pushScope(funcId: number, block?: BlockNode): void {
    const scope: MutableScope = {
      bindings: new Map(),
      funcId,
      outer: this.scopeStack.length > 0 ? this.scopeStack[this.scopeStack.length - 1] : undefined,
    }
    this.scopeStack.push(scope)
    if (block) {
      this.blockScopes.set(block, scope)
    }
  }

  private popScope(): void {
    this.scopeStack.pop()
  }

  private currentScope(): MutableScope {
    const s = this.scopeStack[this.scopeStack.length - 1]
    if (!s) {
      throw new Error('DeclarationPass: no active scope')
    }
    return s
  }

  private bind(name: string, sym: AnalysisSymbol): void {
    this.currentScope().bindings.set(name.toLowerCase(), sym)
  }

  private lookup(name: string): AnalysisSymbol | undefined {
    const key = name.toLowerCase()
    let s: ScopeSnapshot | undefined = this.scopeStack[this.scopeStack.length - 1] ?? undefined
    while (s) {
      const v = s.bindings.get(key)
      if (v) {
        return v
      }
      s = s.outer
    }
    return undefined
  }

  // 函数分配

  private allocFunc(
    block: BlockNode | undefined,
    decl: ProcedureDeclarationNode | FunctionDeclarationNode | undefined,
    kind: FuncKind,
    parentFuncId: number | undefined,
  ): number {
    const funcId = this.allocId()
    if (decl) {
      this.recordName(funcId, decl.name.name)
    } else {
      this.recordName(funcId, 'main')
    }
    const info: FuncInfo = {
      funcId,
      parentFuncId,
      params: [],
      locals: [],
      children: [],
      hasBody: block !== undefined,
      kind,
    }
    this.funcInfos.set(funcId, info)
    if (parentFuncId !== undefined) {
      const parent = this.funcInfos.get(parentFuncId)
      if (parent) {
        parent.children.push(funcId)
      }
    }
    if (block) {
      this.blockFunc.set(block, funcId)
    }
    if (decl) {
      this.declFunc.set(decl, funcId)
    }
    return funcId
  }

  // Block 分析（声明部分）

  private analyzeBlock(block: BlockNode, funcId: number): void {
    // LABEL — per-function 作用域：每个函数有自己的 label 表。
    if (block.labelDeclarations) {
      let funcLabels = this.labels.get(funcId)
      if (!funcLabels) {
        funcLabels = new Map()
        this.labels.set(funcId, funcLabels)
      }
      for (const lit of block.labelDeclarations.labels) {
        if (funcLabels.has(lit.value)) {
          throw new Error(`Duplicate label declaration: ${lit.value}`)
        }
        const labelId = this.allocId()
        this.recordName(labelId, `label_${lit.value}`)
        funcLabels.set(lit.value, { labelId, funcId })
      }
    }

    // CONST
    for (const c of block.constDeclarations) {
      this.analyzeConst(c)
    }

    // TYPE — 两遍处理，支持 ISO 7185 6.4.4 指针前向引用
    const typePlaceholders = new Map<string, TypeInfo>()
    for (const t of block.typeDeclarations) {
      const lower = t.name.name.toLowerCase()
      const placeholder: TypeInfo = { tag: 'unknown' }
      this.typeAliases.set(lower, placeholder)
      this.bind(t.name.name, { kind: 'type', typeInfo: placeholder })
      typePlaceholders.set(lower, placeholder)
    }
    for (const t of block.typeDeclarations) {
      const lower = t.name.name.toLowerCase()
      const info = this.resolveTypeInfo(t.typeDef)
      const placeholder = typePlaceholders.get(lower)!
      Object.assign(placeholder, info)
    }
    for (const t of block.typeDeclarations) {
      if (t.typeDef.kind === 'PointerType') {
        const lower = t.name.name.toLowerCase()
        this.typeNodeInfo.delete(t.typeDef)
        const info = this.resolveTypeInfo(t.typeDef)
        const placeholder = typePlaceholders.get(lower)!
        Object.assign(placeholder, info)
      }
    }

    // VAR
    const info = this.funcInfos.get(funcId)!
    for (const v of block.variableDeclarations) {
      const ti = this.resolveTypeInfo(v.type)
      for (const name of v.names) {
        const existing = this.currentScope().bindings.get(name.name.toLowerCase())
        if (existing && (existing.kind === 'var' || existing.kind === 'param')) {
          throw new Error(`Identifier '${name.name}' already declared in this scope`)
        }
        const varId = this.allocId()
        this.recordName(varId, name.name)
        const sym: VarSymbol = { kind: 'var', varId, typeInfo: ti, isVarParam: false }
        info.locals.push(sym)
        this.bind(name.name, sym)
      }
    }

    // PROCEDURE / FUNCTION — 两遍分析
    for (const p of block.procedureDeclarations) {
      this.declareProcName(p)
    }
    for (const f of block.functionDeclarations) {
      this.declareFuncName(f)
    }
    for (const p of block.procedureDeclarations) {
      this.analyzeProcBody(p)
    }
    for (const f of block.functionDeclarations) {
      this.analyzeFuncBody(f)
    }
  }

  private analyzeConst(decl: ConstDeclarationNode): void {
    const lit = this.evalConstValue(decl.value)
    if (lit) {
      this.bind(decl.name.name, { kind: 'const', literal: lit, typeInfo: lit.typeInfo })
    } else {
      this.bind(decl.name.name, { kind: 'type', typeInfo: { tag: 'unknown' } })
    }
  }

  /**
   * ISO 6.3：constant = [ sign ] ( unsigned-number | constant-identifier ) | character-string
   * 除字面量外，还须支持带符号常量（-5）与对已定义常量的引用（B = A）。
   */
  private evalConstValue(node: ExpressionNode): LiteralValue | undefined {
    const lit = evalLiteral(node)
    if (lit) {
      return lit
    }
    if (node.kind === 'UnaryExpression' && (node.operator === '-' || node.operator === '+')) {
      const inner = this.evalConstValue(node.operand)
      if (inner && (inner.typeInfo.tag === 'integer' || inner.typeInfo.tag === 'real')) {
        return node.operator === '-' ? { ...inner, arg: `-${inner.arg}` } : inner
      }
      return undefined
    }
    if (node.kind === 'Identifier') {
      const sym = this.lookup(node.name)
      if (sym?.kind === 'const') {
        return sym.literal
      }
    }
    return undefined
  }

  // 类型解析

  private resolveTypeInfo(node: TypeNode): TypeInfo {
    const cached = this.typeNodeInfo.get(node)
    if (cached) {
      return cached
    }

    let info: TypeInfo
    switch (node.kind) {
      case 'SimpleType': {
        const name = node.name.name.toLowerCase()
        const builtin = SIMPLE_TYPES[name]
        if (builtin) {
          info = builtin
        } else {
          const alias = this.typeAliases.get(node.name.name.toLowerCase())
          if (alias) {
            info = alias
          } else {
            const sym = this.lookup(node.name.name)
            if (sym?.kind === 'type') {
              info = sym.typeInfo
            } else {
              info = { tag: 'unknown' }
            }
          }
        }
        break
      }
      case 'RangeType': {
        const low = evalConstInt(node.start, (n) => this.lookup(n))
        const high = evalConstInt(node.end, (n) => this.lookup(n))
        let baseTag: TypeTag = 'integer'
        if (node.start.kind === 'CharLiteral' || node.end.kind === 'CharLiteral') {
          baseTag = 'char'
        } else if (node.start.kind === 'BooleanLiteral' || node.end.kind === 'BooleanLiteral') {
          baseTag = 'boolean'
        }
        info = { tag: 'subrange', low, high, baseTag }
        break
      }
      case 'ArrayType': {
        const dims: { low: number; high: number }[] = []
        for (const idx of node.indexTypes) {
          if (idx.kind === 'RangeType') {
            dims.push({
              low: evalConstInt(idx.start, (n) => this.lookup(n)) ?? 0,
              high: evalConstInt(idx.end, (n) => this.lookup(n)) ?? 0,
            })
          } else if (idx.kind === 'SimpleType') {
            const name = idx.name.name.toLowerCase()
            if (name === 'char') {
              dims.push({ low: 0, high: 255 })
            } else if (name === 'boolean') {
              dims.push({ low: 0, high: 1 })
            } else if (name === 'integer') {
              dims.push({ low: 0, high: 2147483647 })
            } else {
              const alias = this.typeAliases.get(name)
              if (
                alias?.tag === 'subrange' &&
                alias.low !== undefined &&
                alias.high !== undefined
              ) {
                dims.push({ low: alias.low, high: alias.high })
              } else {
                const sym = this.lookup(idx.name.name)
                if (sym?.kind === 'type' && sym.typeInfo.tag === 'enum') {
                  dims.push({ low: 0, high: (sym.typeInfo.enumCount ?? 1) - 1 })
                } else if (
                  sym?.kind === 'type' &&
                  sym.typeInfo.tag === 'subrange' &&
                  sym.typeInfo.low !== undefined &&
                  sym.typeInfo.high !== undefined
                ) {
                  dims.push({ low: sym.typeInfo.low, high: sym.typeInfo.high })
                } else {
                  dims.push({ low: 0, high: 0 })
                }
              }
            }
          }
        }
        const elem = this.resolveTypeInfo(node.elementType)
        info = { tag: 'array', dims, elem }
        break
      }
      case 'RecordType': {
        const fields = new Map<string, TypeInfo>()
        for (const f of node.fields) {
          const ti = this.resolveTypeInfo(f.type)
          for (const name of f.names) {
            fields.set(name.name.toLowerCase(), ti)
          }
        }
        const variant = node.variant ? this.buildVariantInfo(node.variant) : undefined
        info = { tag: 'record', fields, variant }
        break
      }
      case 'SetType': {
        info = { tag: 'set', setBase: this.resolveTypeInfo(node.baseType) }
        break
      }
      case 'FileType': {
        info = {
          tag: 'file',
          elem: node.elementType ? this.resolveTypeInfo(node.elementType) : undefined,
        }
        break
      }
      case 'EnumerationType': {
        info = { tag: 'enum', enumCount: node.values.length }
        for (let i = 0; i < node.values.length; i++) {
          this.bind(node.values[i].name, {
            kind: 'const',
            literal: { key: 'number', arg: String(i), typeInfo: { tag: 'integer' } },
            typeInfo: { tag: 'integer' },
          })
        }
        break
      }
      case 'PointerType': {
        info = { tag: 'pointer', domainType: this.resolveTypeInfo(node.domainType) }
        break
      }
      default:
        info = { tag: 'unknown' }
    }

    this.typeNodeInfo.set(node, info)
    return info
  }

  private buildVariantInfo(variant: RecordVariantPartNode): VariantPartInfo {
    const tagName = variant.tagName?.name.toLowerCase()
    const branches: VariantBranchInfo[] = variant.variants.map((v) => {
      const labels = v.caseLabels
        .map((lbl) => evalConstInt(lbl, (n) => this.lookup(n)))
        .filter((x): x is number => x !== undefined)
      const fields = new Map<string, TypeInfo>()
      for (const f of v.fields) {
        const ti = this.resolveTypeInfo(f.type)
        for (const name of f.names) {
          fields.set(name.name.toLowerCase(), ti)
        }
      }
      const nested = v.variant ? this.buildVariantInfo(v.variant) : undefined
      return { labels, fields, nested }
    })
    return { tagName, branches }
  }

  // 函数声明

  private declareProcName(decl: ProcedureDeclarationNode): void {
    const parentFuncId = this.currentScope().funcId
    const declNameLower = decl.name.name.toLowerCase()
    let funcId = this.forwardFuncs.get(declNameLower)
    if (funcId === undefined) {
      funcId = this.allocFunc(decl.block, decl, 'procedure', parentFuncId)
    } else {
      this.declFunc.set(decl, funcId)
      if (decl.block) {
        this.blockFunc.set(decl.block, funcId)
      }
      this.forwardFuncs.delete(declNameLower)
    }

    this.bind(decl.name.name, { kind: 'func', funcId })

    if (decl.isForward) {
      this.forwardFuncs.set(declNameLower, funcId)
    }
  }

  private analyzeProcBody(decl: ProcedureDeclarationNode): void {
    if (!decl.block) {
      return
    }
    const funcId = this.declFunc.get(decl)!
    this.funcInfos.get(funcId)!.hasBody = true
    this.pushScope(funcId, decl.block)
    this.analyzeParams(funcId, decl.parameters)
    this.analyzeBlock(decl.block, funcId)
    this.popScope()
  }

  private declareFuncName(decl: FunctionDeclarationNode): void {
    const parentFuncId = this.currentScope().funcId
    const declNameLower = decl.name.name.toLowerCase()
    let funcId = this.forwardFuncs.get(declNameLower)
    if (funcId === undefined) {
      funcId = this.allocFunc(decl.block, decl, 'function', parentFuncId)
    } else {
      this.declFunc.set(decl, funcId)
      if (decl.block) {
        this.blockFunc.set(decl.block, funcId)
      }
      this.forwardFuncs.delete(declNameLower)
    }

    const retTypeInfo = this.resolveTypeInfo(decl.returnType)
    this.bind(decl.name.name, {
      kind: 'func',
      funcId,
      retTypeInfo,
    })

    if (decl.isForward) {
      this.forwardFuncs.set(declNameLower, funcId)
    }
  }

  private analyzeFuncBody(decl: FunctionDeclarationNode): void {
    if (!decl.block) {
      return
    }
    const funcId = this.declFunc.get(decl)!
    const retTypeInfo = this.resolveTypeInfo(decl.returnType)
    this.funcInfos.get(funcId)!.hasBody = true
    this.pushScope(funcId, decl.block)

    this.analyzeParams(funcId, decl.parameters)

    const retvalId = this.allocId()
    this.recordName(retvalId, `${decl.name.name}_retval`)
    const retvalSym: VarSymbol = {
      kind: 'var',
      varId: retvalId,
      typeInfo: retTypeInfo,
      isVarParam: false,
    }
    const info = this.funcInfos.get(funcId)!
    info.retval = retvalSym

    this.analyzeBlock(decl.block, funcId)
    this.popScope()
  }

  private analyzeParams(
    funcId: number,
    params: ParameterDeclarationNode[],
  ): void {
    const info = this.funcInfos.get(funcId)!
    for (const p of params) {
      // ISO 7185 6.6.3.4/6.6.3.5：可调用形参（过程/函数作形式参数）
      if (p.callable) {
        const callable = this.resolveCallableParamInfo(p.callable)
        for (const name of p.names) {
          const varId = this.allocId()
          this.recordName(varId, name.name)
          const sym: VarSymbol = {
            kind: 'param',
            varId,
            // ISO 7185 6.6.3.4/6.6.3.5：函数形参在表达式中即调用，类型为返回类型；
            // 过程形参不能出现在表达式中，用内部标记，analyzeExpr 遇到时报错。
            typeInfo: callable.kind === 'function' && callable.retTypeInfo
              ? callable.retTypeInfo
              : { tag: 'procedure' },
            isVarParam: false,
            callable,
          }
          info.params.push(sym)
          this.bind(name.name, sym)
        }
        continue
      }

      const ti = this.resolveTypeInfo(p.type!)
      for (const name of p.names) {
        const varId = this.allocId()
        this.recordName(varId, name.name)
        const sym: VarSymbol = {
          kind: 'param',
          varId,
          typeInfo: ti,
          isVarParam: p.isVar && ti.tag !== 'file',
        }
        info.params.push(sym)
        this.bind(name.name, sym)
      }
    }
  }

  /** 可调用形参的 heading → 签名信息（含自带的 formal-parameter-list 与结果类型） */
  private resolveCallableParamInfo(spec: CallableParameterSpec): CallableParamInfo {
    const params: CallableParamSig[] = spec.parameters.map((inner) => {
      if (inner.callable) {
        // 嵌套的可调用形参：过程形参用内部标记，函数形参用其返回类型
        return {
          isVar: false,
          typeInfo: inner.callable.kind === 'function' && inner.callable.returnType
            ? this.resolveTypeInfo(inner.callable.returnType)
            : { tag: 'procedure' },
        }
      }
      return { isVar: inner.isVar, typeInfo: this.resolveTypeInfo(inner.type!) }
    })
    const retTypeInfo = spec.returnType ? this.resolveTypeInfo(spec.returnType) : undefined
    return { kind: spec.kind, params, retTypeInfo }
  }
}
