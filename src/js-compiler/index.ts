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
import { createArrayPlugin } from '../types/array.plugin'
import { createRecordPlugin } from '../types/record.plugin'
import { createEnumPlugin } from '../types/enum.plugin'
import { createSubrangePlugin } from '../types/subrange.plugin'
import { createSetPlugin } from '../types/set.plugin'
import { createFilePlugin } from '../types/file.plugin'
import { createDefaultSysCalls } from '../vm/io.plugin'
import type { RuntimeCtx, SysCallHandler, TypePlugin } from '../types'
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
function builtinReturnType(name: string): string {
  switch (name) {
    case 'ORD': case 'ABS': case 'SQR': case 'PRED': case 'SUCC':
    case 'TRUNC': case 'ROUND': case 'ERSTAT':
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

function typeOfSimpleType(node: TypeNode): string {
  if (node.kind === 'SimpleType') {
    const n = (node as SimpleTypeNode).name.name.toUpperCase()
    // 基本类型用小写 typeId（与 plugin 一致）
    switch (n) {
      case 'INTEGER': return 'integer'
      case 'REAL': return 'real'
      case 'BOOLEAN': return 'boolean'
      case 'CHAR': return 'char'
      case 'STRING': return 'string'
      default: return n // 用户定义类型名，保持大写（后续查 typeTable）
    }
  }
  // RangeType → 用 base，简化为 integer（后续推断）
  if (node.kind === 'RangeType') return 'integer'
  return 'object'
}

// ============================================================================
// 作用域
// ============================================================================

interface VarInfo {
  jsName: string
  typeId: string
  isVar: boolean // var 参数（Phase 4 处理引用语义）
}

class Scope {
  vars = new Map<string, VarInfo>()
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

  compile(program: ProgramNode): string {
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
      const t = typeOfSimpleType(decl.type)
      for (const n of decl.names) {
        this.globalScope.declare(n.name, t)
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
      const retType = typeOfSimpleType(f.returnType)
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
      const t = typeOfSimpleType(p.type)
      for (const n of p.names) {
        result.push({ name: n.name, typeId: t, isVar: p.isVar })
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
      const t = typeOfSimpleType(decl.type)
      const init = this.defaultInit(t)
      for (const n of decl.names) {
        lines.push(`let ${n.name} = ${init}`)
      }
    }
    return lines.join('\n')
  }

  private defaultInit(typeId: string): string {
    switch (typeId) {
      case 'integer': return '0'
      case 'real': return '0.0'
      case 'boolean': return 'false'
      case 'char': return "ctx.box('char', '\\u0000')"
      case 'string': return "ctx.box('string', '')"
      default: return 'null'
    }
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
      localDecls.push(`let __ret = ${this.defaultInit(info.returnType)}`)
    }
    // 局部变量
    for (const decl of info.block.variableDeclarations) {
      const t = typeOfSimpleType(decl.type)
      const init = this.defaultInit(t)
      for (const n of decl.names) {
        scope.declare(n.name, t)
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
        throw new Error('JS VM: goto not supported in Phase 1')

      case 'LabeledStatement': {
        const ls = node as LabeledStatementNode
        return this.emitStmt(ls.statement, scope, indent)
      }

      case 'CaseStatement':
        throw new Error('JS VM: case statement not supported in Phase 1')

      case 'WithStatement':
        throw new Error('JS VM: with statement not supported in Phase 1')

      default:
        throw new Error(`JS VM: unsupported statement ${(node as any).kind}`)
    }
  }

  private emitAssignment(a: AssignmentNode, scope: Scope): string {
    if (a.left.kind !== 'Identifier') {
      throw new Error('JS VM: assignment to non-identifier not supported in Phase 1')
    }
    const id = a.left as IdentifierNode
    const vi = scope.lookup(id.name)
    if (!vi) throw new Error(`JS VM: undefined variable ${id.name}`)
    const rhs = this.emitExpr(a.right, scope)
    const code = this.coerce(rhs.code, rhs.type, vi.typeId)
    return `${vi.jsName} = ${code}`
  }

  private emitProcedureCall(pc: ProcedureCallNode, scope: Scope): string {
    const name = pc.name.name.toUpperCase()
    if (BUILTIN_SYSCALLS.has(name)) {
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
        const vi = scope.lookup((node as IdentifierNode).name)
        if (!vi) throw new Error(`JS VM: undefined variable ${(node as IdentifierNode).name}`)
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
      default:
        throw new Error(`JS VM: unsupported expression ${(node as any).kind}`)
    }
  }

  private emitBinary(node: BinaryExpressionNode, scope: Scope): { code: string; type: string } {
    const L = this.emitExpr(node.left, scope)
    const R = this.emitExpr(node.right, scope)
    const op = node.operator.toUpperCase()
    const resultType = this.binaryResultType(op, L.type, R.type)

    switch (op) {
      case '+': case '-': case '*': {
        if (resultType === 'integer') {
          return { code: `(${L.code} ${op} ${R.code}) | 0`, type: 'integer' }
        }
        return { code: `(${L.code} ${op} ${R.code})`, type: 'real' }
      }
      case '/': // Pascal 实数除
        return { code: `(${L.code} / ${R.code})`, type: 'real' }
      case 'DIV':
        return { code: `Math.trunc(${L.code} / ${R.code}) | 0`, type: 'integer' }
      case 'MOD':
        // Pascal MOD: a - (a div b) * b，trunc 语义。非负操作数下与 % 等价
        return { code: `(${L.code} % ${R.code})`, type: 'integer' }
      case '=':
        return { code: `(${L.code} === ${R.code})`, type: 'boolean' }
      case '<>':
        return { code: `(${L.code} !== ${R.code})`, type: 'boolean' }
      case '<':
        return { code: `(${L.code} < ${R.code})`, type: 'boolean' }
      case '<=':
        return { code: `(${L.code} <= ${R.code})`, type: 'boolean' }
      case '>':
        return { code: `(${L.code} > ${R.code})`, type: 'boolean' }
      case '>=':
        return { code: `(${L.code} >= ${R.code})`, type: 'boolean' }
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
      const args = node.arguments.map(a => this.emitArg(a, scope))
      const retType = builtinReturnType(name)
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
      case 'FunctionCall':
        return builtinReturnType((node as FunctionCallNode).name.name.toUpperCase())
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
  const basePlugins: TypePlugin[] = [integerPlugin, booleanPlugin, charPlugin, realPlugin, ...(options.plugins || [])]
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
  const compiler = new Compiler()
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
  const compiler = new Compiler()
  return compiler.compile(ast)
}
