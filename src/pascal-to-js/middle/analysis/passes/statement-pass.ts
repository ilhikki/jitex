/*
 * Pass 2: 语句分析。
 *
 * 递归遍历每个 block 的 compound 语句，重建作用域栈（只读 lookup），
 * 推断表达式类型，收集 goto/label 记录和无定义引用。
 *
 * 输入：ProgramNode, AnalysisContext, DeclarationResult
 * 输出：StatementResult
 */

import {
  BlockNode,
  CaseStatementNode,
  ExpressionNode,
  IdentifierNode,
  ProgramNode,
  StatementNode,
  TypeNode,
  WithStatementNode,
} from '@/frontend/node.ts'
import {
  AnalysisSymbol,
  BUILTIN_FUNCTION_RETURN_TYPES,
  BUILTIN_FUNCTIONS,
  BUILTIN_IDENTIFIER_TYPES,
  BUILTIN_IDENTIFIERS,
  BUILTIN_PROCEDURES,
  CallableParamSig,
  evalConstChar,
  evalConstInt,
  FuncInfo,
  TypeInfo,
  VariantPartInfo,
  VarSymbol,
} from '../analysis-type.ts'
import { AnalysisContext, DeclarationResult, GotoRecord, ScopeSnapshot, StatementResult } from '../stage-types.ts'
import { isAssignCompatible, isSameType } from '../type-compat.ts'

// Pass 2 入口

export function runStatementPass(
  program: ProgramNode,
  ctx: AnalysisContext,
  declResult: DeclarationResult,
): StatementResult {
  const pass = new StatementPass(ctx, declResult)
  pass.run(program)
  return pass.result()
}

// StatementPass

class StatementPass {
  private ctx: AnalysisContext
  private decl: DeclarationResult

  // 输出
  private exprType = new Map<ExpressionNode, TypeInfo>()
  private symbolCache = new Map<IdentifierNode, AnalysisSymbol | undefined>()
  private withTemps = new Map<WithStatementNode, VarSymbol[]>()
  private gotoRecords: GotoRecord[] = []
  private labelDepth = new Map<number, number>()
  private labelUseFunc = new Map<number, number>()
  private usedLabels = new Set<number>()
  private undefinedRefs: { kind: 'procedure' | 'function' | 'identifier'; name: string }[] = []

  // 运行时状态
  private scopeStack: ScopeSnapshot[] = []
  private withStack: { fields: Map<string, TypeInfo> }[] = []
  private nonTransparentDepth = 0
  /** varId → 变量声明的类型节点，供 6.6.3.3 判定 packed 分量 */
  private varTypeNodes = new Map<number, TypeNode>()

  constructor(ctx: AnalysisContext, decl: DeclarationResult) {
    this.ctx = ctx
    this.decl = decl
  }

  run(program: ProgramNode): void {
    this.collectVarTypeNodes(program.block)
    this.analyzeBlockStatements(program.block)
  }

  /** 收集 varId → 声明类型节点（沿 block 树递归） */
  private collectVarTypeNodes(block: BlockNode): void {
    const scope = this.decl.blockScopes.get(block)
    for (const v of block.variableDeclarations) {
      for (const n of v.names) {
        const sym = scope?.bindings.get(n.name.toLowerCase())
        if (sym?.kind === 'var') {
          this.varTypeNodes.set(sym.varId, v.type)
        }
      }
    }
    for (const p of block.procedureDeclarations) {
      if (p.block) {
        this.collectVarTypeNodes(p.block)
      }
    }
    for (const f of block.functionDeclarations) {
      if (f.block) {
        this.collectVarTypeNodes(f.block)
      }
    }
  }

  result(): StatementResult {
    return {
      exprType: this.exprType,
      symbolCache: this.symbolCache,
      withTemps: this.withTemps,
      gotoRecords: this.gotoRecords,
      labelDepth: this.labelDepth,
      labelUseFunc: this.labelUseFunc,
      usedLabels: this.usedLabels,
      undefinedRefs: this.undefinedRefs,
    }
  }

  // 作用域重建（只读 lookup，不 bind）

