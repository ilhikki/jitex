/*
 * IL Analysis — lowering 第一阶段：分析。
 *
 * 输入：ProgramNode（源语言 AST）
 * 输出：Analysis — 只读查询接口 + 全局唯一 ID 计数器
 *
 * 职责：
 *   1. 全局唯一 ID 分配（VarId / LabelId / Function.id 共用）
 *   2. 作用域建立 + 符号绑定（var/param/func/const/type）
 *   3. 标号信息（labelId + funcId）
 *   4. Block↔Function / Decl↔Function 归属
 *   5. 函数签名（params/locals/retval，含类型）
 *   6. with 临时变量分配
 *   7. 表达式类型推断（为编译阶段选 syscall key）
 *   8. symbolOf 缓存（分析阶段填充，编译阶段只读查询）
 */

import {
  ProgramNode,
  BlockNode,
  StatementNode,
  ExpressionNode,
  IdentifierNode,
  ProcedureDeclarationNode,
  FunctionDeclarationNode,
  WithStatementNode,
  TypeNode,
  VariableDeclarationNode,
  ParameterDeclarationNode,
  ConstDeclarationNode,
  LabelDeclarationNode,
  TypeDeclarationNode,
} from '@/ast/types'

// ============================================================
// 类型系统
// ============================================================

export type TypeTag =
  | 'i64'
  | 'f64'
  | 'bool'
  | 'char'
  | 'str'
  | 'array'
  | 'rec'
  | 'set'
  | 'file'
  | 'enum'
  | 'subrange'
  | 'unknown'

export interface TypeInfo {
  tag: TypeTag
  // subrange
  low?: number
  high?: number
  baseTag?: TypeTag
  // array
  dims?: { low: number; high: number }[]
  elem?: TypeInfo
  // record
  fields?: Map<string, TypeInfo>
  // set
  setBase?: TypeInfo
  // file
  fileElem?: TypeInfo | null
  // enum
  enumCount?: number
}

const SIMPLE_TYPES: Record<string, TypeInfo> = {
  integer: { tag: 'i64' },
  longint: { tag: 'i64' },
  shortint: { tag: 'i64' },
  byte: { tag: 'i64' },
  word: { tag: 'i64' },
  cardinal: { tag: 'i64' },
  real: { tag: 'f64' },
  single: { tag: 'f64' },
  double: { tag: 'f64' },
  extended: { tag: 'f64' },
  boolean: { tag: 'bool' },
  char: { tag: 'char' },
  string: { tag: 'str' },
  text: { tag: 'file', fileElem: { tag: 'char' } },
}

function simpleInfo(tag: TypeTag): TypeInfo {
  return { tag }
}

// ============================================================
// 符号
// ============================================================

export interface VarSymbol {
  kind: 'var' | 'param'
  varId: number
  typeInfo: TypeInfo
  isVarParam: boolean
}

export interface FuncSymbol {
  kind: 'func'
  funcId: number
  retTypeInfo?: TypeInfo
}

export interface ConstSymbol {
  kind: 'const'
  literal: { key: string; arg: string }
  typeInfo: TypeInfo
}

export interface TypeSymbol {
  kind: 'type'
  typeInfo: TypeInfo
}

export type Symbol = VarSymbol | FuncSymbol | ConstSymbol | TypeSymbol

// ============================================================
// 函数信息
// ============================================================

export interface FuncInfo {
  funcId: number
  parentFuncId: number | null
  params: VarSymbol[]
  locals: VarSymbol[]
  retval?: VarSymbol
  children: number[]
  hasBody: boolean
  isFunction: boolean
}

// ============================================================
// 内部作用域
// ============================================================

interface Scope {
  bindings: Map<string, Symbol>
  funcId: number
  outer: Scope | null
}

// ============================================================
// Analyzer
// ============================================================

