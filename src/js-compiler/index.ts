// M5 JS 编译器：从 AST 编译为 JS 代码字符串，new AsyncFunction 执行
//
// 核心思想：
// - integer/real/boolean 用 JS 裸值（无 PascalValue 装箱），V8 JIT 可优化
// - string/char/array/record/file 保持 PascalValue，通过 ctx.sysCall/plugin 桥接
// - 异步操作（WRITELN/READ/file）用 async/await 原生处理
//
// 详见 docs/plan-m5-high-performance.md

import { parse } from '../index'
import type {
  ProgramNode,
  BlockNode,
  StatementNode,
  ExpressionNode,
  VariableDeclarationNode,
  ProcedureDeclarationNode,
  FunctionDeclarationNode,
  ParameterDeclarationNode,
  TypeNode,
  SimpleTypeNode,
  RangeTypeNode,
  ArrayTypeNode,
  RecordTypeNode,
  EnumerationTypeNode,
  SetTypeNode,
  FileTypeNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  IdentifierNode,
  CompoundStatementNode,
  AssignmentNode,
  IfStatementNode,
  WhileStatementNode,
  RepeatStatementNode,
  ForStatementNode,
  CaseStatementNode,
  WithStatementNode,
  ArrayAccessNode,
  FieldAccessNode,
  SetConstructorNode,
  InExpressionNode,
  ProcedureCallNode,
  FunctionCallNode,
  ConstDeclarationNode,
  LabeledStatementNode,
} from '../ast/types'
import { createJSCtx, ctxToVMState, type JSCtx } from './context'
import { StaticAnalyzer } from '../static-analyzer'
import { integerPlugin } from '../types/integer.plugin'
import { booleanPlugin } from '../types/boolean.plugin'
import { charPlugin } from '../types/char.plugin'
import { realPlugin } from '../types/real.plugin'
import { stringPlugin } from '../types/string.plugin'
import { createArrayPlugin } from '../types/array.plugin'
import { createRecordPlugin } from '../types/record.plugin'
import { createEnumPlugin } from '../types/enum.plugin'
import { createSubrangePlugin } from '../types/subrange.plugin'
import { createSetPlugin } from '../types/set.plugin'
import { createFilePlugin } from '../types/file.plugin'
import { createDefaultSysCalls } from '../vm/io.plugin'
import type { RuntimeCtx, SysCallHandler, TypePlugin, TypeTable } from '../types'
import type { VMState } from '../vm/state'

// 内置系统调用名（大写）。ProcedureCall/FunctionCall 命中此集合 → 走 sysCall
const BUILTIN_SYSCALLS = new Set([
  'WRITE', 'WRITELN', 'READ', 'READLN', 'PAGE',
  'ORD', 'CHR', 'ABS', 'SQR', 'PRED', 'SUCC', 'ODD',
  'EOF', 'EOLN', 'RESET', 'REWRITE', 'CLOSE', 'GET', 'PUT',
  'ASSIGN', 'BUFFER_CHAR', 'BREAK', 'BREAKIN', 'ERSTAT', 'WRITE_FILE',
  'TRUNC', 'ROUND', 'SIN', 'COS', 'EXP', 'LN', 'SQRT', 'ARCTAN',
  'NEW', 'DISPOSE', 'PACK', 'UNPACK', 'RANDOM',
])

// 返回内置函数的返回类型（用于类型推断）
// polymorphic 参数：若 argType 提供，PRED/SUCC/ABS/SQR 跟随参数类型
function builtinReturnType(name: string, argType?: string): string {
  switch (name) {
    case 'ORD': case 'TRUNC': case 'ROUND': case 'ERSTAT':
      return 'integer'
    case 'ABS': case 'SQR':
      // ABS/SQR: integer→integer, real→real
      if (argType === 'real') return 'real'
      return 'integer'
    case 'PRED': case 'SUCC':
      // PRED/SUCC: 返回类型跟随参数类型
      if (argType === 'char') return 'char'
      if (argType === 'boolean') return 'boolean'
      if (argType === 'real') return 'real'
      return 'integer'
    case 'ODD': case 'EOF': case 'EOLN':
      return 'boolean'
    case 'CHR':
      return 'char'
    case 'SIN': case 'COS': case 'EXP': case 'LN': case 'SQRT': case 'ARCTAN':
      return 'real'
    case 'RANDOM':
      return 'real'
    default:
      return 'integer'
  }
}

