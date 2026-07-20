import { emitBlockWithGoto } from './strategy'
import type {
  ArrayAccessNode,
  ArrayTypeNode,
  AssignmentNode,
  BinaryExpressionNode,
  BlockNode,
  CaseStatementNode,
  CompoundStatementNode,
  ConstDeclarationNode,
  EnumerationTypeNode,
  ExpressionNode,
  FieldAccessNode,
  FileTypeNode,
  ForStatementNode,
  FunctionCallNode,
  FunctionDeclarationNode,
  GotoStatementNode,
  IdentifierNode,
  IfStatementNode,
  InExpressionNode,
  IntegerLiteralNode,
  LabeledStatementNode,
  ParameterDeclarationNode,
  ProcedureCallNode,
  ProcedureDeclarationNode,
  ProgramNode,
  RangeTypeNode,
  RecordTypeNode,
  RepeatStatementNode,
  SetConstructorNode,
  SetTypeNode,
  SimpleTypeNode,
  StatementNode,
  TypeNode,
  UnaryExpressionNode,
  VariableDeclarationNode,
  WhileStatementNode,
  WithStatementNode,
} from '../ast/types'
import type { TypeTable } from './types'
import {
  BUILTIN_NO_ARG,
  BUILTIN_SYSCALLS,
  builtinReturnType,
  isScalar,
  ProcInfo,
  Scope,
} from './item'

export class Compiler {
  procs = new Map<string, ProcInfo>()
  globalScope = new Scope()
  procBodies: string[] = []
  typeTable: TypeTable
  // 用户类型名 -> typeId（如 ARR -> array-1..5-of-integer）
  aliasMap = new Map<string, string>()
  // enum 值名 -> 序号（如 RED -> 0）
  enumConstants = new Map<string, number>()
  // const integer 名 -> 值（用于类型边界求值）
  constInts = new Map<string, number>()
  // goto 状态机支持：当前过程体的 label -> case 编号映射（null 表示无 goto 上下文）
  labelCases: Map<string, number> | null = null
  labelSwitchName: string | null = null // goto break 用的 JS label 名
  // goto 优化模式：'continue' = 策略 B（后向循环），'break' = 策略 C（跳出循环），null = 正常
  gotoMode: 'continue' | 'break' | 'exception' | null = null
  gotoLabel: string | null = null // 策略 B/C 的 JS label 名
  // 非标扩展配置
  allowUndeclaredLabels: boolean
  // WITH 临时变量计数器（避免嵌套 WITH 变量名冲突）
  withVarCounter = 0

  constructor(typeTable: TypeTable, options?: { allowUndeclaredLabels?: boolean }) {
    this.typeTable = typeTable
    this.allowUndeclaredLabels = options?.allowUndeclaredLabels ?? false
  }

  compile(program: ProgramNode, programFileUrls?: Record<string, string>): string {
    // 0. 收集类型别名 + enum 常量 + const integer
    this.collectTypes(program.block)

    // 1. 收集常量、全局变量、过程/函数
    this.collectConsts(program.block.constDeclarations)
    this.collectGlobals(program.block.variableDeclarations)
    this.collectProcs(program.block.procedureDeclarations, program.block.functionDeclarations)

    // 2. 生成过程函数体
    const procDefs: string[] = []
    for (const [name, info] of this.procs) {
      // 跳过 forward 声明且无实际定义的（罕见，正常 forwardDef 已设置）
      if (info.block || info.forwardDef) {
        procDefs.push(this.emitProc(info))
      }
    }

    // 3. 生成全局变量声明
    const globalDecls = this.emitGlobalDecls(program.block)

    // 4. 生成 main 体（用 emitBody 以支持 main 程序的 goto 标号状态机）
    const mainBody = this.emitBody(program.block, this.globalScope, 2)

    // 4.5 programFileUrls：在 main 体前自动 ASSIGN（TANGLE 风格程序参数）
    const assignLines: string[] = []
    if (programFileUrls) {
      for (const [varName, url] of Object.entries(programFileUrls)) {
        // F 已在 globalDecls 中初始化为 PascalValue（file 句柄）
        // ASSIGN(F, 'url') → ctx.sysCall("ASSIGN", [F, ctx.box('string', url)])
        assignLines.push(
          `  await ctx.sysCall("ASSIGN", [${varName}, ctx.box('string', ${JSON.stringify(url)})])`
        )
      }
    }

    // 5. 组装
    const parts: string[] = []
    parts.push("'use strict'")
    parts.push(globalDecls)
    parts.push(procDefs.join('\n'))
    if (assignLines.length > 0) {
      parts.push(assignLines.join('\n'))
    }
    parts.push(mainBody)
    return parts.join('\n')
  }

  // ---- 类型收集 ----

  private collectTypes(block: BlockNode) {
    // 先扫一遍 const integer（type 边界可能引用 const）
    for (const c of block.constDeclarations) {
      const v = this.tryEvalConstInt(c.value)
      if (v !== undefined) this.constInts.set(c.name.name.toUpperCase(), v)
    }
    // 顺序处理 typeDeclarations（Pascal 要求先声明再使用）
    for (const t of block.typeDeclarations) {
      const typeId = this.resolveTypeId(t.typeDef)
      this.aliasMap.set(t.name.name.toUpperCase(), typeId)
    }
  }

  // 尝试在编译期求 const int（不抛错，失败返回 undefined）
  private tryEvalConstInt(node: ExpressionNode): number | undefined {
    try {
      return this.evalConstInt(node)
    } catch {
      return undefined
    }
  }

  private evalConstInt(node: ExpressionNode): number {
    switch (node.kind) {
      case 'IntegerLiteral':
        return (node as any).value
      case 'CharLiteral':
        return (node as any).value.charCodeAt(0)
      case 'BooleanLiteral':
        return (node as any).value ? 1 : 0
      case 'Identifier': {
        const name = (node as IdentifierNode).name.toUpperCase()
        if (this.constInts.has(name)) return this.constInts.get(name)!
        if (this.enumConstants.has(name)) return this.enumConstants.get(name)!
        throw new Error(`JS VM: cannot eval const ${name}`)
      }
      case 'UnaryExpression': {
        const u = node as UnaryExpressionNode
        const v = this.evalConstInt(u.operand)
        return u.operator === '-' ? -v : v
      }
      case 'BinaryExpression': {
        const b = node as BinaryExpressionNode
        const l = this.evalConstInt(b.left)
        const r = this.evalConstInt(b.right)
        switch (b.operator.toUpperCase()) {
          case '+':
            return l + r
          case '-':
            return l - r
          case '*':
            return l * r
          case 'DIV':
            return Math.trunc(l / r)
          case 'MOD':
            return l - Math.trunc(l / r) * r
        }
      }
      case 'ParenthesizedExpression':
        return this.evalConstInt((node as any).expression)
    }
    throw new Error(`JS VM: cannot eval const expr ${(node as any).kind}`)
  }