export class Analyzer {
  private nextId_ = 1
  private scopes: Scope[] = []
  private labels = new Map<number, Map<number, { labelId: number; funcId: number }>>()
  private blockFunc = new Map<BlockNode, number>()
  private declFunc = new Map<ProcedureDeclarationNode | FunctionDeclarationNode, number>()
  private funcInfos = new Map<number, FuncInfo>()
  private forwardFuncs = new Map<string, number>()
  private withTemps = new Map<WithStatementNode, VarSymbol[]>()
  private withStack: { fields: Map<string, TypeInfo> }[] = []
  private symbolCache = new Map<IdentifierNode, Symbol | undefined>()
  private exprType = new Map<ExpressionNode, TypeInfo>()
  private typeNodeInfo = new Map<TypeNode, TypeInfo>()
  private typeAliases = new Map<string, TypeInfo>()
  private globalBindings = new Map<string, Symbol>()

  // --------------------------------------------------------
  // 分析入口
  // --------------------------------------------------------

  analyze(program: ProgramNode): Analysis {
    const topFuncId = this.allocFunc(program.block, null, false, null)

    this.pushScope(topFuncId)
    this.analyzeBlock(program.block, topFuncId)
    this.globalBindings = this.currentScope().bindings
    this.popScope()

    return this.freeze()
  }

  // --------------------------------------------------------
  // ID 分配
  // --------------------------------------------------------

  private allocId(): number {
    return this.nextId_++
  }

  // --------------------------------------------------------
  // 作用域
  // --------------------------------------------------------

  private pushScope(funcId: number): void {
    this.scopes.push({
      bindings: new Map(),
      funcId,
      outer: this.scopes.length > 0 ? this.scopes[this.scopes.length - 1] : null,
    })
  }

  private popScope(): void {
    this.scopes.pop()
  }

  private currentScope(): Scope {
    const s = this.scopes[this.scopes.length - 1]
    if (!s) throw new Error('Analyzer: no active scope')
    return s
  }

  // 决策 12：Pascal 标识符大小写不敏感，所有符号绑定/查找用小写 key
  private bind(name: string, sym: Symbol): void {
    this.currentScope().bindings.set(name.toLowerCase(), sym)
  }

  private lookup(name: string): Symbol | undefined {
    const key = name.toLowerCase()
    let s: Scope | null = this.currentScope()
    while (s) {
      const v = s.bindings.get(key)
      if (v) return v
      s = s.outer
    }
    return undefined
  }

  // --------------------------------------------------------
  // 函数分配
  // --------------------------------------------------------

  private allocFunc(
    block: BlockNode | null,
    decl: ProcedureDeclarationNode | FunctionDeclarationNode | null,
    isFunction: boolean,
    parentFuncId: number | null
  ): number {
    const funcId = this.allocId()
    const info: FuncInfo = {
      funcId,
      parentFuncId,
      params: [],
      locals: [],
      children: [],
      hasBody: block !== null,
      isFunction,
    }
    this.funcInfos.set(funcId, info)
    if (parentFuncId !== null) {
      const parent = this.funcInfos.get(parentFuncId)
      if (parent) parent.children.push(funcId)
    }
    if (block) this.blockFunc.set(block, funcId)
    if (decl) this.declFunc.set(decl, funcId)
    return funcId
  }

  // --------------------------------------------------------
  // Block 分析
  // --------------------------------------------------------

  private analyzeBlock(block: BlockNode, funcId: number): void {
    // LABEL — per-function 作用域：每个函数有自己的 label 表。
    // labelInfo 查找时沿 parentFuncId 链向上找（支持跨过程 goto 外层 label）。
    if (block.labelDeclarations) {
      let funcLabels = this.labels.get(funcId)
      if (!funcLabels) {
        funcLabels = new Map()
        this.labels.set(funcId, funcLabels)
      }
      for (const lit of block.labelDeclarations.labels) {
        if (!funcLabels.has(lit.value)) {
          funcLabels.set(lit.value, { labelId: this.allocId(), funcId })
        }
      }
    }

    // CONST
    for (const c of block.constDeclarations) {
      this.analyzeConst(c)
    }

    // TYPE
    for (const t of block.typeDeclarations) {
      const info = this.resolveTypeInfo(t.typeDef)
      this.typeAliases.set(t.name.name.toLowerCase(), info)
      this.bind(t.name.name, { kind: 'type', typeInfo: info })
    }

    // VAR
    const info = this.funcInfos.get(funcId)!
    for (const v of block.variableDeclarations) {
      const ti = this.resolveTypeInfo(v.type)
      for (const name of v.names) {
        const varId = this.allocId()
        const sym: VarSymbol = { kind: 'var', varId, typeInfo: ti, isVarParam: false }
        info.locals.push(sym)
        this.bind(name.name, sym)
      }
    }

    // PROCEDURE / FUNCTION
    for (const p of block.procedureDeclarations) {
      this.analyzeProcDecl(p)
    }
    for (const f of block.functionDeclarations) {
      this.analyzeFuncDecl(f)
    }

    // COMPOUND
    this.analyzeStatement(block.compound)
  }