// ============================================================================
// 类型工具
// ============================================================================

const SCALAR_TYPES = new Set(['integer', 'real', 'boolean', 'char', 'string'])

function isScalar(typeId: string): boolean {
  return SCALAR_TYPES.has(typeId) || typeId === 'subrange'
}

// ============================================================================
// 作用域
// ============================================================================

interface VarInfo {
  jsName: string
  typeId: string
  isVar: boolean // var 参数（Phase 4 处理引用语义）
}

interface WithRecordInfo {
  jsName: string
  typeId: string
}

class Scope {
  vars = new Map<string, VarInfo>()
  withRecords: WithRecordInfo[] | null = null
  parent: Scope | null
  constructor(parent: Scope | null = null) {
    this.parent = parent
  }
  lookup(name: string): VarInfo | null {
    const key = name.toUpperCase()
    const v = this.vars.get(key)
    if (v) return v
    return this.parent ? this.parent.lookup(name) : null
  }
  // 沿父链收集所有 with-record（内层、后面的优先）
  allWithRecords(): WithRecordInfo[] {
    const result: WithRecordInfo[] = []
    let s: Scope | null = this
    while (s) {
      if (s.withRecords) {
        // 同一层内，后面的 record 优先级更高 → 倒序加入
        for (let i = s.withRecords.length - 1; i >= 0; i--) {
          result.push(s.withRecords[i])
        }
      }
      s = s.parent
    }
    return result // 从内到外，从后到前
  }
  declare(name: string, typeId: string, isVar = false): VarInfo {
    const key = name.toUpperCase()
    const existing = this.vars.get(key)
    if (existing) return existing
    const info: VarInfo = { jsName: name, typeId, isVar }
    this.vars.set(key, info)
    return info
  }
}

interface ProcInfo {
  jsName: string
  isFunction: boolean
  returnType: string
  params: { name: string; typeId: string; isVar: boolean }[]
  block: BlockNode | null
}

// ============================================================================
// 编译器
// ============================================================================

class Compiler {
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

  constructor(typeTable: TypeTable) {
    this.typeTable = typeTable
  }