  // 把 TypeNode 解析为 typeId（与 StaticAnalyzer 生成规则一致）
  private resolveTypeId(node: TypeNode): string {
    switch (node.kind) {
      case 'SimpleType': {
        const n = (node as SimpleTypeNode).name.name.toUpperCase()
        switch (n) {
          case 'INTEGER':
            return 'integer'
          case 'REAL':
            return 'real'
          case 'BOOLEAN':
            return 'boolean'
          case 'CHAR':
            return 'char'
          case 'STRING':
            return 'string'
          case 'TEXT':
            return 'text'
          default: {
            const tid = this.aliasMap.get(n)
            if (tid) return tid
            // 可能是 enum 值？SimpleType 不会是 enum value，报错
            throw new Error(`JS VM: unknown type ${n}`)
          }
        }
      }
      case 'RangeType': {
        const r = node as RangeTypeNode
        const min = this.evalConstInt(r.start)
        const max = this.evalConstInt(r.end)
        if (min > max) {
          throw new Error(`JS VM: subrange lower bound ${min} > upper bound ${max}`)
        }
        let baseTypeId = 'integer'
        if (r.start.kind === 'CharLiteral') baseTypeId = 'char'
        else if (r.start.kind === 'BooleanLiteral') baseTypeId = 'boolean'
        else if (r.start.kind === 'Identifier') {
          const name = (r.start as IdentifierNode).name.toUpperCase()
          if (this.enumConstants.has(name)) {
            baseTypeId = 'integer'
          }
        }
        return `subrange-${min}-${max}-of-${baseTypeId}`
      }
      case 'ArrayType': {
        const a = node as ArrayTypeNode
        const elemTypeId = this.resolveTypeId(a.elementType)
        const dims = a.indexTypes.map((idx) => {
          if (idx.kind === 'RangeType') {
            const r = idx as RangeTypeNode
            const low = this.evalConstInt(r.start)
            const high = this.evalConstInt(r.end)
            return `${low}..${high}`
          }
          // 简单类型作为索引：尝试解析为 subrange 取范围
          const idxType = this.resolveTypeId(idx)
          const td = this.typeTable.get(idxType) as any
          if (td?.kind === 'subrange') return `${td.min}..${td.max}`
          if (idxType === 'char') return '0..255'
          if (idxType === 'boolean') return '0..1'
          // enum
          if (td?.kind === 'enum') return `0..${td.values.length - 1}`
          return '0..0'
        })
        return `array-${dims.join(',')}-of-${elemTypeId}`
      }
      case 'RecordType': {
        const r = node as RecordTypeNode
        const fields: string[] = []
        for (const f of r.fields) {
          for (const n of f.names) fields.push(n.name.toUpperCase())
        }
        return `record-${fields.join(',')}`
      }
      case 'EnumerationType': {
        const e = node as EnumerationTypeNode
        const vals = e.values.map((v) => v.name.toUpperCase())
        // 注册 enum 常量
        vals.forEach((v, i) => this.enumConstants.set(v, i))
        return `enum-${vals.join(',')}`
      }
      case 'SetType': {
        const s = node as SetTypeNode
        const baseTypeId = this.resolveTypeId(s.baseType)
        let minOrd = 0,
          maxOrd = 255
        const baseDef = this.typeTable.get(baseTypeId) as any
        if (baseDef?.kind === 'subrange') {
          minOrd = baseDef.min
          maxOrd = baseDef.max
        } else if (baseDef?.kind === 'char') {
          minOrd = 0
          maxOrd = 255
        } else if (baseDef?.kind === 'boolean') {
          minOrd = 0
          maxOrd = 1
        } else if (baseDef?.kind === 'enum') {
          minOrd = 0
          maxOrd = baseDef.values.length - 1
        }
        return `set-of-${baseTypeId}-${minOrd}-${maxOrd}`
      }
      case 'FileType': {
        const f = node as FileTypeNode
        if (
          f.elementType &&
          f.elementType.kind === 'SimpleType' &&
          (f.elementType as SimpleTypeNode).name.name.toUpperCase() === 'CHAR'
        ) {
          return 'text'
        }
        const elemTypeId = f.elementType ? this.resolveTypeId(f.elementType) : 'integer'
        return `file-of-${elemTypeId}`
      }
      default:
        throw new Error(`JS VM: unsupported type ${(node as any).kind}`)
    }
  }

  // 类型种类判断
  private typeKind(typeId: string): string {
    if (
      typeId === 'integer' ||
      typeId === 'real' ||
      typeId === 'boolean' ||
      typeId === 'char' ||
      typeId === 'string' ||
      typeId === 'text'
    ) {
      return typeId
    }
    if (typeId === 'set' || typeId.startsWith('set-of-')) return 'set'
    if (typeId.startsWith('array-')) return 'array'
    if (typeId.startsWith('record-')) return 'record'
    if (typeId.startsWith('file-of-')) return 'file'
    const td = this.typeTable.get(typeId) as any
    return td?.kind || 'unknown'
  }

  // scalar 且用裸值表示（integer/real/boolean/subrange/enum 内部都是 number/boolean）
  private isScalarBare(typeId: string): boolean {
    if (typeId === 'integer' || typeId === 'real' || typeId === 'boolean') return true
    const k = this.typeKind(typeId)
    return k === 'subrange' || k === 'enum'
  }

  // 缩并为基本标量类型（subrange → base, enum → integer）
  private scalarBase(typeId: string): string {
    if (typeId === 'integer') return 'integer'
    if (typeId === 'real') return 'real'
    if (typeId === 'boolean') return 'boolean'
    if (typeId === 'char') return 'char'
    if (typeId === 'string') return 'string'
    const k = this.typeKind(typeId)
    if (k === 'subrange') {
      // 从 subrange-${min}-${max}-of-${base} 解析 base
      const b = this.subrangeBounds(typeId)
      return b ? b.base : 'integer'
    }
    if (k === 'enum') return 'integer'
    return typeId
  }

  // 解析 subrange typeId 的边界信息
  private subrangeBounds(typeId: string): { min: number; max: number; base: string } | null {
    const m = typeId.match(/^subrange-(-?\d+)-(-?\d+)-of-(.+)$/)
    if (!m) return null
    return { min: parseInt(m[1], 10), max: parseInt(m[2], 10), base: m[3] }
  }

  // record 字段类型
  private recordFieldType(recordTypeId: string, fieldName: string): string | null {
    const td = this.typeTable.get(recordTypeId) as any
    if (!td || td.kind !== 'record') return null
    const f = td.fields.find((x: any) => x.name === fieldName.toUpperCase())
    return f ? f.typeId : null
  }

  // 获取数组第 idx 个维度的边界（支持嵌套数组和压平多维数组）
  private arrayDimAt(arrayTypeId: string, idx: number): { low: number; high: number } | null {
    let t = arrayTypeId
    let consumed = 0
    while (idx >= consumed) {
      const td = this.typeTable.get(t) as any
      if (!td || td.kind !== 'array') return null
      const dims = td.dimensions || []
      if (dims.length === 0) return null
      if (dims.length > 1) {
        // 压平的多维数组：所有维度都在这一层
        const offset = idx - consumed
        if (offset < dims.length) {
          return { low: dims[offset].low, high: dims[offset].high }
        }
        return null
      }
      // 嵌套数组：1 个维度，进入下一层
      if (idx === consumed) {
        return { low: dims[0].low, high: dims[0].high }
      }
      consumed++
      t = td.elementTypeId
    }
    return null
  }