  private analyzeConst(decl: ConstDeclarationNode): void {
    const lit = this.evalLiteral(decl.value)
    if (lit) {
      const ti = this.typeInfoOfLiteralKey(lit.key)
      this.bind(decl.name.name, { kind: 'const', literal: lit, typeInfo: ti })
    } else {
      this.bind(decl.name.name, { kind: 'type', typeInfo: { tag: 'unknown' } })
    }
  }

  private evalLiteral(
    node: ExpressionNode
  ): { key: string; arg: string } | undefined {
    switch (node.kind) {
      case 'IntegerLiteral':
        return { key: 'i64', arg: node.raw }
      case 'RealLiteral':
        return { key: 'f64', arg: node.raw }
      case 'StringLiteral':
        return { key: 'str', arg: node.value }
      case 'CharLiteral':
        return { key: 'char', arg: node.value }
      case 'BooleanLiteral':
        return { key: 'bool', arg: node.value ? 'true' : 'false' }
      default:
        return undefined
    }
  }

  private typeInfoOfLiteralKey(key: string): TypeInfo {
    switch (key) {
      case 'i64':
        return { tag: 'i64' }
      case 'f64':
        return { tag: 'f64' }
      case 'bool':
        return { tag: 'bool' }
      case 'char':
        return { tag: 'char' }
      case 'str':
        return { tag: 'str' }
      default:
        return { tag: 'unknown' }
    }
  }

  // --------------------------------------------------------
  // 类型解析
  // --------------------------------------------------------