  private pushScope(block: BlockNode): void {
    this.scopeStack.push(this.decl.blockScopes.get(block)!)
  }

  private popScope(): void {
    this.scopeStack.pop()
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

  private currentFuncId(): number {
    return this.scopeStack[this.scopeStack.length - 1]!.funcId
  }

  // Block 语句遍历（递归进入子函数）

  private analyzeBlockStatements(block: BlockNode): void {
    this.pushScope(block)
    this.analyzeStatement(block.compound)
    for (const p of block.procedureDeclarations) {
      if (p.block) {
        this.analyzeBlockStatements(p.block)
      }
    }
    for (const f of block.functionDeclarations) {
      if (f.block) {
        this.analyzeBlockStatements(f.block)
      }
    }
    this.popScope()
  }

  // 语句分析

  private analyzeStatement(node: StatementNode): void {
    switch (node.kind) {
      case 'CompoundStatement':
        for (const s of node.statements) {
          this.analyzeStatement(s)
        }
        return
      case 'Assignment': {
        const lt = this.analyzeExpr(node.left)
        const rt = this.analyzeExpr(node.right)
        this.checkAssignmentCompatibility(lt, rt)
        if (lt.tag === 'subrange' && lt.low !== undefined && lt.high !== undefined) {
          const constVal = evalConstInt(node.right, (n) => this.lookup(n))
          if (constVal !== undefined && (constVal < lt.low || constVal > lt.high)) {
            throw new Error(
              `Subrange assignment out of bounds: ${constVal} not in ${lt.low}..${lt.high}`,
            )
          }
          if (lt.baseTag === 'char') {
            const constChar = evalConstChar(node.right)
            if (constChar !== undefined) {
              const code = constChar.charCodeAt(0)
              if (code < lt.low || code > lt.high) {
                throw new Error(
                  `Subrange assignment out of bounds: '${constChar}' (code ${code}) not in ${lt.low}..${lt.high}`,
                )
              }
            }
          }
        }
        return
      }
      case 'IfStatement':
        this.requireBoolean(this.analyzeExpr(node.condition), 'if')
        this.nonTransparentDepth++
        this.analyzeStatement(node.thenBranch)
        if (node.elseBranch) {
          this.analyzeStatement(node.elseBranch)
        }
        this.nonTransparentDepth--
        return
      case 'WhileStatement':
        this.requireBoolean(this.analyzeExpr(node.condition), 'while')
        this.nonTransparentDepth++
        this.analyzeStatement(node.body)
        this.nonTransparentDepth--
        return
      case 'RepeatStatement':
        this.nonTransparentDepth++
        for (const s of node.statements) {
          this.analyzeStatement(s)
        }
        this.requireBoolean(this.analyzeExpr(node.untilCondition), 'repeat')
        this.nonTransparentDepth--
        return
      case 'ForStatement':
        this.analyzeExpr(node.variable)
        this.analyzeExpr(node.initial)
        this.analyzeExpr(node.final)
        this.nonTransparentDepth++
        this.analyzeStatement(node.body)
        this.nonTransparentDepth--
        return
      case 'CaseStatement':
        this.analyzeExpr(node.expression)
        this.checkCaseConstants(node)
        this.nonTransparentDepth++
        for (const br of node.branches) {
          for (const lbl of br.labels) {
            this.analyzeExpr(lbl)
          }
          this.analyzeStatement(br.statement)
        }
        if (node.otherwise) {
          this.analyzeStatement(node.otherwise)
        }
        this.nonTransparentDepth--
        return
      case 'GotoStatement': {
        const labelVal = node.label.value
        this.gotoRecords.push({
          labelVal,
          fromDepth: this.nonTransparentDepth,
          fromFuncId: this.currentFuncId(),
        })
        return
      }
      case 'LabeledStatement': {
        const lblVal = node.label.value
        const funcId = this.currentFuncId()
        const labelInfo = this.findLabel(funcId, lblVal)
        if (labelInfo) {
          if (this.usedLabels.has(labelInfo.labelId)) {
            throw new Error(`Duplicate label usage: ${lblVal}`)
          }
          this.usedLabels.add(labelInfo.labelId)
          this.labelDepth.set(labelInfo.labelId, this.nonTransparentDepth)
          this.labelUseFunc.set(labelInfo.labelId, funcId)
        }
        this.analyzeStatement(node.statement)
        return
      }
      case 'WithStatement': {
        const temps: VarSymbol[] = []
        const newEntries: { fields: Map<string, TypeInfo> }[] = []
        for (const r of node.records) {
          const ti = this.analyzeExpr(r)
          // with 临时变量 ID：从 declResult.nextId 分配
          const withId = this.decl.nextId++
          this.decl.idNames.set(withId, 'with_temp')
          temps.push({
            kind: 'var',
            varId: withId,
            typeInfo: ti,
            isVarParam: false,
          })
          newEntries.push({ fields: ti.fields ?? new Map() })
        }
        this.withTemps.set(node, temps)
        // 把 with 临时变量注册到当前函数 locals
        const funcId = this.currentFuncId()
        const info = this.decl.funcInfos.get(funcId)
        if (info) {
          info.locals.push(...temps)
        }
        for (const e of newEntries) {
          this.withStack.push(e)
        }
        this.nonTransparentDepth++
        this.analyzeStatement(node.body)
        this.nonTransparentDepth--
        for (let i = 0; i < newEntries.length; i++) {
          this.withStack.pop()
        }
        return
      }
      case 'ProcedureCall': {
        const sym = this.lookup(node.name.name)
        this.symbolCache.set(node.name, sym)
        if (
          !sym &&
          !BUILTIN_PROCEDURES.has(node.name.name.toLowerCase()) &&
          !this.ctx.hasExtraProcedure(node.name.name)
        ) {
          this.recordUndefinedRef('procedure', node.name.name)
        }
        // 用户定义过程 或 可调用形参（过程/函数形参）的形参表
        let params: VarSymbol[] | undefined
        if (sym?.kind === 'func') {
          params = this.decl.funcInfos.get(sym.funcId)?.params
        } else if (sym?.kind === 'param' && sym.callable) {
          // 可调用形参的自带形参表签名（analysis-type CallableParamInfo.params → VarSymbol[]）
          params = sym.callable.params.map((s, i) => ({
            kind: 'param',
            varId: -1 - i,
            name: '',
            typeInfo: s.typeInfo,
            isVarParam: s.isVar,
          } as VarSymbol))
        }
        for (let i = 0; i < node.arguments.length; i++) {
          const arg = node.arguments[i]
          const formal = params?.[i]
          if (formal?.callable) {
            // 可调用形参的实参是过程/函数标识符，不作表达式求值，
            // 但仍需缓存符号供 lowering 查找函数引用。
            if (arg.kind === 'Identifier') {
              this.symbolCache.set(arg, this.lookup(arg.name))
            }
            continue
          }
          const argType = this.analyzeExpr(arg)
          if (formal?.isVarParam) {
            this.checkVariableParameter(node.name.name, formal, arg, argType)
          }
        }
        if (params) {
          this.checkCallableActuals(node.name.name, params, node.arguments)
        }
        return
      }
      case 'EmptyStatement':
        return
    }
  }

  // 表达式分析

  private analyzeExpr(node: ExpressionNode): TypeInfo {
    const cached = this.exprType.get(node)
    if (cached) {
      return cached
    }

    let info: TypeInfo
    switch (node.kind) {
      case 'IntegerLiteral':
        info = { tag: 'integer' }
        break
      case 'RealLiteral':
        info = { tag: 'real' }
        break
      case 'StringLiteral':
        info = {
          tag: 'array',
          dims: [{ low: 1, high: node.value.length }],
          elem: { tag: 'char' },
        }
        break
      case 'CharLiteral':
        info = { tag: 'char' }
        break
      case 'BooleanLiteral':
        info = { tag: 'boolean' }
        break

      case 'Identifier': {
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
        if (!sym && !BUILTIN_IDENTIFIERS.has(node.name.toLowerCase())) {
          this.recordUndefinedRef('identifier', node.name)
        }
        if (sym?.kind === 'var' || sym?.kind === 'param') {
          if (sym.typeInfo.tag === 'procedure') {
            // ISO 7185 6.6.3.4：过程形参不能出现在表达式中，只能作为过程语句
            throw new Error(
              `procedure formal parameter '${node.name}' cannot be used as an expression (ISO 7185 6.6.3.4)`,
            )
          }
          info = sym.typeInfo
        } else if (sym?.kind === 'const') {
          info = sym.typeInfo
        } else if (sym?.kind === 'func') {
          info = sym.retTypeInfo ?? this.unknown(node, `func '${node.name}' 无返回类型`)
        } else {
          // 内置无参标识符的类型来自声明表 —— analysis 不写内置名字分支
          // （内置语义归 rewrite，这里只查「它是什么类型」）
          info = BUILTIN_IDENTIFIER_TYPES[node.name.toLowerCase()] ??
            this.unknown(node, `identifier '${node.name}' 未解析到符号`)
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
        if (op === 'AND' || op === 'OR') {
          info = lt.tag === 'integer' ? { tag: 'integer' } : { tag: 'boolean' }
        } else if (['=', '<>', '<', '<=', '>', '>='].includes(op)) {
          info = { tag: 'boolean' }
        } else if (op === '/') {
          info = { tag: 'real' }
        } else if (op === 'DIV' || op === 'MOD') {
          info = { tag: 'integer' }
        } else {
          if (lt.tag === 'set' && rt.tag === 'set') {
            info = { tag: 'set' }
          } else if (lt.tag === 'real' || rt.tag === 'real') {
            info = { tag: 'real' }
          } else info = { tag: 'integer' }
        }
        break
      }

      case 'UnaryExpression': {
        const ot = this.analyzeExpr(node.operand)
        if (node.operator === 'NOT') {
          info = ot.tag === 'integer' ? { tag: 'integer' } : { tag: 'boolean' }
        } else if (node.operator === '-') {
          info = ot.tag === 'real' ? { tag: 'real' } : { tag: 'integer' }
        } else {
          info = ot
        }
        break
      }

      case 'FunctionCall': {
        const sym = this.lookup(node.name.name)
        this.symbolCache.set(node.name, sym)
        if (
          !sym &&
          !BUILTIN_FUNCTIONS.has(node.name.name.toLowerCase()) &&
          !this.ctx.hasExtraFunction(node.name.name)
        ) {
          this.recordUndefinedRef('function', node.name.name)
        }
        // 取被调用者的形参表（用户函数 或 可调用形参）
        let callParams: VarSymbol[] | undefined
        if (sym?.kind === 'func') {
          callParams = this.decl.funcInfos.get(sym.funcId)?.params
        } else if (sym?.kind === 'param' && sym.callable) {
          callParams = sym.callable.params.map((s, i) => ({
            kind: 'param',
            varId: -1 - i,
            name: '',
            typeInfo: s.typeInfo,
            isVarParam: s.isVar,
          } as VarSymbol))
        }
        for (let i = 0; i < node.arguments.length; i++) {
          const a = node.arguments[i]
          if (callParams?.[i]?.callable) {
            // 可调用形参的实参是过程/函数标识符，不作表达式求值，但缓存符号
            if (a.kind === 'Identifier') {
              this.symbolCache.set(a, this.lookup(a.name))
            }
            continue
          }
          this.analyzeExpr(a)
        }
        if (callParams) {
          this.checkCallableActuals(node.name.name, callParams, node.arguments)
        }
        if (sym?.kind === 'param' && sym.callable) {
          // ISO 7185 6.6.3.5：调用可调用形参。过程形参不能作函数调用。
          if (sym.callable.kind !== 'function') {
            throw new Error(
              `'${node.name.name}' is a procedure formal parameter and is not a function (ISO 7185 6.6.3.4)`,
            )
          }
          if (sym.callable.params.length !== node.arguments.length) {
            throw new Error(
              `function '${node.name.name}' expects ${sym.callable.params.length} actual-parameter(s) but ${node.arguments.length} given (ISO 7185 6.7.3)`,
            )
          }
          info = sym.typeInfo
        } else if (sym?.kind === 'func') {
          const funcInfo = this.decl.funcInfos.get(sym.funcId)
          if (funcInfo && funcInfo.params.length !== node.arguments.length) {
            throw new Error(
              `function '${node.name.name}' expects ${funcInfo.params.length} actual-parameter(s) but ${node.arguments.length} given (ISO 7185 6.7.3)`,
            )
          }
          info = sym.retTypeInfo ?? this.unknown(node, `call '${node.name.name}' 无返回类型`)
        } else {
          info = this.builtinFuncReturnType(node.name.name, node.arguments)
          if (info.tag === 'unknown') {
            info = this.unknown(node, `builtin '${node.name.name}' 无已知返回类型`)
          }
        }
        break
      }

      case 'ArrayAccess': {
        const arrType = this.analyzeExpr(node.array)
        if (arrType.tag === 'array' && arrType.dims) {
          for (let i = 0; i < node.indices.length && i < arrType.dims.length; i++) {
            const constIdx = evalConstInt(node.indices[i], (n) => this.lookup(n))
            if (constIdx !== undefined) {
              const dim = arrType.dims[i]
              if (constIdx < dim.low || constIdx > dim.high) {
                throw new Error(
                  `Array index out of bounds: ${constIdx} not in ${dim.low}..${dim.high}`,
                )
              }
            }
          }
        }
        for (const idx of node.indices) {
          this.analyzeExpr(idx)
        }
        info = this.arrayElemType(arrType, node.indices.length)
        if (info.tag === 'unknown') {
          info = this.unknown(
            node,
            `array access 元素类型未知 (base=${arrType.tag}, indices=${node.indices.length})`,
          )
        }
        break
      }

      case 'FieldAccess': {
        const objType = this.analyzeExpr(node.object)
        if (objType.tag === 'record' && objType.fields) {
          const f = this.findRecordField(objType, node.field.name.toLowerCase())
          info = f ?? this.unknown(node, `record 无字段 '${node.field.name}' (objType.tag=${objType.tag})`)
        } else if (node.field.name === '^' && objType.tag === 'pointer') {
          info = objType.domainType ??
            this.unknown(node, `pointer 无 domainType（解引用 '^'）`)
        } else if (node.field.name === '^' && objType.tag === 'file') {
          info = objType.elem ?? { tag: 'char' }
        } else {
          info = this.unknown(
            node,
            `field access 基类型不可解 (objType.tag=${objType.tag}, field='${node.field.name}')`,
          )
        }
        break
      }

      case 'SetConstructor':
        for (const [s, e] of node.elements) {
          this.analyzeExpr(s)
          if (e) {
            this.analyzeExpr(e)
          }
        }
        info = { tag: 'set' }
        break

      case 'InExpression':
        this.analyzeExpr(node.left)
        this.analyzeExpr(node.right)
        info = { tag: 'boolean' }
        break
    }

    this.exprType.set(node, info)
    return info
  }

  /**
   * 记录一次 unknown 类型推断，打印出触发它的 AST 节点（printer 还原为源码）。
   * 仅用于定位类型链断点，返回 `{tag:'unknown'}` 本身。
   */
  private unknown(_node: ExpressionNode, _why: string): TypeInfo {
    return { tag: 'unknown' }
  }

  /**
   * 在 record 类型中查找字段，含 variant part（含嵌套分支）。
   * 静态类型检查接受变体字段的并集，实际布局偏移由 rewrite 依据 selector 计算。
   */
  private findRecordField(td: TypeInfo, name: string): TypeInfo | undefined {
    return td.fields?.get(name) ?? this.findInVariant(td.variant, name)
  }

  private findInVariant(v: VariantPartInfo | undefined, name: string): TypeInfo | undefined {
    if (!v) {
      return undefined
    }
    for (const b of v.branches) {
      const f = b.fields.get(name)
      if (f) {
        return f
      }
      const nested = this.findInVariant(b.nested, name)
      if (nested) {
        return nested
      }
    }
    return undefined
  }

  private arrayElemType(arrType: TypeInfo, dims: number): TypeInfo {
    let t = arrType
    let remaining = dims
    while (remaining > 0 && t.tag === 'array' && t.elem) {
      // declaration-pass 把 `array[a,b] of T` 展平成 {dims:[a,b], elem:T}，
      // 因此按维度一次消费整层 dims，而不是逐层下沉 elem。
      const n = t.dims?.length ?? 1
      if (remaining >= n) {
        remaining -= n
        t = t.elem
      } else {
        // 部分索引：返回剩余维度的数组类型
        return { tag: 'array', dims: (t.dims ?? []).slice(remaining), elem: t.elem }
      }
    }
    return remaining === 0 ? t : { tag: 'unknown' }
  }

  /**
   * 内置函数的返回类型。
   *
   * 这是唯一允许 analysis 依赖的内置语义，且只依赖「返回类型」：规则取自
   * BUILTIN_FUNCTION_RETURN_TYPES，本函数不含任何内置函数名分支。实参个数、
   * 实参形态、合法调用形式一律不问——那些归 rewrite 解释。
   */
  private builtinFuncReturnType(name: string, args: ExpressionNode[]): TypeInfo {
    const rule = BUILTIN_FUNCTION_RETURN_TYPES[name.toLowerCase()]
    if (rule === undefined) {
      return { tag: 'unknown' }
    }
    if (rule.kind === 'sameAsFirstArg') {
      // 无实参时沿用既有缺省（integer）
      return args.length > 0 ? this.analyzeExpr(args[0]) : { tag: 'integer' }
    }
    return rule.type
  }

  // ISO 7185 检查：6.4.6 赋值兼容、6.8.3.4 条件类型、6.8.3.5 case 常量互异、
  // 6.6.3.3 变量参数、6.7.3 实参个数

  /** ISO 6.8.2.2 + 6.4.6：值须与变量类型赋值兼容 */
  private checkAssignmentCompatibility(
    target: TypeInfo,
    value: TypeInfo,
  ): void {
    if (target.tag === 'unknown' || value.tag === 'unknown') {
      return
    }
    if (isAssignCompatible(target, value)) {
      return
    }
    throw new Error(
      `Assignment is not assignment-compatible (ISO 7185 6.4.6): variable type '${target.tag}' ← expression type '${value.tag}'`,
    )
  }

  /** ISO 6.7.2.3 / 6.8.3.4：if/while/repeat 的条件须是 Boolean-expression */
  private requireBoolean(t: TypeInfo, what: string): void {
    if (t.tag === 'boolean' || t.tag === 'unknown') {
      return
    }
    throw new Error(
      `The condition of the '${what}' statement shall be a Boolean-expression (ISO 7185 6.8.3.4), found '${t.tag}'`,
    )
  }

  /** ISO 6.8.3.5：case 常量所表示的值须互异 */
  private checkCaseConstants(node: CaseStatementNode): void {
    const seen = new Set<number>()
    for (const br of node.branches) {
      for (const lbl of br.labels) {
        const v = evalConstInt(lbl, (n) => this.lookup(n))
        if (v === undefined) {
          // 无法求值的 case 常量交由其它检查处理，此处不做类型推断
          continue
        }
        if (seen.has(v)) {
          throw new Error(
            `Duplicate case-constant ${v} (ISO 7185 6.8.3.5: the values denoted by the case-constants shall be distinct)`,
          )
        }
        seen.add(v)
      }
    }
  }

  /** ISO 6.6.3.3：变量参数实参的类型与形态限制 */
  private checkVariableParameter(
    procName: string,
    param: VarSymbol,
    arg: ExpressionNode,
    argType: TypeInfo,
  ): void {
    if (arg.kind !== 'Identifier' && arg.kind !== 'ArrayAccess' && arg.kind !== 'FieldAccess') {
      throw new Error(
        `The actual variable-parameter of '${procName}' shall be a variable-access (ISO 7185 6.6.3.3)`,
      )
    }
    if (argType.tag !== 'unknown' && !isSameType(param.typeInfo, argType)) {
      throw new Error(
        `The actual variable-parameter of '${procName}' shall possess the same type as the formal-parameter (ISO 7185 6.6.3.3)`,
      )
    }
    if (arg.kind === 'FieldAccess') {
      const objType = this.analyzeExpr(arg.object)
      const tagName = objType.variant?.tagName
      if (tagName !== undefined && tagName === arg.field.name.toLowerCase()) {
        throw new Error(
          `The actual variable-parameter of '${procName}' shall not denote the selector field of a variant-part (ISO 7185 6.6.3.3)`,
        )
      }
    }
    if (arg.kind === 'ArrayAccess' && this.isPackedComponent(arg)) {
      throw new Error(
        `The actual variable-parameter of '${procName}' shall not denote a component of a packed variable (ISO 7185 6.6.3.3)`,
      )
    }
  }

  /** 沿数组访问回溯到基变量，判断其声明类型是否为 packed array */
  private isPackedComponent(arg: ExpressionNode): boolean {
    let base: ExpressionNode = arg
    while (base.kind === 'ArrayAccess') {
      base = base.array
    }
    if (base.kind !== 'Identifier') {
      return false
    }
    const sym = this.symbolCache.get(base) ?? this.lookup(base.name)
    if (sym?.kind !== 'var' && sym?.kind !== 'param') {
      return false
    }
    const typeNode = this.varTypeNodes.get(sym.varId)
    return typeNode?.kind === 'ArrayType' && typeNode.isPacked
  }

  // 辅助

  /**
   * ISO 7185 6.6.3.4/6.6.3.5：校验可调用形参对应的实参——
   * 实参须是有定义点、且该定义点被 program-block 包含的过程/函数标识符。
   */
  private checkCallableActuals(
    calleeName: string,
    formals: VarSymbol[],
    args: ExpressionNode[],
  ): void {
    // ISO 7185 6.6.3.1：actual-parameter-list 须与 formal-parameter-list 一一对应
    if (args.length > formals.length) {
      throw new Error(
        `'${calleeName}' expects ${formals.length} actual parameter(s) but got ${args.length} (ISO 7185 6.6.3.1)`,
      )
    }
    for (let i = 0; i < formals.length && i < args.length; i++) {
      const formal = formals[i]
      if (formal.callable) {
        this.checkCallableActual(calleeName, formal, args[i])
      }
    }
  }

  private checkCallableActual(
    calleeName: string,
    formal: VarSymbol,
    arg: ExpressionNode,
  ): void {
    const spec = formal.callable!
    const isFunc = spec.kind === 'function'
    const noun = isFunc ? 'function-identifier' : 'procedure-identifier'
    const section = isFunc ? '6.6.3.5' : '6.6.3.4'
    if (arg.kind !== 'Identifier') {
      throw new Error(
        `The actual-parameter of '${calleeName}' for a ${spec.kind} formal parameter shall be a ${noun} (ISO 7185 ${section})`,
      )
    }
    const sym = this.lookup(arg.name)

    // 实参是用户定义的过程/函数
    if (sym?.kind === 'func') {
      const actualInfo = this.decl.funcInfos.get(sym.funcId)
      if (!actualInfo) {
        throw new Error(
          `The actual-parameter of '${calleeName}' shall be a ${noun} with a defining-point (ISO 7185 ${section})`,
        )
      }
      if (isFunc) {
        if (actualInfo.kind !== 'function') {
          throw new Error(
            `The actual-parameter of '${calleeName}' shall be a function-identifier (ISO 7185 6.6.3.5)`,
          )
        }
        if (
          !isSameType(
            spec.retTypeInfo ?? { tag: 'unknown' } as TypeInfo,
            sym.retTypeInfo ?? { tag: 'unknown' } as TypeInfo,
          )
        ) {
          throw new Error(
            `The result-type of the actual function '${arg.name}' and that of the formal parameter of '${calleeName}' shall denote the same type (ISO 7185 6.6.3.5)`,
          )
        }
      } else if (actualInfo.kind !== 'procedure') {
        throw new Error(
          `The actual-parameter of '${calleeName}' shall be a procedure-identifier (ISO 7185 6.6.3.4)`,
        )
      }
      this.checkCallableCongruity(calleeName, spec.params, actualInfo, arg.name)
      return
    }

    // 实参是可调用形参（链式传递：形参本身作另一形参的实参，ISO 6.6.3.4/3.5）
    if (sym?.kind === 'param' && sym.callable) {
      if (sym.callable.kind !== spec.kind) {
        throw new Error(
          `The actual-parameter of '${calleeName}' shall be a ${noun} (ISO 7185 ${section})`,
        )
      }
      if (isFunc) {
        if (
          !isSameType(
            spec.retTypeInfo ?? { tag: 'unknown' } as TypeInfo,
            sym.callable.retTypeInfo ?? { tag: 'unknown' } as TypeInfo,
          )
        ) {
          throw new Error(
            `The result-type of the actual function '${arg.name}' and that of the formal parameter of '${calleeName}' shall denote the same type (ISO 7185 6.6.3.5)`,
          )
        }
      }
      // 形参签名 congruity：逐位比较 isVar 与类型同一
      const actualSigs = sym.callable.params
      if (spec.params.length !== actualSigs.length) {
        throw new Error(
          `The formal-parameter-lists of '${arg.name}' and the formal parameter of '${calleeName}' shall be congruous (ISO 7185 6.6.3.6)`,
        )
      }
      for (let i = 0; i < spec.params.length; i++) {
        if (spec.params[i].isVar !== actualSigs[i].isVar) {
          throw new Error(
            `Corresponding formal-parameter-sections of '${arg.name}' and '${calleeName}' shall match (both value or both variable) (ISO 7185 6.6.3.6)`,
          )
        }
        if (!isSameType(spec.params[i].typeInfo, actualSigs[i].typeInfo)) {
          throw new Error(
            `The type-identifiers in corresponding positions of '${arg.name}' and '${calleeName}' shall denote the same type (ISO 7185 6.6.3.6)`,
          )
        }
      }
      return
    }

    throw new Error(
      `The actual-parameter of '${calleeName}' shall be a ${noun} with a defining-point contained by the program-block (ISO 7185 ${section})`,
    )
  }

  /** ISO 7185 6.6.3.6：形参段自带的形参表与实参函数的形参表须 congruous，或两者都不出现 */
  private checkCallableCongruity(
    calleeName: string,
    formalSigs: CallableParamSig[],
    actualInfo: FuncInfo,
    actualName: string,
  ): void {
    const actuals = actualInfo.params
    if (formalSigs.length !== actuals.length) {
      throw new Error(
        `The formal-parameter-lists of '${actualName}' and of the corresponding formal parameter of '${calleeName}' shall be congruous, or both shall be absent (ISO 7185 6.6.3.6)`,
      )
    }
    for (let i = 0; i < formalSigs.length; i++) {
      const f = formalSigs[i]
      const act = actuals[i]
      if (f.isVar !== act.isVarParam) {
        throw new Error(
          `Corresponding formal-parameter-sections of '${actualName}' and '${calleeName}' shall both be value or both be variable parameters (ISO 7185 6.6.3.6)`,
        )
      }
      if (
        f.typeInfo.tag !== 'unknown' && act.typeInfo.tag !== 'unknown' &&
        !isSameType(f.typeInfo, act.typeInfo)
      ) {
        throw new Error(
          `Corresponding formal-parameter-sections of '${actualName}' and '${calleeName}' shall have the same type (ISO 7185 6.6.3.6)`,
        )
      }
    }
  }

  private findLabel(
    funcId: number,
    labelVal: number,
  ): { labelId: number; funcId: number } | undefined {
    let fid: number | undefined = funcId
    while (fid !== undefined) {
      const funcLabels = this.decl.labels.get(fid)
      if (funcLabels) {
        const info = funcLabels.get(labelVal)
        if (info) {
          return info
        }
      }
      const functionInfo = this.decl.funcInfos.get(fid)
      fid = functionInfo ? functionInfo.parentFuncId : undefined
    }
    return undefined
  }

  private recordUndefinedRef(
    kind: 'procedure' | 'function' | 'identifier',
    name: string,
  ): void {
    const lower = name.toLowerCase()
    if (!this.undefinedRefs.some((r) => r.kind === kind && r.name.toLowerCase() === lower)) {
      this.undefinedRefs.push({ kind, name })
    }
  }
}