  // 从数组类型出发，应用 n 个索引后得到的最终类型
  private arrayElementAfterNIndices(arrayTypeId: string, n: number): string | null {
    let t = arrayTypeId
    for (let i = 0; i < n; i++) {
      const td = this.typeTable.get(t) as any
      if (!td || td.kind !== 'array') return null
      const dims = td.dimensions || []
      if (dims.length === 0) return null
      if (dims.length === 1) {
        // 嵌套数组：消耗 1 个维度，进入 elementTypeId
        t = td.elementTypeId
      } else {
        // 压平的多维数组：一次性消耗所有维度
        if (i === 0) {
          t = td.elementTypeId
        }
        // 剩下的索引已经没有更多维度可以消耗了，但压平数组要求所有索引一次性给出
        // 这里我们假设调用方已经确保索引数量正确
        break
      }
    }
    return t
  }

  // array 元素类型
  private arrayElementType(arrayTypeId: string): string | null {
    const td = this.typeTable.get(arrayTypeId) as any
    if (!td || td.kind !== 'array') return null
    return td.elementTypeId
  }

  // array 维度信息：[{low, high}, ...]
  private arrayDims(arrayTypeId: string): { low: number; high: number }[] {
    const td = this.typeTable.get(arrayTypeId) as any
    if (!td || td.kind !== 'array') return []
    const dims = td.dimensions || []
    return dims.map((d: any) => ({ low: d.low, high: d.high }))
  }

  // ---- 收集 ----

  private collectConsts(consts: ConstDeclarationNode[]) {
    // 常量在全局作用域，作为全局变量
    for (const c of consts) {
      const t = this.inferType(c.value, this.globalScope)
      this.globalScope.declare(c.name.name, t)
    }
  }

  private collectGlobals(vars: VariableDeclarationNode[]) {
    for (const decl of vars) {
      const t = this.resolveTypeId(decl.type)
      const st = this.scalarBase(t)
      for (const n of decl.names) {
        this.globalScope.declare(n.name, st, false, t)
      }
    }
  }

  private collectProcs(procs: ProcedureDeclarationNode[], funcs: FunctionDeclarationNode[]) {
    this.collectProcsRecursive(procs, funcs, null, '')
  }