  private resolveTypeInfo(node: TypeNode): TypeInfo {
    const cached = this.typeNodeInfo.get(node)
    if (cached) return cached

    let info: TypeInfo
    switch (node.kind) {
      case 'SimpleType': {
        const name = node.name.name.toLowerCase()
        const builtin = SIMPLE_TYPES[name]
        if (builtin) {
          info = builtin
        } else {
          // 类型别名或枚举
          const alias = this.typeAliases.get(node.name.name.toLowerCase())
          if (alias) {
            info = alias
          } else {
            // 可能是枚举类型名
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
        const low = this.evalConstInt(node.start)
        const high = this.evalConstInt(node.end)
        let baseTag: TypeTag = 'i64'
        if (
          node.start.kind === 'CharLiteral' ||
          node.end.kind === 'CharLiteral'
        ) {
          baseTag = 'char'
        } else if (
          node.start.kind === 'BooleanLiteral' ||
          node.end.kind === 'BooleanLiteral'
        ) {
          baseTag = 'bool'
        }
        info = { tag: 'subrange', low, high, baseTag }
        break
      }
      case 'ArrayType': {
        const dims: { low: number; high: number }[] = []
        for (const idx of node.indexTypes) {
          if (idx.kind === 'RangeType') {
            dims.push({
              low: this.evalConstInt(idx.start) ?? 0,
              high: this.evalConstInt(idx.end) ?? 0,
            })
          } else if (idx.kind === 'SimpleType') {
            const name = idx.name.name.toLowerCase()
            if (name === 'char') dims.push({ low: 0, high: 255 })
            else if (name === 'boolean') dims.push({ low: 0, high: 1 })
            else if (name === 'integer') dims.push({ low: 0, high: 2147483647 })
            else {
              // 枚举类型
              const sym = this.lookup(idx.name.name)
              if (sym?.kind === 'type' && sym.typeInfo.tag === 'enum') {
                dims.push({ low: 0, high: (sym.typeInfo.enumCount ?? 1) - 1 })
              } else {
                dims.push({ low: 0, high: 0 })
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
        info = { tag: 'rec', fields }
        break
      }
      case 'SetType': {
        info = { tag: 'set', setBase: this.resolveTypeInfo(node.baseType) }
        break
      }
      case 'FileType': {
        info = {
          tag: 'file',
          fileElem: node.elementType ? this.resolveTypeInfo(node.elementType) : null,
        }
        break
      }
      case 'EnumerationType': {
        info = { tag: 'enum', enumCount: node.values.length }
        // 绑定枚举值（每个值是 i64 常量）
        for (let i = 0; i < node.values.length; i++) {
          this.bind(node.values[i].name, {
            kind: 'const',
            literal: { key: 'i64', arg: String(i) },
            typeInfo: { tag: 'i64' },
          })
        }
        break
      }
      default:
        info = { tag: 'unknown' }
    }

    this.typeNodeInfo.set(node, info)
    return info
  }

  private evalConstInt(node: ExpressionNode): number | undefined {
    switch (node.kind) {
      case 'IntegerLiteral':
        return node.value
      case 'CharLiteral':
        return node.value.charCodeAt(0)
      case 'BooleanLiteral':
        return node.value ? 1 : 0
      case 'BinaryExpression': {
        const l = this.evalConstInt(node.left)
        const r = this.evalConstInt(node.right)
        if (l === undefined || r === undefined) return undefined
        switch (node.operator) {
          case '+':
            return l + r
          case '-':
            return l - r
          case '*':
            return l * r
          case 'div':
            return Math.trunc(l / r)
          case 'mod':
            return l % r
          default:
            return undefined
        }
      }
      case 'UnaryExpression': {
        const v = this.evalConstInt(node.operand)
        if (v === undefined) return undefined
        if (node.operator === '-') return -v
        return v
      }
      case 'Identifier': {
        const sym = this.lookup(node.name)
        if (sym?.kind === 'const' && sym.literal.key === 'i64') {
          return parseInt(sym.literal.arg, 10)
        }
        return undefined
      }
      default:
        return undefined
    }
  }

  // --------------------------------------------------------
  // Procedure / Function 声明
  // --------------------------------------------------------

  private analyzeProcDecl(decl: ProcedureDeclarationNode): void {
    const parentFuncId = this.currentScope().funcId
    const declNameLower = decl.name.name.toLowerCase()
    let funcId = this.forwardFuncs.get(declNameLower)
    if (funcId === undefined) {
      funcId = this.allocFunc(decl.block, decl, false, parentFuncId)
    } else {
      this.declFunc.set(decl, funcId)
      if (decl.block) this.blockFunc.set(decl.block, funcId)
      this.forwardFuncs.delete(declNameLower)
    }

    // 绑定函数名
    this.bind(decl.name.name, { kind: 'func', funcId })

    if (decl.isForward) {
      this.forwardFuncs.set(declNameLower, funcId)
    }

    if (decl.block) {
      this.funcInfos.get(funcId)!.hasBody = true
      this.pushScope(funcId)
      this.analyzeParams(funcId, decl.parameters, false)
      this.analyzeBlock(decl.block, funcId)
      this.popScope()
    }
  }

  private analyzeFuncDecl(decl: FunctionDeclarationNode): void {
    const parentFuncId = this.currentScope().funcId
    const declNameLower = decl.name.name.toLowerCase()
    let funcId = this.forwardFuncs.get(declNameLower)
    if (funcId === undefined) {
      funcId = this.allocFunc(decl.block, decl, true, parentFuncId)
    } else {
      this.declFunc.set(decl, funcId)
      if (decl.block) this.blockFunc.set(decl.block, funcId)
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

    if (decl.block) {
      this.funcInfos.get(funcId)!.hasBody = true
      this.pushScope(funcId)

      this.analyzeParams(funcId, decl.parameters, false)

      // retval 变量
      const retvalId = this.allocId()
      const retvalSym: VarSymbol = {
        kind: 'var',
        varId: retvalId,
        typeInfo: retTypeInfo,
        isVarParam: false,
      }
      const info = this.funcInfos.get(funcId)!
      info.retval = retvalSym
      // 注意：不在内层作用域绑定函数名为 var（retval）。
      // 函数名在外层已绑定为 func，函数体内递归调用需要找到 func 符号。
      // compiler 在处理 funcName := expr 时通过 funcInfo(funcId).retval 获取 retval varId。

      this.analyzeBlock(decl.block, funcId)
      this.popScope()
    }
  }

  private analyzeParams(
    funcId: number,
    params: ParameterDeclarationNode[],
    _nested: boolean
  ): void {
    const info = this.funcInfos.get(funcId)!
    for (const p of params) {
      const ti = this.resolveTypeInfo(p.type)
      for (const name of p.names) {
        const varId = this.allocId()
        const sym: VarSymbol = {
          kind: 'param',
          varId,
          typeInfo: ti,
          isVarParam: p.isVar,
        }
        info.params.push(sym)
        this.bind(name.name, sym)
      }
    }
  }

  // --------------------------------------------------------
  // 语句分析（收集表达式类型 + symbol 缓存）
  // --------------------------------------------------------

  private analyzeStatement(node: StatementNode): void {
    switch (node.kind) {
      case 'CompoundStatement':
        for (const s of node.statements) this.analyzeStatement(s)
        return
      case 'Assignment':
        this.analyzeExpr(node.left)
        this.analyzeExpr(node.right)
        return
      case 'IfStatement':
        this.analyzeExpr(node.condition)
        this.analyzeStatement(node.thenBranch)
        if (node.elseBranch) this.analyzeStatement(node.elseBranch)
        return
      case 'WhileStatement':
        this.analyzeExpr(node.condition)
        this.analyzeStatement(node.body)
        return
      case 'RepeatStatement':
        for (const s of node.statements) this.analyzeStatement(s)
        this.analyzeExpr(node.untilCondition)
        return
      case 'ForStatement':
        this.analyzeExpr(node.variable)
        this.analyzeExpr(node.initial)
        this.analyzeExpr(node.final)
        this.analyzeStatement(node.body)
        return
      case 'CaseStatement':
        this.analyzeExpr(node.expression)
        for (const br of node.branches) {
          for (const lbl of br.labels) this.analyzeExpr(lbl)
          this.analyzeStatement(br.statement)
        }
        if (node.otherwise) this.analyzeStatement(node.otherwise)
        return
      case 'GotoStatement':
        return
      case 'LabeledStatement':
        this.analyzeStatement(node.statement)
        return
      case 'WithStatement': {
        const temps: VarSymbol[] = []
        const newEntries: { fields: Map<string, TypeInfo> }[] = []
        for (const r of node.records) {
          const ti = this.analyzeExpr(r)
          temps.push({
            kind: 'var',
            varId: this.allocId(),
            typeInfo: ti,
            isVarParam: false,
          })
          newEntries.push({ fields: ti.fields ?? new Map() })
        }
        this.withTemps.set(node, temps)
        // 把 with 临时变量注册到当前函数 locals
        const scope = this.currentScope()
        const info = this.funcInfos.get(scope.funcId)!
        info.locals.push(...temps)
        // 压入 withStack，供内层 with 表达式类型推断使用
        for (const e of newEntries) {
          this.withStack.push(e)
        }
        this.analyzeStatement(node.body)
        // 弹出 withStack
        for (let i = 0; i < newEntries.length; i++) {
          this.withStack.pop()
        }
        return
      }
      case 'ProcedureCall': {
        const sym = this.lookup(node.name.name)
        this.symbolCache.set(node.name, sym)
        for (const a of node.arguments) this.analyzeExpr(a)
        return
      }
      case 'EmptyStatement':
        return
    }
  }

  // --------------------------------------------------------
  // 表达式分析（推断类型 + 缓存 symbol）
  // --------------------------------------------------------

  private analyzeExpr(node: ExpressionNode): TypeInfo {
    const cached = this.exprType.get(node)
    if (cached) return cached

    let info: TypeInfo
    switch (node.kind) {
      case 'IntegerLiteral':
        info = { tag: 'i64' }
        break
      case 'RealLiteral':
        info = { tag: 'f64' }
        break
      case 'StringLiteral':
        info = { tag: 'str' }
        break
      case 'CharLiteral':
        info = { tag: 'char' }
        break
      case 'BooleanLiteral':
        info = { tag: 'bool' }
        break

      case 'Identifier': {
        // with 字段优先：Pascal 标准中 with record do 体内，
        // record 的字段优先于同名外层变量（ISO 7185 6.8.3.10）
        let withField: TypeInfo | undefined
        for (let i = this.withStack.length - 1; i >= 0; i--) {
          const fieldNameLower = node.name.toLowerCase()
          if (this.withStack[i].fields.has(fieldNameLower)) {
            withField = this.withStack[i].fields.get(fieldNameLower)!
            break
          }
        }
        if (withField) {
          info = withField
          this.symbolCache.set(node, undefined)
          break
        }

        const sym = this.lookup(node.name)
        this.symbolCache.set(node, sym)
        if (sym?.kind === 'var' || sym?.kind === 'param') {
          info = sym.typeInfo
        } else if (sym?.kind === 'const') {
          info = sym.typeInfo
        } else if (sym?.kind === 'func') {
          info = sym.retTypeInfo ?? { tag: 'unknown' }
        } else {
          // 内置无参函数（parser 将无括号调用解析为 Identifier）
          const lower = node.name.toLowerCase()
          if (lower === 'eof' || lower === 'eoln') {
            info = { tag: 'bool' }
          } else {
            info = { tag: 'unknown' }
          }
        }
        break
      }

      case 'ParenthesizedExpression':
        info = this.analyzeExpr(node.expression)
        break

      case 'BinaryExpression': {
        const lt = this.analyzeExpr(node.left)
        const rt = this.analyzeExpr(node.right)
        const op = node.operator
        if (op === 'and' || op === 'or') {
          // integer 位运算 vs boolean 逻辑
          info = lt.tag === 'i64' ? { tag: 'i64' } : { tag: 'bool' }
        } else if (['=', '<>', '<', '<=', '>', '>='].includes(op)) {
          info = { tag: 'bool' }
        } else if (op === '/') {
          info = { tag: 'f64' }
        } else if (op === 'div' || op === 'mod') {
          info = { tag: 'i64' }
        } else {
          // + - *
          if (lt.tag === 'set' && rt.tag === 'set') info = { tag: 'set' }
          else if (lt.tag === 'str' || rt.tag === 'str') info = { tag: 'str' }
          else if (lt.tag === 'f64' || rt.tag === 'f64') info = { tag: 'f64' }
          else info = { tag: 'i64' }
        }
        break
      }

      case 'UnaryExpression': {
        const ot = this.analyzeExpr(node.operand)
        if (node.operator === 'not') {
          info = ot.tag === 'i64' ? { tag: 'i64' } : { tag: 'bool' }
        } else if (node.operator === '-') {
          info = ot.tag === 'f64' ? { tag: 'f64' } : { tag: 'i64' }
        } else {
          info = ot
        }
        break
      }

      case 'FunctionCall': {
        const sym = this.lookup(node.name.name)
        this.symbolCache.set(node.name, sym)
        for (const a of node.arguments) this.analyzeExpr(a)
        if (sym?.kind === 'func') {
          info = sym.retTypeInfo ?? { tag: 'unknown' }
        } else {
          // 内置函数
          info = this.builtinFuncReturnType(node.name.name, node.arguments)
        }
        break
      }

      case 'ArrayAccess': {
        const arrType = this.analyzeExpr(node.array)
        for (const idx of node.indices) this.analyzeExpr(idx)
        // 递归取元素类型
        info = this.arrayElemType(arrType, node.indices.length)
        break
      }

      case 'FieldAccess': {
        const objType = this.analyzeExpr(node.object)
        if (objType.tag === 'rec' && objType.fields) {
          info = objType.fields.get(node.field.name.toLowerCase()) ?? { tag: 'unknown' }
        } else {
          info = { tag: 'unknown' }
        }
        break
      }

      case 'SetConstructor':
        for (const [s, e] of node.elements) {
          this.analyzeExpr(s)
          if (e) this.analyzeExpr(e)
        }
        info = { tag: 'set' }
        break

      case 'InExpression':
        this.analyzeExpr(node.left)
        this.analyzeExpr(node.right)
        info = { tag: 'bool' }
        break

      default:
        info = { tag: 'unknown' }
    }

    this.exprType.set(node, info)
    return info
  }

  private arrayElemType(arrType: TypeInfo, dims: number): TypeInfo {
    let t = arrType
    for (let i = 0; i < dims; i++) {
      if (t.tag === 'array' && t.elem) {
        t = t.elem
      } else {
        return { tag: 'unknown' }
      }
    }
    return t
  }

  private builtinFuncReturnType(name: string, args: ExpressionNode[]): TypeInfo {
    const n = name.toLowerCase()
    if (['abs', 'sqr', 'pred', 'succ'].includes(n)) {
      if (args.length > 0) {
        const t = this.analyzeExpr(args[0])
        return t
      }
      return { tag: 'i64' }
    }
    if (['sqrt', 'sin', 'cos', 'exp', 'ln', 'arctan'].includes(n)) return { tag: 'f64' }
    if (['trunc', 'round', 'ord', 'length'].includes(n)) return { tag: 'i64' }
    if (['chr'].includes(n)) return { tag: 'char' }
    if (['odd', 'eof', 'eoln'].includes(n)) return { tag: 'bool' }
    return { tag: 'unknown' }
  }

  // --------------------------------------------------------
  // 冻结为只读 Analysis
  // --------------------------------------------------------

  private freeze(): Analysis {
    const self = this
    return {
      nextId() {
        return self.nextId_++
      },
      allocTempLocal(funcId, typeInfo) {
        const id = self.nextId_++
        const info = self.funcInfos.get(funcId)
        if (info) {
          info.locals.push({
            kind: 'var',
            varId: id,
            typeInfo,
            isVarParam: false,
          })
        }
        return id
      },
      symbolOf(node) {
        return self.symbolCache.get(node)
      },
      labelInfo(funcId, labelNum) {
        let fid: number | null = funcId
        while (fid !== null) {
          const funcLabels = self.labels.get(fid)
          if (funcLabels) {
            const info = funcLabels.get(labelNum)
            if (info) return info
          }
          const finfo = self.funcInfos.get(fid)
          fid = finfo ? finfo.parentFuncId : null
        }
        return undefined
      },
      funcOfBlock(block) {
        const r = self.blockFunc.get(block)
        if (r === undefined) throw new Error('funcOfBlock: not found')
        return r
      },
      funcOfDecl(decl) {
        const r = self.declFunc.get(decl)
        if (r === undefined) throw new Error('funcOfDecl: not found')
        return r
      },
      funcInfo(id) {
        const r = self.funcInfos.get(id)
        if (!r) throw new Error('funcInfo: not found')
        return r
      },
      withTempsOf(node) {
        return self.withTemps.get(node) ?? []
      },
      typeOf(node) {
        return self.exprType.get(node) ?? { tag: 'unknown' }
      },
      typeTagOfTypeNode(node) {
        return self.resolveTypeInfo(node)
      },
      evalConstInt(node) {
        return self.evalConstInt(node)
      },
      globalSymbolOf(name) {
        return self.globalBindings.get(name.toLowerCase())
      },
    }
  }
}

// ============================================================
// Analysis — 编译阶段可见的只读接口
// ============================================================

export interface Analysis {
  nextId(): number
  allocTempLocal(funcId: number, typeInfo: TypeInfo): number
  symbolOf(node: IdentifierNode): Symbol | undefined
  labelInfo(funcId: number, labelNum: number): { labelId: number; funcId: number } | undefined
  funcOfBlock(block: BlockNode): number
  funcOfDecl(decl: ProcedureDeclarationNode | FunctionDeclarationNode): number
  funcInfo(funcId: number): FuncInfo
  withTempsOf(node: WithStatementNode): VarSymbol[]
  typeOf(node: ExpressionNode): TypeInfo
  typeTagOfTypeNode(node: TypeNode): TypeInfo
  evalConstInt(node: ExpressionNode): number | undefined
  globalSymbolOf(name: string): Symbol | undefined
}

// ============================================================
// 入口
// ============================================================

export function analyzeProgram(program: ProgramNode): Analysis {
  return new Analyzer().analyze(program)
}
