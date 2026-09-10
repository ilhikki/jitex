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
  ExpressionNode,
  IdentifierNode,
  ProgramNode,
  StatementNode,
  WithStatementNode,
} from '@/frontend/node.ts'
import { nodeToCode } from '@/frontend/printer/printer.ts'
import {
  AnalysisSymbol,
  BUILTIN_FUNCTIONS,
  BUILTIN_IDENTIFIERS,
  BUILTIN_PROCEDURES,
  evalConstChar,
  evalConstInt,
  TypeInfo,
  VariantPartInfo,
  VarSymbol,
} from '../analysis-type.ts'
import { AnalysisContext, DeclarationResult, GotoRecord, ScopeSnapshot, StatementResult } from '../stage-types.ts'

// ============================================================
// Pass 2 入口
// ============================================================

export function runStatementPass(
  program: ProgramNode,
  ctx: AnalysisContext,
  declResult: DeclarationResult,
): StatementResult {
  const pass = new StatementPass(ctx, declResult)
  pass.run(program)
  return pass.result()
}

// ============================================================
// StatementPass
// ============================================================

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

  constructor(ctx: AnalysisContext, decl: DeclarationResult) {
    this.ctx = ctx
    this.decl = decl
  }

  run(program: ProgramNode): void {
    this.analyzeBlockStatements(program.block)
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

  // --------------------------------------------------------
  // 作用域重建（只读 lookup，不 bind）
  // --------------------------------------------------------

  private pushScope(block: BlockNode): void {
    const scope = this.decl.blockScopes.get(block)
    if (!scope) {
      throw new Error(`StatementPass: no scope snapshot for block`)
    }
    this.scopeStack.push(scope)
  }

  private popScope(): void {
    this.scopeStack.pop()
  }

  private lookup(name: string): AnalysisSymbol | undefined {
    const key = name.toLowerCase()
    let s: ScopeSnapshot | null = this.scopeStack[this.scopeStack.length - 1] ?? null
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
    const s = this.scopeStack[this.scopeStack.length - 1]
    if (!s) {
      throw new Error('StatementPass: no active scope')
    }
    return s.funcId
  }

  // --------------------------------------------------------
  // Block 语句遍历（递归进入子函数）
  // --------------------------------------------------------

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

  // --------------------------------------------------------
  // 语句分析
  // --------------------------------------------------------

  private analyzeStatement(node: StatementNode): void {
    switch (node.kind) {
      case 'CompoundStatement':
        for (const s of node.statements) {
          this.analyzeStatement(s)
        }
        return
      case 'Assignment': {
        const lt = this.analyzeExpr(node.left)
        this.analyzeExpr(node.right)
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
        this.analyzeExpr(node.condition)
        this.nonTransparentDepth++
        this.analyzeStatement(node.thenBranch)
        if (node.elseBranch) {
          this.analyzeStatement(node.elseBranch)
        }
        this.nonTransparentDepth--
        return
      case 'WhileStatement':
        this.analyzeExpr(node.condition)
        this.nonTransparentDepth++
        this.analyzeStatement(node.body)
        this.nonTransparentDepth--
        return
      case 'RepeatStatement':
        this.nonTransparentDepth++
        for (const s of node.statements) {
          this.analyzeStatement(s)
        }
        this.analyzeExpr(node.untilCondition)
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
        for (const a of node.arguments) {
          this.analyzeExpr(a)
        }
        return
      }
      case 'EmptyStatement':
        return
    }
  }

  // --------------------------------------------------------
  // 表达式分析
  // --------------------------------------------------------

  private analyzeExpr(node: ExpressionNode): TypeInfo {
    const cached = this.exprType.get(node)
    if (cached) {
      return cached
    }

    let info: TypeInfo
    switch (node.kind) {
      case 'IntegerLiteral':
        info = { tag: 'i32' }
        break
      case 'RealLiteral':
        info = { tag: 'f64' }
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
        info = { tag: 'bool' }
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
          info = sym.typeInfo
        } else if (sym?.kind === 'const') {
          info = sym.typeInfo
        } else if (sym?.kind === 'func') {
          info = sym.retTypeInfo ?? this.unknown(node, `func '${node.name}' 无返回类型`)
        } else {
          const lower = node.name.toLowerCase()
          if (lower === 'eof' || lower === 'eoln') {
            info = { tag: 'bool' }
          } else if (lower === 'nil') {
            info = { tag: 'pointer' }
          } else {
            info = this.unknown(node, `identifier '${node.name}' 未解析到符号`)
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
          info = lt.tag === 'i32' ? { tag: 'i32' } : { tag: 'bool' }
        } else if (['=', '<>', '<', '<=', '>', '>='].includes(op)) {
          info = { tag: 'bool' }
        } else if (op === '/') {
          info = { tag: 'f64' }
        } else if (op === 'div' || op === 'mod') {
          info = { tag: 'i32' }
        } else {
          if (lt.tag === 'set' && rt.tag === 'set') {
            info = { tag: 'set' }
          } else if (lt.tag === 'f64' || rt.tag === 'f64') {
            info = { tag: 'f64' }
          } else info = { tag: 'i32' }
        }
        break
      }

      case 'UnaryExpression': {
        const ot = this.analyzeExpr(node.operand)
        if (node.operator === 'not') {
          info = ot.tag === 'i32' ? { tag: 'i32' } : { tag: 'bool' }
        } else if (node.operator === '-') {
          info = ot.tag === 'f64' ? { tag: 'f64' } : { tag: 'i32' }
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
        for (const a of node.arguments) {
          this.analyzeExpr(a)
        }
        if (sym?.kind === 'func') {
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
        if (objType.tag === 'rec' && objType.fields) {
          const f = this.findRecordField(objType, node.field.name.toLowerCase())
          info = f ?? this.unknown(node, `record 无字段 '${node.field.name}' (objType.tag=rec)`)
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
        info = { tag: 'bool' }
        break

      default:
        info = this.unknown(node, '未处理的表达式 kind')
    }

    this.exprType.set(node, info)
    return info
  }

  /**
   * 记录一次 unknown 类型推断，打印出触发它的 AST 节点（printer 还原为源码）。
   * 仅用于定位类型链断点，返回 `{tag:'unknown'}` 本身。
   */
  private unknown(node: ExpressionNode, why: string): TypeInfo {
    let src = `<printer failed: ${node.kind}>`
    try {
      src = nodeToCode(node)
    } catch {
      // 节点可能不是完整语句，printer 失败时退化为 kind
    }
    console.error(`[analysis:unknown] ${why} | kind=${node.kind} | src=${src}`)
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

  private builtinFuncReturnType(name: string, args: ExpressionNode[]): TypeInfo {
    const n = name.toLowerCase()
    if (['abs', 'sqr', 'pred', 'succ'].includes(n)) {
      if (args.length > 0) {
        return this.analyzeExpr(args[0])
      }
      return { tag: 'i32' }
    }
    if (['sqrt', 'sin', 'cos', 'exp', 'ln', 'arctan'].includes(n)) {
      return { tag: 'f64' }
    }
    if (['trunc', 'round', 'ord', 'length'].includes(n)) {
      return { tag: 'i32' }
    }
    if (['chr'].includes(n)) {
      return { tag: 'char' }
    }
    if (['odd', 'eof', 'eoln'].includes(n)) {
      return { tag: 'bool' }
    }
    return { tag: 'unknown' }
  }

  // --------------------------------------------------------
  // 辅助
  // --------------------------------------------------------

  private findLabel(
    funcId: number,
    labelVal: number,
  ): { labelId: number; funcId: number } | undefined {
    let fid: number | null = funcId
    while (fid !== null) {
      const funcLabels = this.decl.labels.get(fid)
      if (funcLabels) {
        const info = funcLabels.get(labelVal)
        if (info) {
          return info
        }
      }
      const finfo = this.decl.funcInfos.get(fid)
      fid = finfo ? finfo.parentFuncId : null
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