  // 递归收集过程（含嵌套）。parentJsName 用于生成唯一 jsName（如 p_outer__inner）
  private collectProcsRecursive(
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
      return this.procs.get(name)
    }
    // 递归收集嵌套
    const recurseNested = (info: ProcInfo, block: BlockNode) => {
      this.collectProcsRecursive(
        block.procedureDeclarations,
        block.functionDeclarations,
        info,
        info.jsName
      )
    }
    for (const p of procs) {
      const name = p.name.name.toUpperCase()
      const params = this.collectParams(p.parameters)
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
      else this.procs.set(name, info)
      if (p.block) recurseNested(info, p.block)
    }
    for (const f of funcs) {
      const name = f.name.name.toUpperCase()
      const params = this.collectParams(f.parameters)
      const retType = this.scalarBase(this.resolveTypeId(f.returnType))
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
      else this.procs.set(name, info)
      if (f.block) recurseNested(info, f.block)
    }
  }

  private collectParams(
    params: ParameterDeclarationNode[]
  ): { name: string; typeId: string; isVar: boolean }[] {
    const result: { name: string; typeId: string; isVar: boolean }[] = []
    for (const p of params) {
      const t = this.resolveTypeId(p.type)
      const st = this.scalarBase(t)
      for (const n of p.names) {
        result.push({ name: n.name, typeId: st, isVar: p.isVar })
      }
    }
    return result
  }

  // ---- 全局声明生成 ----

  private emitGlobalDecls(block: BlockNode): string {
    const lines: string[] = []
    // 常量
    for (const c of block.constDeclarations) {
      const { code, type } = this.emitExpr(c.value, this.globalScope)
      lines.push(
        `const ${c.name.name} = ${this.coerce(code, type, this.inferType(c.value, this.globalScope))}`
      )
    }
    // 全局变量
    for (const decl of block.variableDeclarations) {
      const t = this.resolveTypeId(decl.type)
      const st = this.scalarBase(t)
      const init = this.defaultInit(t, st)
      for (const n of decl.names) {
        lines.push(`let ${n.name} = ${init}`)
      }
    }
    return lines.join('\n')
  }

  // defaultInit：t 是原始 typeId，st 是缩并后的 scalar 类型
  private defaultInit(t: string, st: string): string {
    // subrange：用下界作为默认值
    if (st === 'integer' || st === 'char' || st === 'boolean') {
      const b = this.subrangeBounds(t)
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

  private emitProc(info: ProcInfo, parentScope: Scope = this.globalScope): string {
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
      localDecls.push(`let __ret = ${this.defaultInit(actual.returnType, actual.returnType)}`)
    }
    // 局部 const integer（type 边界可能引用）— 先于 type 处理
    const savedAliases: [string, string | undefined][] = []
    const savedConstInts: [string, number | undefined][] = []
    for (const c of block.constDeclarations) {
      const v = this.tryEvalConstInt(c.value)
      if (v !== undefined) {
        const key = c.name.name.toUpperCase()
        savedConstInts.push([key, this.constInts.get(key)])
        this.constInts.set(key, v)
      }
    }
    // 局部类型声明：注册到 aliasMap（暂用 save/restore 模拟作用域）
    for (const t of block.typeDeclarations) {
      const key = t.name.name.toUpperCase()
      savedAliases.push([key, this.aliasMap.get(key)])
      const typeId = this.resolveTypeId(t.typeDef)
      this.aliasMap.set(key, typeId)
    }
    // 局部变量
    for (const decl of block.variableDeclarations) {
      const t = this.resolveTypeId(decl.type)
      const st = this.scalarBase(t)
      const init = this.defaultInit(t, st)
      for (const n of decl.names) {
        scope.declare(n.name, st, false, t)
        localDecls.push(`let ${n.name} = ${init}`)
      }
    }
    // 局部常量
    for (const c of block.constDeclarations) {
      const { code, type } = this.emitExpr(c.value, scope)
      const inferType = this.inferType(c.value, scope)
      localDecls.push(`const ${c.name.name} = ${this.coerce(code, type, inferType)}`)
      scope.declare(c.name.name, inferType)
    }
    // 嵌套过程的 JS 函数定义（放在父过程函数体内，闭包捕获父局部变量）
    const nestedDefs = actual.children
      .filter((c) => !c.isForward || c.forwardDef)
      .map((c) => this.emitProc(c, scope))
      .filter((s) => s.length > 0)
    // 函数体
    const body = this.emitBody(block, scope, 2)
    // 恢复 aliasMap / constInts
    for (const [k, v] of savedAliases) {
      if (v === undefined) this.aliasMap.delete(k)
      else this.aliasMap.set(k, v)
    }
    for (const [k, v] of savedConstInts) {
      if (v === undefined) this.constInts.delete(k)
      else this.constInts.set(k, v)
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

  // 扫描 compound 中顶层出现的 LabeledStatement，收集 label
  private collectLabelsFromCompound(compound: CompoundStatementNode): IntegerLiteralNode[] {
    const labels: IntegerLiteralNode[] = []
    for (const s of compound.statements) {
      if (s.kind === 'LabeledStatement') {
        labels.push((s as LabeledStatementNode).label as IntegerLiteralNode)
      }
    }
    return labels
  }

  // 过程/主程序体生成：根据 label 分析选择最优策略
  private emitBody(block: BlockNode, scope: Scope, indent: number): string {
    const declaredLabels = block.labelDeclarations ? block.labelDeclarations.labels : []
    let allLabels = declaredLabels
    if (this.allowUndeclaredLabels) {
      const inferred = this.collectLabelsFromCompound(block.compound)
      const declaredSet = new Set(declaredLabels.map((l) => l.value))
      for (const l of inferred) {
        if (!declaredSet.has(l.value)) {
          allLabels = [...allLabels, l]
        }
      }
    }
    if (allLabels.length === 0) {
      return this.emitCompound(block.compound, scope, indent)
    }

    return emitBlockWithGoto(block.compound, scope, indent, allLabels, this)
  }

  private emitCompound(node: CompoundStatementNode, scope: Scope, indent: number): string {
    const pad = ' '.repeat(indent)
    const lines = node.statements
      .map((s) => this.emitStmt(s, scope, indent))
      .filter((x) => x.length > 0)
    return lines.join('\n')
  }

  emitStmt(node: StatementNode, scope: Scope, indent: number): string {
    const pad = ' '.repeat(indent)
    switch (node.kind) {
      case 'CompoundStatement':
        return this.emitCompound(node as CompoundStatementNode, scope, indent)

      case 'EmptyStatement':
        return ''

      case 'Assignment': {
        const a = node as AssignmentNode
        return pad + this.emitAssignment(a, scope)
      }

      case 'IfStatement': {
        const i = node as IfStatementNode
        const cond = this.emitExpr(i.condition, scope)
        const thenCode = this.emitStmt(i.thenBranch, scope, indent + 2)
        const lines = [`${pad}if (${this.toBool(cond.code, cond.type)}) {`, thenCode]
        if (i.elseBranch) {
          const elseCode = this.emitStmt(i.elseBranch, scope, indent + 2)
          lines.push(`${pad}} else {`, elseCode)
        }
        lines.push(`${pad}}`)
        return lines.join('\n')
      }

      case 'WhileStatement': {
        const w = node as WhileStatementNode
        const cond = this.emitExpr(w.condition, scope)
        const body = this.emitStmt(w.body, scope, indent + 2)
        // 在状态机模式下，如果 __skipTo 还没被吸收，跳过 body 继续循环
        const skipCheck =
          this.gotoMode === 'exception'
            ? `${pad}  if (__skipTo !== null) { if (${this.toBool(cond.code, cond.type)}) continue; else break; }\n`
            : ''
        return [
          `${pad}while (${this.toBool(cond.code, cond.type)}) {`,
          `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`,
          skipCheck,
          body,
          `${pad}}`,
        ].join('\n')
      }

      case 'RepeatStatement': {
        const r = node as RepeatStatementNode
        const bodyStmts = r.statements
          .map((s) => this.emitStmt(s, scope, indent + 2))
          .filter((x) => x.length > 0)
        const cond = this.emitExpr(r.untilCondition, scope)
        const skipCheck =
          this.gotoMode === 'exception'
            ? `${pad}  if (__skipTo !== null) { if (!(${this.toBool(cond.code, cond.type)})) continue; }\n`
            : ''
        return [
          `${pad}do {`,
          `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`,
          ...bodyStmts,
          skipCheck,
          `${pad}} while (!(${this.toBool(cond.code, cond.type)}));`,
        ].join('\n')
      }

      case 'ForStatement': {
        const f = node as ForStatementNode
        const vi = scope.lookup(f.variable.name)
        const vName = vi ? vi.jsName : f.variable.name
        const init = this.emitExpr(f.initial, scope)
        const final = this.emitExpr(f.final, scope)
        const body = this.emitStmt(f.body, scope, indent + 2)
        if (f.direction === 'TO') {
          const skipCheck =
            this.gotoMode === 'exception'
              ? `${pad}  if (__skipTo !== null) { if (${vName} <= ${this.toInt(final.code, final.type)}) continue; else break; }\n`
              : ''
          return [
            `${pad}for (${vName} = ${this.toInt(init.code, init.type)}; ${vName} <= ${this.toInt(final.code, final.type)}; ${vName} = (${vName} + 1) | 0) {`,
            `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`,
            skipCheck,
            body,
            `${pad}}`,
          ].join('\n')
        } else {
          const skipCheck =
            this.gotoMode === 'exception'
              ? `${pad}  if (__skipTo !== null) { if (${vName} >= ${this.toInt(final.code, final.type)}) continue; else break; }\n`
              : ''
          return [
            `${pad}for (${vName} = ${this.toInt(init.code, init.type)}; ${vName} >= ${this.toInt(final.code, final.type)}; ${vName} = (${vName} - 1) | 0) {`,
            `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`,
            skipCheck,
            body,
            `${pad}}`,
          ].join('\n')
        }
      }

      case 'ProcedureCall': {
        const pc = node as ProcedureCallNode
        return pad + this.emitProcedureCall(pc, scope)
      }

      case 'GotoStatement': {
        const gs = node as GotoStatementNode
        const lblName = String((gs.label as any).value)
        if (this.gotoMode === 'continue') {
          return `${pad}continue ${this.gotoLabel}`
        }
        if (this.gotoMode === 'break') {
          return `${pad}break ${this.gotoLabel}`
        }
        if (this.gotoMode === 'exception') {
          return `${pad}throw Object.assign(new Error('goto'), { __goto: ${JSON.stringify(lblName)} })`
        }
        if (this.labelCases) {
          const caseNum = this.labelCases.get(lblName)
          if (caseNum === undefined) {
            // 如果当前状态机找不到这个 label，说明要跳到外层，用 break 退出当前状态机
            if (this.labelSwitchName) {
              return `${pad}break ${this.labelSwitchName}`
            }
            throw new Error(`JS VM: goto ${lblName} - label not found`)
          }
          const continueLabel = this.labelSwitchName ? ` ${this.labelSwitchName}` : ''
          return `${pad}__pc = ${caseNum}; continue${continueLabel}`
        }
        return `${pad}throw new Error('JS VM: goto ${lblName} - label not found in current scope')`
      }

      case 'LabeledStatement': {
        const ls = node as LabeledStatementNode
        const lblName = String((ls.label as any).value)
        const innerCode = this.emitStmt(ls.statement, scope, indent)
        if (this.gotoMode === 'exception' && this.labelCases?.has(lblName)) {
          // 状态机模式：遇到匹配的 __skipTo 时清除标记
          return `${pad}if (__skipTo === ${JSON.stringify(lblName)}) { __skipTo = null; }\n${innerCode}`
        }
        return innerCode
      }

      case 'CaseStatement': {
        const cs = node as CaseStatementNode
        return pad + this.emitCase(cs, scope, indent)
      }

      case 'WithStatement': {
        const ws = node as WithStatementNode
        return this.emitWith(ws, scope, indent)
      }

      default:
        throw new Error(`JS VM: unsupported statement ${(node as any).kind}`)
    }
  }

  // CASE 语句 → JS switch
  private emitCase(node: CaseStatementNode, scope: Scope, indent: number): string {
    const pad = ' '.repeat(indent)
    const expr = this.emitExpr(node.expression, scope)
    // 把表达式统一转为 integer（integer/char/boolean/enum 都 OK）
    const switchExpr = this.toCaseInt(expr.code, expr.type)
    const lines: string[] = []
    lines.push(`switch (${switchExpr}) {`)
    for (const branch of node.branches) {
      for (const labelExpr of branch.labels) {
        const lbl = this.emitExpr(labelExpr, scope)
        lines.push(`${pad}  case ${this.toCaseInt(lbl.code, lbl.type)}:`)
      }
      const stmt = this.emitStmt(branch.statement, scope, indent + 4)
      lines.push(stmt)
      lines.push(`${pad}    break;`)
    }
    if (node.otherwise) {
      const stmt = this.emitStmt(node.otherwise, scope, indent + 4)
      lines.push(`${pad}  default:`)
      lines.push(stmt)
      lines.push(`${pad}    break;`)
    }
    lines.push(`${pad}}`)
    return lines.join('\n')
  }

  // CASE 表达式 → integer
  private toCaseInt(code: string, type: string): string {
    if (type === 'integer') return code
    if (type === 'char') return `(${code}).raw.charCodeAt(0)`
    if (type === 'boolean') return `(${code} ? 1 : 0)`
    // enum/subrange 已经是 integer 裸值
    return code
  }

  // WITH 语句
  private emitWith(node: WithStatementNode, scope: Scope, indent: number): string {
    const pad = ' '.repeat(indent)
    const tmpNames: string[] = []
    const tmpTypeIds: string[] = []
    const lines: string[] = []
    lines.push(`${pad}{`)
    node.records.forEach((r) => {
      const e = this.emitExpr(r, scope)
      const tmpName = `__with_${this.withVarCounter++}`
      lines.push(`${pad}  const ${tmpName} = ${e.code}`)
      tmpNames.push(tmpName)
      tmpTypeIds.push(e.type)
    })
    const withScope = new Scope(scope)
    withScope.withRecords = tmpNames.map((n, i) => ({ jsName: n, typeId: tmpTypeIds[i] }))
    const body = this.emitStmt(node.body, withScope, indent + 2)
    lines.push(body)
    lines.push(`${pad}}`)
    return lines.join('\n')
  }

  // 生成 subrange 边界检查代码（如果不是 subrange 则原样返回）
  private rangeCheck(code: string, origTypeId: string): string {
    const b = this.subrangeBounds(origTypeId)
    if (!b) return code
    if (b.base === 'char') {
      // char 存储为 PascalValue，需取 .raw 转 charCode 检查
      return `((__v) => { let __c = (typeof __v === 'object' && __v && __v.raw !== undefined) ? (typeof __v.raw === 'string' ? __v.raw.charCodeAt(0) : __v.raw) : __v; if (__c < ${b.min} || __c > ${b.max}) throw new Error('JS VM: char value ' + __c + ' out of range ${b.min}..${b.max}'); return __v })(${code})`
    }
    return `((__v) => { if (__v < ${b.min} || __v > ${b.max}) throw new Error('JS VM: value ' + __v + ' out of range ${b.min}..${b.max}'); return __v })(${code})`
  }

  private emitAssignment(a: AssignmentNode, scope: Scope): string {
    // 左值类型：
    //   Identifier -> 变量赋值
    //   ArrayAccess -> a[i] := v  (数组元素赋值)
    //   FieldAccess -> r.f := v   (record 字段赋值)
    //   WITH 字段 -> __with_N.raw['FIELD'] = v
    if (a.left.kind === 'Identifier') {
      const id = a.left as IdentifierNode
      // 检查是否是 WITH 字段
      const withField = this.findWithField(id.name, scope)
      if (withField) {
        const rhs = this.emitExpr(a.right, scope)
        const target = `${withField.recordJsName}.raw[${JSON.stringify(id.name.toUpperCase())}]`
        return `${target} = ${this.rangeCheck(this.toRawValue(rhs.code, rhs.type, withField.fieldTypeId), withField.fieldTypeId)}`
      }
      const vi = scope.lookup(id.name)
      if (!vi) throw new Error(`JS VM: undefined variable ${id.name}`)
      const rhs = this.emitExpr(a.right, scope)
      const code = this.coerce(rhs.code, rhs.type, vi.typeId)
      const checked = this.rangeCheck(code, vi.origTypeId)
      // set/array/record 赋值需要深拷贝
      if (this.typeKind(vi.typeId) === 'set') {
        const copied = `ctx.box(${JSON.stringify(vi.typeId)}, new Set((${checked}).raw))`
        if (vi.isVar && this.isScalarBare(vi.typeId)) {
          return `${vi.jsName}.v = ${copied}`
        }
        return `${vi.jsName} = ${copied}`
      }
      // var 参数（scalar）：赋值到 .v
      if (vi.isVar && this.isScalarBare(vi.typeId)) {
        return `${vi.jsName}.v = ${checked}`
      }
      return `${vi.jsName} = ${checked}`
    }
    if (a.left.kind === 'ArrayAccess') {
      const aa = a.left as ArrayAccessNode
      const arr = this.emitExpr(aa.array, scope)
      const elemTypeId = this.arrayElementAfterNIndices(arr.type, aa.indices.length)
      if (!elemTypeId) throw new Error(`JS VM: ${arr.type} is not indexable`)
      const idxCodes: string[] = []
      for (let i = 0; i < aa.indices.length; i++) {
        const idx = this.emitExpr(aa.indices[i], scope)
        let idxCode = this.toInt(idx.code, idx.type)
        const d = this.arrayDimAt(arr.type, i)
        if (d) {
          idxCode = `ctx.checkArrayIndex(${idxCode}, ${d.low}, ${d.high})`
        }
        idxCodes.push(idxCode)
      }
      let idxCode = `${arr.code}.raw`
      for (const ic of idxCodes) {
        idxCode += `[${ic}]`
      }
      const rhs = this.emitExpr(a.right, scope)
      return `${idxCode} = ${this.rangeCheck(this.toRawValue(rhs.code, rhs.type, elemTypeId), elemTypeId)}`
    }
    if (a.left.kind === 'FieldAccess') {
      const fa = a.left as FieldAccessNode
      // record 字段赋值：r.f := v -> r.raw['F'] = v.raw (或裸值)
      const obj = this.emitExpr(fa.object, scope)
      const fieldName = fa.field.name.toUpperCase()
      const fieldTypeId = this.recordFieldType(obj.type, fieldName)
      if (!fieldTypeId) throw new Error(`JS VM: record ${obj.type} has no field ${fieldName}`)
      const rhs = this.emitExpr(a.right, scope)
      return `${obj.code}.raw[${JSON.stringify(fieldName)}] = ${this.rangeCheck(this.toRawValue(rhs.code, rhs.type, fieldTypeId), fieldTypeId)}`
    }
    throw new Error(`JS VM: unsupported assignment target ${(a.left as any).kind}`)
  }

  // 把 rhs 转为存储到 array/record 中的 raw 值
  // scalar (integer/real/boolean): 裸值
  // char/string: raw（取 .raw）
  // array/record: raw（取 .raw）
  private toRawValue(code: string, fromType: string, toTypeId: string): string {
    if (this.isScalarBare(fromType)) {
      // scalar 裸值 → 直接存（可能需要类型转换）
      return this.coerce(code, fromType, this.scalarBase(toTypeId))
    }
    // char/string/array/record：从 PascalValue 取 .raw
    return `(${code}).raw`
  }

  // 查找 WITH 字段
  private findWithField(
    name: string,
    scope: Scope
  ): { recordJsName: string; fieldTypeId: string } | null {
    const upper = name.toUpperCase()
    for (const wr of scope.allWithRecords()) {
      const fieldTypeId = this.recordFieldType(wr.typeId, upper)
      if (fieldTypeId) {
        return { recordJsName: wr.jsName, fieldTypeId }
      }
    }
    return null
  }

  private emitProcedureCall(pc: ProcedureCallNode, scope: Scope): string {
    const name = pc.name.name.toUpperCase()
    if (BUILTIN_SYSCALLS.has(name)) {
      // WRITELN/WRITE: 对 real 参数预先用 ctx.formatReal 格式化为 string，
      // Pascal 实数格式化（指数补零为 3 位）
      if (name === 'WRITE' || name === 'WRITELN') {
        const args = pc.arguments.map((a) => {
          // 处理格式化参数 value:width 或 value:width:precision
          // parser 把 : 包装成 BinaryExpression { op: ':' }
          if (a.kind === 'BinaryExpression' && (a as any).operator === ':') {
            const bin = a as BinaryExpressionNode
            // 内层可能是 value:width，外层是 (value:width):precision
            let valueExpr: ExpressionNode = bin.left
            let widthExpr: ExpressionNode = bin.right
            let precExpr: ExpressionNode | null = null
            if (bin.left.kind === 'BinaryExpression' && (bin.left as any).operator === ':') {
              const inner = bin.left as BinaryExpressionNode
              valueExpr = inner.left
              widthExpr = inner.right
              precExpr = bin.right
            }
            const v = this.emitExpr(valueExpr, scope)
            const w = this.emitExpr(widthExpr, scope)
            // real 类型在 JS path 已经预格式化；其他类型走 emitArgFromExpr 装箱
            let valueCode: string
            if (v.type === 'real') {
              valueCode = `ctx.box('string', ctx.formatReal(${v.code}))`
            } else {
              valueCode = this.emitArgFromExpr(v)
            }
            const precPart = precExpr ? `, precision: ${this.emitExpr(precExpr, scope).code}` : ''
            return `{value: ${valueCode}, width: ${this.toInt(w.code, w.type)}${precPart}}`
          }
          const e = this.emitExpr(a, scope)
          if (e.type === 'real') {
            return `ctx.box('string', ctx.formatReal(${e.code}))`
          }
          return this.emitArgFromExpr(e)
        })
        return `await ctx.sysCall(${JSON.stringify(name)}, [${args.join(', ')}])`
      }
      // READ/READLN：控制台模式内联（绕过 io.plugin 用 ref 写回，JS 路径无 ref）
      // 文件模式仍走 sysCall（但写回有 bug，待 Phase 3.5 修）
      if (name === 'READ' || name === 'READLN') {
        return this.emitRead(pc, scope, name === 'READLN')
      }
      const args = pc.arguments.map((a) => this.emitArg(a, scope))
      return `await ctx.sysCall(${JSON.stringify(name)}, [${args.join(', ')}])`
    }
    // 用户过程（按作用域查找：嵌套过程 → 外层 → 全局）
    const info = scope.lookupProc(name) || this.procs.get(name)
    if (!info) throw new Error(`JS VM: unknown procedure ${pc.name.name}`)
    // 检查是否有 scalar var 参数（需要 box + 写回）
    const varBoxes: { argIdx: number; argJsName: string; boxName: string }[] = []
    const args = pc.arguments.map((a, i) => {
      const paramInfo = info.params[i]
      const pType = paramInfo?.typeId || 'integer'
      const e = this.emitExpr(a, scope)
      if (paramInfo?.isVar) {
        // var 参数：传引用
        // 链式 var：实参是 var 参数（scalar），直接传容器对象
        if (a.kind === 'Identifier') {
          const argVi = scope.lookup((a as IdentifierNode).name)
          if (argVi?.isVar && this.isScalarBare(argVi.typeId)) {
            return argVi.jsName
          }
          // 普通 scalar 变量：用 box 包装，调用后写回
          if (this.isScalarBare(pType) && argVi) {
            const boxName = `__box_${varBoxes.length}`
            varBoxes.push({ argIdx: i, argJsName: argVi.jsName, boxName })
            return boxName
          }
          // 复杂类型变量：直接传引用
          if (argVi) {
            return e.code
          }
        }
        // 数组元素或记录字段：也是合法的 var 实参（左值）
        if (a.kind === 'ArrayAccess' || a.kind === 'FieldAccess') {
          return e.code
        }
        // var 参数必须是变量（左值），否则报错
        throw new Error(`Variable required as var parameter: ${paramInfo.name || `arg${i}`}`)
      }
      // value 参数：传值（scalar 裸值 / 复杂类型 PascalValue）
      return this.coerce(e.code, e.type, pType)
    })
    // 无 scalar var 参数：直接调用
    if (varBoxes.length === 0) {
      return `await ${info.jsName}(ctx, ${args.join(', ')})`
    }
    // 有 scalar var 参数：包装 box + 调用 + 写回
    const lines: string[] = ['{']
    for (const b of varBoxes) {
      lines.push(`  const ${b.boxName} = {v: ${b.argJsName}}`)
    }
    lines.push(`  await ${info.jsName}(ctx, ${args.join(', ')})`)
    for (const b of varBoxes) {
      lines.push(`  ${b.argJsName} = ${b.boxName}.v`)
    }
    lines.push('}')
    return lines.join('\n')
  }

  // READ/READLN 内联生成
  // 控制台模式：从 ctx.inputQueue 取一行，按 whitespace 拆 token，依次赋给变量
  // 文件模式：暂走 sysCall（写回变量有 bug，待 Phase 3.5 实现 F^/文件 I/O 时一起修）
  private emitRead(pc: ProcedureCallNode, scope: Scope, isReadln: boolean): string {
    const args = pc.arguments
    // 第一参数是 file 变量？文件模式内联（用 ctx.io.file 方法直接读 + 直接写回变量）
    if (args.length > 0 && args[0].kind === 'Identifier') {
      const vi0 = scope.lookup((args[0] as IdentifierNode).name)
      if (vi0 && (vi0.typeId === 'text' || vi0.typeId.startsWith('file-of-'))) {
        const lines: string[] = ['{']
        lines.push(`  const __f = ${vi0.jsName}.raw`)
        for (let i = 1; i < args.length; i++) {
          const a = args[i]
          if (a.kind !== 'Identifier') continue
          const id = a as IdentifierNode
          const vi = scope.lookup(id.name)
          if (!vi) throw new Error(`JS VM: undefined variable ${id.name}`)
          const st = vi.typeId
          if (st === 'char') {
            // char: 读当前字符（不跳过空白），然后 get 推进
            lines.push(
              `  ${vi.jsName}.raw = String.fromCharCode(await ctx.io.file.bufferChar(__f))`
            )
            lines.push(`  await ctx.io.file.get(__f)`)
          } else {
            // integer/real/string: 跳过空白，读 token
            lines.push('  {')
            lines.push('    let __ch = await ctx.io.file.bufferChar(__f)')
            lines.push('    while (__ch === 32 || __ch === 10 || __ch === 13 || __ch === 9) {')
            lines.push('      await ctx.io.file.get(__f)')
            lines.push('      __ch = await ctx.io.file.bufferChar(__f)')
            lines.push('    }')
            lines.push('    let __s = ""')
            lines.push(
              '    while (__ch !== 32 && __ch !== 10 && __ch !== 13 && __ch !== 9 && __ch !== 0) {'
            )
            lines.push('      __s += String.fromCharCode(__ch)')
            lines.push('      await ctx.io.file.get(__f)')
            lines.push('      __ch = await ctx.io.file.bufferChar(__f)')
            lines.push('    }')
            if (st === 'integer') {
              lines.push(`    ${vi.jsName} = parseInt(__s, 10) | 0`)
            } else if (st === 'real') {
              lines.push(`    ${vi.jsName} = parseFloat(__s)`)
            } else if (st === 'string') {
              lines.push(`    ${vi.jsName}.raw = __s`)
            }
            lines.push('  }')
          }
        }
        if (isReadln) {
          lines.push(`  await ctx.io.file.readln(__f)`)
        }
        lines.push('}')
        return lines.join('\n')
      }
    }
    // 控制台模式：内联
    const lines: string[] = ['{']
    lines.push('  const __line = ctx.inputQueue.length > 0 ? ctx.inputQueue.shift() : ""')
    lines.push('  const __toks = __line.split(/\\s+/).filter(s => s.length > 0)')
    lines.push('  let __i = 0')
    for (const a of args) {
      if (a.kind !== 'Identifier') continue
      const id = a as IdentifierNode
      const vi = scope.lookup(id.name)
      if (!vi) throw new Error(`JS VM: undefined variable ${id.name}`)
      const st = vi.typeId
      if (st === 'integer') {
        lines.push(`  ${vi.jsName} = (__i < __toks.length) ? (parseInt(__toks[__i++], 10) | 0) : 0`)
      } else if (st === 'real') {
        lines.push(`  ${vi.jsName} = (__i < __toks.length) ? parseFloat(__toks[__i++]) : 0`)
      } else if (st === 'char') {
        lines.push(
          `  ${vi.jsName}.raw = (__i < __toks.length) ? __toks[__i++].charAt(0) : '\\u0000'`
        )
      } else if (st === 'string') {
        lines.push(`  ${vi.jsName}.raw = (__i < __toks.length) ? __toks[__i++] : ''`)
      }
    }
    lines.push('}')
    return lines.join('\n')
  }

  // ---- 表达式生成 ----

  // 返回 { code, type }。code 产出：
  //   integer/real/boolean → 裸值
  //   char/string/array/record → PascalValue
  private emitExpr(node: ExpressionNode, scope: Scope): { code: string; type: string } {
    switch (node.kind) {
      case 'IntegerLiteral':
        return { code: String((node as any).value), type: 'integer' }
      case 'RealLiteral':
        return { code: String((node as any).value), type: 'real' }
      case 'BooleanLiteral':
        return { code: String((node as any).value), type: 'boolean' }
      case 'StringLiteral': {
        const s = (node as any).value as string
        // 单字符字符串字面量在 Pascal 里是 char
        if (s.length === 1) {
          return { code: `ctx.box('char', ${JSON.stringify(s)})`, type: 'char' }
        }
        return { code: `ctx.box('string', ${JSON.stringify(s)})`, type: 'string' }
      }
      case 'CharLiteral':
        return { code: `ctx.box('char', ${JSON.stringify((node as any).value)})`, type: 'char' }
      case 'Identifier': {
        const name = (node as IdentifierNode).name
        // 1. enum 常量
        if (this.enumConstants.has(name.toUpperCase())) {
          return { code: String(this.enumConstants.get(name.toUpperCase())), type: 'integer' }
        }
        // 2. WITH 字段（优先于普通变量查找）
        const withField = this.findWithField(name, scope)
        if (withField) {
          const st = this.scalarBase(withField.fieldTypeId)
          const rawCode = `${withField.recordJsName}.raw[${JSON.stringify(name.toUpperCase())}]`
          if (st === 'integer' || st === 'real' || st === 'boolean') {
            return { code: rawCode, type: st }
          }
          // char/string/array/record：包装为 PascalValue
          return {
            code: `ctx.box(${JSON.stringify(withField.fieldTypeId)}, ${rawCode})`,
            type: withField.fieldTypeId,
          }
        }
        // 3. 普通变量
        const vi = scope.lookup(name)
        if (!vi) {
          // 无参函数省略括号：识别为函数调用
          const procInfo = scope.lookupProc(name) || this.procs.get(name.toUpperCase())
          if (procInfo && procInfo.isFunction && procInfo.params.length === 0) {
            const actual = procInfo.forwardDef || procInfo
            return { code: `(await ${actual.jsName}(ctx))`, type: actual.returnType }
          }
          // 内置无参函数（如 EOF、EOLN、RANDOM）
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
        // var 参数（scalar）：访问 .v
        if (vi.isVar && this.isScalarBare(vi.typeId)) {
          return { code: `${vi.jsName}.v`, type: vi.typeId }
        }
        return { code: vi.jsName, type: vi.typeId }
      }
      case 'ParenthesizedExpression': {
        const inner = this.emitExpr((node as any).expression, scope)
        return { code: `(${inner.code})`, type: inner.type }
      }
      case 'BinaryExpression':
        return this.emitBinary(node as BinaryExpressionNode, scope)
      case 'UnaryExpression':
        return this.emitUnary(node as UnaryExpressionNode, scope)
      case 'FunctionCall':
        return this.emitFunctionCall(node as FunctionCallNode, scope)
      case 'ArrayAccess':
        return this.emitArrayAccess(node as ArrayAccessNode, scope)
      case 'FieldAccess':
        return this.emitFieldAccess(node as FieldAccessNode, scope)
      case 'SetConstructor':
        return this.emitSetConstructor(node as SetConstructorNode, scope)
      case 'InExpression':
        return this.emitInExpression(node as InExpressionNode, scope)
      default:
        throw new Error(`JS VM: unsupported expression ${(node as any).kind}`)
    }
  }

  // 数组访问：a[i] 或 a[i,j]
  private emitArrayAccess(node: ArrayAccessNode, scope: Scope): { code: string; type: string } {
    const arr = this.emitExpr(node.array, scope)
    const elemTypeId = this.arrayElementAfterNIndices(arr.type, node.indices.length)
    if (!elemTypeId) throw new Error(`JS VM: ${arr.type} is not indexable`)
    const idxCodes: string[] = []
    for (let i = 0; i < node.indices.length; i++) {
      const idxExpr = node.indices[i]
      const idx = this.emitExpr(idxExpr, scope)
      let idxCode = this.toInt(idx.code, idx.type)
      const d = this.arrayDimAt(arr.type, i)
      if (d) {
        idxCode = `ctx.checkArrayIndex(${idxCode}, ${d.low}, ${d.high})`
      }
      idxCodes.push(idxCode)
    }
    let code = `${arr.code}.raw`
    for (const idxCode of idxCodes) {
      code += `[${idxCode}]`
    }
    const st = this.scalarBase(elemTypeId)
    if (st === 'integer' || st === 'real' || st === 'boolean') {
      return { code, type: st }
    }
    return { code: `ctx.box(${JSON.stringify(elemTypeId)}, ${code})`, type: elemTypeId }
  }

  // 字段访问：r.f
  private emitFieldAccess(node: FieldAccessNode, scope: Scope): { code: string; type: string } {
    const obj = this.emitExpr(node.object, scope)
    const fieldName = node.field.name.toUpperCase()
    // F^：文件缓冲区访问（F 是 file 类型，F^ 是当前缓冲区字符/元素）
    if (fieldName === '^') {
      if (obj.type === 'text' || obj.type === 'file-of-char') {
        // 无 io（无 files）时返回空格
        return {
          code: `ctx.box('char', ctx.io ? String.fromCharCode(await ctx.io.file.bufferChar(${obj.code}.raw)) : ' ')`,
          type: 'char',
        }
      }
      // 其他 file-of-T：返回当前元素（暂只支持 char/text）
      throw new Error(`JS VM: F^ on ${obj.type} not supported yet`)
    }
    const fieldTypeId = this.recordFieldType(obj.type, fieldName)
    if (!fieldTypeId) throw new Error(`JS VM: record ${obj.type} has no field ${fieldName}`)
    const rawCode = `${obj.code}.raw[${JSON.stringify(fieldName)}]`
    const st = this.scalarBase(fieldTypeId)
    if (st === 'integer' || st === 'real' || st === 'boolean') {
      return { code: rawCode, type: st }
    }
    return { code: `ctx.box(${JSON.stringify(fieldTypeId)}, ${rawCode})`, type: fieldTypeId }
  }

  // 集合构造：[1, 2, 3] 或 [1..5]
  private emitSetConstructor(
    node: SetConstructorNode,
    scope: Scope
  ): { code: string; type: string } {
    const elems: string[] = []
    for (const [start, end] of node.elements) {
      const s = this.emitExpr(start, scope)
      if (end) {
        const e = this.emitExpr(end, scope)
        // range: 从 s 到 e 的所有值
        elems.push(
          `...Array.from({length: (${e.code}) - (${s.code}) + 1}, (_, i) => i + (${s.code}))`
        )
      } else {
        elems.push(this.toInt(s.code, s.type))
      }
    }
    return { code: `ctx.box('set', new Set([${elems.join(', ')}]))`, type: 'set' }
  }

  // IN 表达式：x IN s
  private emitInExpression(node: InExpressionNode, scope: Scope): { code: string; type: string } {
    const l = this.emitExpr(node.left, scope)
    const r = this.emitExpr(node.right, scope)
    // l 是 integer（裸值），r 是 set (PascalValue)
    return { code: `(${r.code}).raw.has(${this.toInt(l.code, l.type)})`, type: 'boolean' }
  }

  private emitBinary(node: BinaryExpressionNode, scope: Scope): { code: string; type: string } {
    const L = this.emitExpr(node.left, scope)
    const R = this.emitExpr(node.right, scope)
    const op = node.operator.toUpperCase()
    const resultType = this.binaryResultType(op, L.type, R.type)
    const isStrChar = (t: string) => t === 'string' || t === 'char'

    switch (op) {
      case '+':
      case '-':
      case '*': {
        if (this.typeKind(resultType) === 'set') {
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
          // '-' set difference
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
        // string/char 连接
        if (resultType === 'string') {
          return { code: `ctx.box('string', (${L.code}).raw + (${R.code}).raw)`, type: 'string' }
        }
        throw new Error(`JS VM: unsupported + for ${L.type}/${R.type}`)
      }
      case '/': // Pascal 实数除
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
        if (resultType === 'boolean')
          return { code: `((${L.code}) && (${R.code}))`, type: 'boolean' }
        return { code: `((${L.code}) & (${R.code}))`, type: 'integer' } // 位运算（Knuth 风格）
      case 'OR':
        if (resultType === 'boolean')
          return { code: `((${L.code}) || (${R.code}))`, type: 'boolean' }
        return { code: `((${L.code}) | (${R.code}))`, type: 'integer' }
      default:
        throw new Error(`JS VM: unsupported binary operator ${op}`)
    }
  }

  private emitUnary(node: UnaryExpressionNode, scope: Scope): { code: string; type: string } {
    const operand = this.emitExpr(node.operand, scope)
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

  private emitFunctionCall(node: FunctionCallNode, scope: Scope): { code: string; type: string } {
    const name = node.name.name.toUpperCase()
    if (BUILTIN_SYSCALLS.has(name)) {
      const argExprs = node.arguments.map((a) => this.emitExpr(a, scope))
      const args = argExprs.map((e, i) => this.emitArgFromExpr(e))
      // PRED/SUCC/ABS/SQR 是多态函数，返回类型跟随参数
      const firstArgType = argExprs[0]?.type
      const retType = builtinReturnType(name, firstArgType)
      // sysCall 返回 PascalValue，取 .raw 得到裸值（scalar）
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
    // 用户函数（按作用域查找：嵌套函数 → 外层 → 全局）
    const info = scope.lookupProc(name) || this.procs.get(name)
    if (!info || !info.isFunction) throw new Error(`JS VM: unknown function ${node.name.name}`)
    const args = node.arguments.map((a, i) => {
      const pType = info.params[i]?.typeId || 'integer'
      const e = this.emitExpr(a, scope)
      return this.coerce(e.code, e.type, pType)
    })
    // 用户函数返回裸值（scalar）或 PascalValue（char/string），无需 .raw
    return { code: `(await ${info.jsName}(ctx, ${args.join(', ')}))`, type: info.returnType }
  }

  // 生成 syscall 参数（始终是 PascalValue）
  private emitArg(node: ExpressionNode, scope: Scope): string {
    const e = this.emitExpr(node, scope)
    return this.emitArgFromExpr(e)
  }

  // 从已 emit 的表达式生成 syscall 参数
  private emitArgFromExpr(e: { code: string; type: string }): string {
    // scalar 裸值 → 装箱
    if (e.type === 'integer') return `ctx.box('integer', ${e.code})`
    if (e.type === 'real') return `ctx.box('real', ${e.code})`
    if (e.type === 'boolean') return `ctx.box('boolean', ${e.code})`
    // char/string/object 已经是 PascalValue
    return e.code
  }

  // ---- 类型推断 ----

  private inferType(node: ExpressionNode, scope: Scope): string {
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
        return this.inferType((node as any).expression, scope)
      case 'BinaryExpression':
        return this.binaryResultType(
          (node as BinaryExpressionNode).operator.toUpperCase(),
          this.inferType((node as BinaryExpressionNode).left, scope),
          this.inferType((node as BinaryExpressionNode).right, scope)
        )
      case 'UnaryExpression': {
        const u = node as UnaryExpressionNode
        return this.inferType(u.operand, scope)
      }
      case 'FunctionCall': {
        const fc = node as FunctionCallNode
        const argType = fc.arguments.length > 0 ? this.inferType(fc.arguments[0], scope) : undefined
        return builtinReturnType(fc.name.name.toUpperCase(), argType)
      }
      default:
        return 'integer'
    }
  }

  private binaryResultType(op: string, lt: string, rt: string): string {
    if (this.typeKind(lt) === 'set' && this.typeKind(rt) === 'set') {
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

  // ---- 类型转换辅助 ----

  // 把 code 的值强制为目标类型
  private coerce(code: string, fromType: string, toType: string): string {
    if (fromType === toType) return code
    if (toType === 'integer') return this.toInt(code, fromType)
    if (toType === 'real') return `(+${code})`
    if (toType === 'boolean') return this.toBool(code, fromType)
    return code
  }

  private toInt(code: string, fromType: string): string {
    if (fromType === 'integer') return `(${code}) | 0`
    if (fromType === 'real') return `Math.trunc(${code}) | 0`
    if (fromType === 'boolean') return `(${code} ? 1 : 0)`
    if (fromType === 'char') return `(${code}.raw.charCodeAt(0)) | 0`
    return code
  }

  private toBool(code: string, fromType: string): string {
    if (fromType === 'boolean') return code
    if (fromType === 'integer') return `(${code} !== 0)`
    return `Boolean(${code})`
  }
}