  compile(program: ProgramNode): string {
    // 0. 收集类型别名 + enum 常量 + const integer
    this.collectTypes(program.block)

    // 1. 收集常量、全局变量、过程/函数
    this.collectConsts(program.block.constDeclarations)
    this.collectGlobals(program.block.variableDeclarations)
    this.collectProcs(program.block.procedureDeclarations, program.block.functionDeclarations)

    // 2. 生成过程函数体
    const procDefs: string[] = []
    for (const [name, info] of this.procs) {
      if (info.block) {
        procDefs.push(this.emitProc(info))
      }
    }

    // 3. 生成全局变量声明
    const globalDecls = this.emitGlobalDecls(program.block)

    // 4. 生成 main 体
    const mainBody = this.emitCompound(program.block.compound, this.globalScope, 2)

    // 5. 组装
    const parts: string[] = []
    parts.push("'use strict'")
    parts.push(globalDecls)
    parts.push(procDefs.join('\n'))
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
          case '+': return l + r
          case '-': return l - r
          case '*': return l * r
          case 'DIV': return Math.trunc(l / r)
          case 'MOD': return l - Math.trunc(l / r) * r
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
          case 'INTEGER': return 'integer'
          case 'REAL': return 'real'
          case 'BOOLEAN': return 'boolean'
          case 'CHAR': return 'char'
          case 'STRING': return 'string'
          case 'TEXT': return 'text'
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
        let baseTypeId = 'integer'
        if (r.start.kind === 'CharLiteral') baseTypeId = 'char'
        else if (r.start.kind === 'BooleanLiteral') baseTypeId = 'boolean'
        else if (r.start.kind === 'Identifier') {
          const name = (r.start as IdentifierNode).name.toUpperCase()
          if (this.enumConstants.has(name)) {
            // enum-based subrange：baseTypeId 需要查 aliasMap 反向？
            // 简化：用 integer
            baseTypeId = 'integer'
          }
        }
        return `subrange-${min}-${max}-of-${baseTypeId}`
      }
      case 'ArrayType': {
        const a = node as ArrayTypeNode
        const elemTypeId = this.resolveTypeId(a.elementType)
        const dims = a.indexTypes.map(idx => {
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
        const vals = e.values.map(v => v.name.toUpperCase())
        // 注册 enum 常量
        vals.forEach((v, i) => this.enumConstants.set(v, i))
        return `enum-${vals.join(',')}`
      }
      case 'SetType': {
        const s = node as SetTypeNode
        const baseTypeId = this.resolveTypeId(s.baseType)
        let minOrd = 0, maxOrd = 255
        const baseDef = this.typeTable.get(baseTypeId) as any
        if (baseDef?.kind === 'subrange') {
          minOrd = baseDef.min; maxOrd = baseDef.max
        } else if (baseDef?.kind === 'char') {
          minOrd = 0; maxOrd = 255
        } else if (baseDef?.kind === 'boolean') {
          minOrd = 0; maxOrd = 1
        } else if (baseDef?.kind === 'enum') {
          minOrd = 0; maxOrd = baseDef.values.length - 1
        }
        return `set-of-${baseTypeId}-${minOrd}-${maxOrd}`
      }
      case 'FileType': {
        const f = node as FileTypeNode
        if (f.elementType && f.elementType.kind === 'SimpleType'
          && (f.elementType as SimpleTypeNode).name.name.toUpperCase() === 'CHAR') {
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
    if (typeId === 'integer' || typeId === 'real' || typeId === 'boolean'
      || typeId === 'char' || typeId === 'string' || typeId === 'text') {
      return typeId
    }
    const td = this.typeTable.get(typeId) as any
    return td?.kind || 'unknown'
  }

  // scalar 且用裸值表示（integer/real/boolean/subrange/enum 内部都是 number/boolean）
  private isScalarBare(typeId: string): boolean {
    if (typeId === 'integer' || typeId === 'real' || typeId === 'boolean') return true
    const k = this.typeKind(typeId)
    return k === 'subrange' || k === 'enum'
  }

  // 缩并为 integer（subrange/enum/boolean 都按 integer 处理）
  private scalarBase(typeId: string): string {
    if (typeId === 'integer') return 'integer'
    if (typeId === 'real') return 'real'
    if (typeId === 'boolean') return 'boolean'
    const k = this.typeKind(typeId)
    if (k === 'subrange') return 'integer'
    if (k === 'enum') return 'integer'
    return typeId
  }

  // record 字段类型
  private recordFieldType(recordTypeId: string, fieldName: string): string | null {
    const td = this.typeTable.get(recordTypeId) as any
    if (!td || td.kind !== 'record') return null
    const f = td.fields.find((x: any) => x.name === fieldName.toUpperCase())
    return f ? f.typeId : null
  }

  // array 元素类型
  private arrayElementType(arrayTypeId: string): string | null {
    const td = this.typeTable.get(arrayTypeId) as any
    if (!td || td.kind !== 'array') return null
    return td.elementTypeId
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
      // subrange/enum 当 integer 处理（性能优化，丢失边界检查）
      const st = this.scalarBase(t)
      for (const n of decl.names) {
        this.globalScope.declare(n.name, st)
      }
    }
  }

  private collectProcs(procs: ProcedureDeclarationNode[], funcs: FunctionDeclarationNode[]) {
    for (const p of procs) {
      const key = p.name.name.toUpperCase()
      const params = this.collectParams(p.parameters)
      this.procs.set(key, {
        jsName: 'p_' + p.name.name.toLowerCase(),
        isFunction: false,
        returnType: 'void',
        params,
        block: p.block,
      })
    }
    for (const f of funcs) {
      const key = f.name.name.toUpperCase()
      const params = this.collectParams(f.parameters)
      const retType = this.scalarBase(this.resolveTypeId(f.returnType))
      this.procs.set(key, {
        jsName: 'p_' + f.name.name.toLowerCase(),
        isFunction: true,
        returnType: retType,
        params,
        block: f.block,
      })
    }
  }

  private collectParams(params: ParameterDeclarationNode[]): { name: string; typeId: string; isVar: boolean }[] {
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
      lines.push(`const ${c.name.name} = ${this.coerce(code, type, this.inferType(c.value, this.globalScope))}`)
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
    switch (st) {
      case 'integer': return '0'
      case 'real': return '0.0'
      case 'boolean': return 'false'
      case 'char': return "ctx.box('char', '\\u0000')"
      case 'string': return "ctx.box('string', '')"
    }
    // array/record/set/file/text：调用 ctx.defaultOf(原始 typeId)
    return `ctx.defaultOf(${JSON.stringify(t)})`
  }

  // ---- 过程生成 ----

  private emitProc(info: ProcInfo): string {
    if (!info.block) return '' // forward 声明
    const scope = new Scope(this.globalScope)
    const paramDecls: string[] = []
    for (const p of info.params) {
      scope.declare(p.name, p.typeId, p.isVar)
      // value 参数直接作为 JS 参数；var 参数 Phase 4 处理
      paramDecls.push(p.name)
    }
    const localDecls: string[] = []
    // 函数返回值：Pascal 通过给函数名赋值返回，映射到 __ret 变量
    let hasRet = false
    if (info.isFunction) {
      hasRet = true
      scope.vars.set(info.jsName.slice(2).toUpperCase(), {
        jsName: '__ret', typeId: info.returnType, isVar: false,
      })
      localDecls.push(`let __ret = ${this.defaultInit(info.returnType, info.returnType)}`)
    }
    // 局部变量
    for (const decl of info.block.variableDeclarations) {
      const t = this.resolveTypeId(decl.type)
      const st = this.scalarBase(t)
      const init = this.defaultInit(t, st)
      for (const n of decl.names) {
        scope.declare(n.name, st)
        localDecls.push(`let ${n.name} = ${init}`)
      }
    }
    // 嵌套过程（Phase 4 才支持嵌套；这里只处理无嵌套）
    const body = this.emitCompound(info.block.compound, scope, 2)
    const params = ['ctx', ...paramDecls].join(', ')
    const lines: string[] = []
    lines.push(`async function ${info.jsName}(${params}) {`)
    if (localDecls.length) lines.push('  ' + localDecls.join('\n  '))
    lines.push(body)
    if (hasRet) lines.push('  return __ret')
    lines.push('}')
    return lines.join('\n')
  }

  // ---- 语句生成 ----

  private emitCompound(node: CompoundStatementNode, scope: Scope, indent: number): string {
    const pad = ' '.repeat(indent)
    const lines = node.statements.map(s => this.emitStmt(s, scope, indent)).filter(x => x.length > 0)
    return lines.join('\n')
  }

  private emitStmt(node: StatementNode, scope: Scope, indent: number): string {
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
        return [
          `${pad}while (${this.toBool(cond.code, cond.type)}) {`,
          `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`,
          body,
          `${pad}}`,
        ].join('\n')
      }

      case 'RepeatStatement': {
        const r = node as RepeatStatementNode
        const bodyStmts = r.statements.map(s => this.emitStmt(s, scope, indent + 2)).filter(x => x.length > 0)
        const cond = this.emitExpr(r.untilCondition, scope)
        return [
          `${pad}do {`,
          `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`,
          ...bodyStmts,
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
          return [
            `${pad}for (${vName} = ${this.toInt(init.code, init.type)}; ${vName} <= ${this.toInt(final.code, final.type)}; ${vName} = (${vName} + 1) | 0) {`,
            `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`,
            body,
            `${pad}}`,
          ].join('\n')
        } else {
          return [
            `${pad}for (${vName} = ${this.toInt(init.code, init.type)}; ${vName} >= ${this.toInt(final.code, final.type)}; ${vName} = (${vName} - 1) | 0) {`,
            `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`,
            body,
            `${pad}}`,
          ].join('\n')
        }
      }

      case 'ProcedureCall': {
        const pc = node as ProcedureCallNode
        return pad + this.emitProcedureCall(pc, scope)
      }

      case 'GotoStatement':
        throw new Error('JS VM: goto not supported yet')

      case 'LabeledStatement': {
        const ls = node as LabeledStatementNode
        return this.emitStmt(ls.statement, scope, indent)
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
    node.records.forEach((r, i) => {
      const e = this.emitExpr(r, scope)
      const tmpName = `__with_${i}`
      // e.code 产出 PascalValue（record）
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
        return `${target} = ${this.toRawValue(rhs.code, rhs.type, withField.fieldTypeId)}`
      }
      const vi = scope.lookup(id.name)
      if (!vi) throw new Error(`JS VM: undefined variable ${id.name}`)
      const rhs = this.emitExpr(a.right, scope)
      const code = this.coerce(rhs.code, rhs.type, vi.typeId)
      return `${vi.jsName} = ${code}`
    }
    if (a.left.kind === 'ArrayAccess') {
      const aa = a.left as ArrayAccessNode
      // 数组元素赋值：a[i] := v -> a.raw[i] = v.raw (或裸值)
      const arr = this.emitExpr(aa.array, scope)
      const elemTypeId = this.arrayElementType(arr.type)
      if (!elemTypeId) throw new Error(`JS VM: ${arr.type} is not indexable`)
      // emit 下标
      let idxCode = `${arr.code}.raw`
      for (const idxExpr of aa.indices) {
        const idx = this.emitExpr(idxExpr, scope)
        idxCode += `[${this.toInt(idx.code, idx.type)}]`
      }
      const rhs = this.emitExpr(a.right, scope)
      return `${idxCode} = ${this.toRawValue(rhs.code, rhs.type, elemTypeId)}`
    }
    if (a.left.kind === 'FieldAccess') {
      const fa = a.left as FieldAccessNode
      // record 字段赋值：r.f := v -> r.raw['F'] = v.raw (或裸值)
      const obj = this.emitExpr(fa.object, scope)
      const fieldName = fa.field.name.toUpperCase()
      const fieldTypeId = this.recordFieldType(obj.type, fieldName)
      if (!fieldTypeId) throw new Error(`JS VM: record ${obj.type} has no field ${fieldName}`)
      const rhs = this.emitExpr(a.right, scope)
      return `${obj.code}.raw[${JSON.stringify(fieldName)}] = ${this.toRawValue(rhs.code, rhs.type, fieldTypeId)}`
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
  private findWithField(name: string, scope: Scope): { recordJsName: string; fieldTypeId: string } | null {
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
      // 绕过 io.plugin.formatReal 的指数补零 bug（src/vm 冻结，不能改）
      if (name === 'WRITE' || name === 'WRITELN') {
        const argExprs = pc.arguments.map(a => this.emitExpr(a, scope))
        const args = argExprs.map(e => {
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
      const args = pc.arguments.map(a => this.emitArg(a, scope))
      return `await ctx.sysCall(${JSON.stringify(name)}, [${args.join(', ')}])`
    }
    // 用户过程
    const info = this.procs.get(name)
    if (!info) throw new Error(`JS VM: unknown procedure ${pc.name.name}`)
    const args = pc.arguments.map((a, i) => {
      const pType = info.params[i]?.typeId || 'integer'
      const e = this.emitExpr(a, scope)
      return this.coerce(e.code, e.type, pType)
    })
    return `await ${info.jsName}(ctx, ${args.join(', ')})`
  }

  // READ/READLN 内联生成
  // 控制台模式：从 ctx.inputQueue 取一行，按 whitespace 拆 token，依次赋给变量
  // 文件模式：暂走 sysCall（写回变量有 bug，待 Phase 3.5 实现 F^/文件 I/O 时一起修）
  private emitRead(pc: ProcedureCallNode, scope: Scope, _isReadln: boolean): string {
    const args = pc.arguments
    // 第一参数是 file 变量？走 sysCall
    if (args.length > 0 && args[0].kind === 'Identifier') {
      const vi = scope.lookup((args[0] as IdentifierNode).name)
      if (vi && (vi.typeId === 'text' || vi.typeId.startsWith('file-of-'))) {
        const argCodes = args.map(a => this.emitArg(a, scope))
        return `await ctx.sysCall(${JSON.stringify(_isReadln ? 'READLN' : 'READ')}, [${argCodes.join(', ')}])`
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
        lines.push(`  ${vi.jsName}.raw = (__i < __toks.length) ? __toks[__i++].charAt(0) : '\\u0000'`)
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
          return { code: `ctx.box(${JSON.stringify(withField.fieldTypeId)}, ${rawCode})`, type: withField.fieldTypeId }
        }
        // 3. 普通变量
        const vi = scope.lookup(name)
        if (!vi) throw new Error(`JS VM: undefined variable ${name}`)
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
    const elemTypeId = this.arrayElementType(arr.type)
    if (!elemTypeId) throw new Error(`JS VM: ${arr.type} is not indexable`)
    let code = `${arr.code}.raw`
    for (const idxExpr of node.indices) {
      const idx = this.emitExpr(idxExpr, scope)
      code += `[${this.toInt(idx.code, idx.type)}]`
    }
    const st = this.scalarBase(elemTypeId)
    if (st === 'integer' || st === 'real' || st === 'boolean') {
      // 元素是裸值
      return { code, type: st }
    }
    // char/string/array/record：raw 存的是裸 raw 值，包装成 PascalValue
    return { code: `ctx.box(${JSON.stringify(elemTypeId)}, ${code})`, type: elemTypeId }
  }

  // 字段访问：r.f
  private emitFieldAccess(node: FieldAccessNode, scope: Scope): { code: string; type: string } {
    const obj = this.emitExpr(node.object, scope)
    const fieldName = node.field.name.toUpperCase()
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
  private emitSetConstructor(node: SetConstructorNode, scope: Scope): { code: string; type: string } {
    const elems: string[] = []
    for (const [start, end] of node.elements) {
      const s = this.emitExpr(start, scope)
      if (end) {
        const e = this.emitExpr(end, scope)
        // range: 从 s 到 e 的所有值
        elems.push(`...Array.from({length: (${e.code}) - (${s.code}) + 1}, (_, i) => i + (${s.code}))`)
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
      case '+': case '-': case '*': {
        if (resultType === 'integer') {
          return { code: `(${L.code} ${op} ${R.code}) | 0`, type: 'integer' }
        }
        if (resultType === 'real') {
          return { code: `(${L.code} ${op} ${R.code})`, type: 'real' }
        }
        // string/char 连接
        if (resultType === 'string') {
          return { code: `ctx.box('string', (${L.code}).raw + (${R.code}).raw)`, type: 'string' }
        }
        throw new Error(`JS VM: unsupported + for ${L.type}/${R.type}`)
      }
      case '/': // Pascal 实数除
        return { code: `(${L.code} / ${R.code})`, type: 'real' }
      case 'DIV':
        return { code: `Math.trunc(${L.code} / ${R.code}) | 0`, type: 'integer' }
      case 'MOD':
        // Pascal MOD: a - (a div b) * b，trunc 语义。非负操作数下与 % 等价
        return { code: `(${L.code} % ${R.code})`, type: 'integer' }
      case '=': case '<>': case '<': case '<=': case '>': case '>=': {
        const jsOp = op === '=' ? '===' : op === '<>' ? '!==' : op
        if (isStrChar(L.type) || isStrChar(R.type)) {
          return { code: `((${L.code}).raw ${jsOp} (${R.code}).raw)`, type: 'boolean' }
        }
        return { code: `(${L.code} ${jsOp} ${R.code})`, type: 'boolean' }
      }
      case 'AND':
        if (resultType === 'boolean') return { code: `(${L.code} && ${R.code})`, type: 'boolean' }
        return { code: `(${L.code} & ${R.code})`, type: 'integer' } // 位运算（Knuth 风格）
      case 'OR':
        if (resultType === 'boolean') return { code: `(${L.code} || ${R.code})`, type: 'boolean' }
        return { code: `(${L.code} | ${R.code})`, type: 'integer' }
      default:
        throw new Error(`JS VM: unsupported binary operator ${op}`)
    }
  }

  private emitUnary(node: UnaryExpressionNode, scope: Scope): { code: string; type: string } {
    const operand = this.emitExpr(node.operand, scope)
    const op = node.operator.toUpperCase()
    switch (op) {
      case '-':
        if (operand.type === 'integer') return { code: `(-${operand.code}) | 0`, type: 'integer' }
        return { code: `(-${operand.code})`, type: 'real' }
      case '+':
        return operand
      case 'NOT':
        if (operand.type === 'boolean') return { code: `(!${operand.code})`, type: 'boolean' }
        return { code: `(~${operand.code})`, type: 'integer' }
      default:
        throw new Error(`JS VM: unsupported unary operator ${op}`)
    }
  }

  private emitFunctionCall(node: FunctionCallNode, scope: Scope): { code: string; type: string } {
    const name = node.name.name.toUpperCase()
    if (BUILTIN_SYSCALLS.has(name)) {
      const argExprs = node.arguments.map(a => this.emitExpr(a, scope))
      const args = argExprs.map((e, i) => this.emitArgFromExpr(e))
      // PRED/SUCC/ABS/SQR 是多态函数，返回类型跟随参数
      const firstArgType = argExprs[0]?.type
      const retType = builtinReturnType(name, firstArgType)
      // sysCall 返回 PascalValue，取 .raw 得到裸值（scalar）
      if (isScalar(retType) && retType !== 'char' && retType !== 'string') {
        return { code: `((await ctx.sysCall(${JSON.stringify(name)}, [${args.join(', ')}])).raw)`, type: retType }
      }
      return { code: `(await ctx.sysCall(${JSON.stringify(name)}, [${args.join(', ')}]))`, type: retType }
    }
    // 用户函数
    const info = this.procs.get(name)
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
      case 'IntegerLiteral': return 'integer'
      case 'RealLiteral': return 'real'
      case 'BooleanLiteral': return 'boolean'
      case 'StringLiteral': {
        const s = (node as any).value as string
        return s.length === 1 ? 'char' : 'string'
      }
      case 'CharLiteral': return 'char'
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
    switch (op) {
      case '+': case '-': case '*':
        if (lt === 'real' || rt === 'real') return 'real'
        if (lt === 'string' || rt === 'string') return 'string'
        return 'integer'
      case '/':
        return 'real'
      case 'DIV': case 'MOD': case 'AND': case 'OR':
        if (op === 'AND' || op === 'OR') {
          if (lt === 'boolean' && rt === 'boolean') return 'boolean'
          return 'integer'
        }
        return 'integer'
      case '=': case '<>': case '<': case '<=': case '>': case '>=':
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
    return code
  }

  private toBool(code: string, fromType: string): string {
    if (fromType === 'boolean') return code
    if (fromType === 'integer') return `(${code} !== 0)`
    return `Boolean(${code})`
  }
}

// ============================================================================
// 公开 API
// ============================================================================

export interface JSRunOptions {
  input?: string[]
  plugins?: TypePlugin[]
  sysCalls?: Map<string, SysCallHandler>
  maxSteps?: number
}

function parseSource(source: string): ProgramNode {
  const result = parse(source)
  if (!result.success) {
    throw new Error(`Parse error: ${(result as any).error}`)
  }
  return (result as any).astNode as ProgramNode
}

// 构造 runtime（复用 VM 的 typeTable/sysCalls 构造逻辑，保证语义一致）
function buildRuntime(ast: ProgramNode, options: JSRunOptions): { runtime: RuntimeCtx; sysCalls: Map<string, SysCallHandler> } {
  const basePlugins: TypePlugin[] = [integerPlugin, booleanPlugin, charPlugin, realPlugin, stringPlugin, ...(options.plugins || [])]
  const analyzer = new StaticAnalyzer(basePlugins)
  analyzer.analyze(ast) // 只为 typeTable，JsonCode 丢弃
  const typeTable = analyzer.getTypeTable()
  const arrayPlugin = createArrayPlugin(typeTable)
  const recordPlugin = createRecordPlugin(typeTable)
  const enumPlugin = createEnumPlugin(typeTable)
  const subrangePlugin = createSubrangePlugin(typeTable)
  const setPlugin = createSetPlugin(typeTable)
  const filePlugin = createFilePlugin(typeTable)
  const allPlugins = [...basePlugins, arrayPlugin, recordPlugin, enumPlugin, subrangePlugin, setPlugin, filePlugin]
  const sysCalls = options.sysCalls || createDefaultSysCalls()
  const runtime: RuntimeCtx = {
    typeTable,
    sysCalls,
    io: undefined, // Phase 3 加文件支持
  }
  // 把 allPlugins 信息塞进 runtime 供未来 invoke 使用（Phase 2/3）
  ;(runtime as any).plugins = allPlugins
  return { runtime, sysCalls }
}

const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor

export async function runJS(source: string, options: JSRunOptions = {}): Promise<VMState> {
  const ast = parseSource(source)
  const { runtime, sysCalls } = buildRuntime(ast, options)

  // 编译
  const compiler = new Compiler(runtime.typeTable)
  const body = compiler.compile(ast)

  // 构造 ctx
  const ctx = createJSCtx({
    sysCalls,
    runtime,
    input: options.input,
    maxSteps: options.maxSteps,
  })

  // 执行
  const fn = new AsyncFunction('ctx', body)
  try {
    await fn(ctx)
    return ctxToVMState(ctx, 'terminated')
  } catch (e: any) {
    const state = ctxToVMState(ctx, 'error')
    state.error = e?.message || String(e)
    return state
  }
}

// 调试用：返回编译生成的 JS 源码（不执行）
export function compileToJS(source: string): string {
  const ast = parseSource(source)
  // 构造一个最小 runtime 仅为 typeTable
  const basePlugins: TypePlugin[] = [integerPlugin, booleanPlugin, charPlugin, realPlugin, stringPlugin]
  const analyzer = new StaticAnalyzer(basePlugins)
  analyzer.analyze(ast)
  const compiler = new Compiler(analyzer.getTypeTable())
  return compiler.compile(ast)
}
