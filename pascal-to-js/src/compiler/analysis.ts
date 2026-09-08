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
  BlockNode,
  ConstDeclarationNode,
  ExpressionNode,
  FunctionDeclarationNode,
  IdentifierNode,
  ParameterDeclarationNode,
  ProcedureDeclarationNode,
  ProgramNode,
  RecordVariantPartNode,
  StatementNode,
  TypeNode,
  WithStatementNode,
} from '../ast/types.ts'

// ============================================================
// 类型系统
// ============================================================

export type TypeTag =
  | 'i32'
  | 'f64'
  | 'bool'
  | 'char'
  | 'array'
  | 'rec'
  | 'set'
  | 'file'
  | 'enum'
  | 'subrange'
  | 'pointer'
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
  /** 变体部分：一棵树，对应 AST 的 RecordVariantPartNode */
  variant?: VariantPartInfo
  // set
  setBase?: TypeInfo
  // enum
  enumCount?: number
  // pointer (ISO 7185 6.4.4)
  domainType?: TypeInfo
}

/** 变体部分信息（对应 AST 的 RecordVariantPartNode） */
export interface VariantPartInfo {
  /** tag 字段名（小写）；case tag: type 中的 tag，无则 undefined */
  tagName?: string
  branches: VariantBranchInfo[]
}

/** 单个变体分支信息（对应 AST 的 RecordVariantNode） */
export interface VariantBranchInfo {
  /** case 标签的 ord 值集合（多标签共享同一分支） */
  labels: number[]
  /** 该分支的字段（字段名小写 → 类型） */
  fields: Map<string, TypeInfo>
  /** 嵌套变体（分支内还有 case 时） */
  nested?: VariantPartInfo
}

const SIMPLE_TYPES: Record<string, TypeInfo> = {
  integer: { tag: 'i32' },
  longint: { tag: 'i32' },
  shortint: { tag: 'i32' },
  byte: { tag: 'i32' },
  word: { tag: 'i32' },
  cardinal: { tag: 'i32' },
  real: { tag: 'f64' },
  single: { tag: 'f64' },
  double: { tag: 'f64' },
  extended: { tag: 'f64' },
  boolean: { tag: 'bool' },
  char: { tag: 'char' },
  // string 是非标扩展（ISO 7185 无 string 类型，只有 packed array[1..n] of char）。
  // 启用 extension 'string' 时映射为 char 数组（长度不定，dims.high 用 0 占位）。
  string: { tag: 'array', dims: [{ low: 1, high: 0 }], elem: { tag: 'char' } },
  text: { tag: 'file', elem: { tag: 'char' } },
}

// ============================================================
// 内置过程/函数名
// 与 compiler.ts 的 compileProcedureCall / compileFunctionCall /
// compileIdentifier 保持一致：这些名字不需要用户定义即可调用。
// ============================================================

/** 内置过程名（compileProcedureCall 支持；ISO 7185 6.6.5 标准过程 + runtime 扩展） */
const BUILTIN_PROCEDURES = new Set([
  'writeln',
  'write',
  'readln',
  'read',
  'reset',
  'rewrite',
  'get',
  'put',
  'page',
  'new',
  'dispose',
])

/** 内置函数名（compileFunctionCall 支持；ISO 7185 6.6.6 标准函数 + runtime 扩展） */
const BUILTIN_FUNCTIONS = new Set([
  'abs',
  'sqr',
  'sqrt',
  'sin',
  'cos',
  'exp',
  'ln',
  'arctan',
  'trunc',
  'round',
  'ord',
  'chr',
  'pred',
  'succ',
  'odd',
  'eof',
  'eoln',
])

/** 内置无参标识符（parser 将无参调用解析为 Identifier，compileIdentifier 处理） */
const BUILTIN_IDENTIFIERS = new Set(['maxint', 'nil', 'eof', 'eoln'])

/**
 * 额外 callable 注入项（编译期声明，AGENTS.md 原则 A.7：注入优先）。
 * key 为 Pascal 过程/函数名（分析时按小写归一），value 描述对应 syscall 与覆盖许可。
 */
export interface ExtraCallable {
  /** 运行期 syscall 名（由运行期 extraSyscalls 提供 handler） */
  sysCallName: string
  /** 'function' = 用于表达式；'procedure' = 用于语句 */
  kind: 'function' | 'procedure'
  /** 是否允许覆盖同名原生内建过程/函数；为 false 且与原生冲突时分析期抛错 */
  allowOverrideNative?: boolean | undefined
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

/** 函数/过程/程序的分类，用于决定编译期与运行期的初始化策略 */
export type FuncKind = 'function' | 'procedure' | 'program'

export interface FuncInfo {
  funcId: number
  parentFuncId: number | null
  params: VarSymbol[]
  locals: VarSymbol[]
  retval?: VarSymbol
  children: number[]
  hasBody: boolean
  kind: FuncKind
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
  /** id → 可读名字（调试用，仅 json-code-compiler 读取） */
  private idNames = new Map<number, string>()
  /** 非标特性扩展（AGENTS.md 原则 A） */
  private extensions: Set<string> = new Set()
  /** 额外 callable 注入表（小写名为 key；分析期与原生内建合并做冲突检查） */
  private extraCallables: Map<string, ExtraCallable> | undefined
  /** 非透明块深度（while/for/if/repeat/case/with 体内部） */
  private nonTransparentDepth = 0
  /** label 出现的非透明块深度（key: labelId，全局唯一） */
  private labelDepth = new Map<number, number>()
  /** 延迟检查的 goto 列表（goto 可能先于 label 出现，需等所有 labelDepth 收集完再检查） */
  private gotosToCheck: { labelVal: number; fromDepth: number; fromFuncId: number }[] = []
  /** 已使用的 label（key: labelId，检测重复使用） */
  private usedLabels = new Set<number>()
  /** label 使用位置的 funcId（key: labelId）。
   *  label 可能在祖先函数声明，但在后代函数使用（label 30 在 main 声明，在 level2 使用）。
   *  longJump 需跳到使用位置，而非声明位置。 */
  private labelUseFunc = new Map<number, number>()

  // --------------------------------------------------------
  // 分析入口
  // --------------------------------------------------------

  analyze(program: ProgramNode, extensions?: string[], extraCallables?: Record<string, ExtraCallable>): Analysis {
    if (extensions) {
      this.extensions = new Set(extensions)
    }
    this.extraCallables = this.mergeExtraCallables(extraCallables)
    const topFuncId = this.allocFunc(program.block, null, 'program', null)

    this.pushScope(topFuncId)
    this.analyzeBlock(program.block, topFuncId)
    this.globalBindings = this.currentScope().bindings
    this.popScope()

    // post-check：所有 labelDepth 已收集完毕，现在检查 goto 规则
    this.checkGotos()
    // 独立检查阶段：一次性报告所有无定义引用（ISO 7185 6.2.1）
    this.checkUndefinedRefs()

    return this.freeze()
  }

  /** goto 规则检查（ISO 7185 6.8.1, 6.8.2.4） */
  private checkGotos(): void {
    for (const g of this.gotosToCheck) {
      const labelInfo = this.findLabel(g.fromFuncId, g.labelVal)
      if (!labelInfo) {
        throw new Error(`Goto to undeclared label: ${g.labelVal}`)
      }
      // 跨过程 goto：仅允许跳到祖先函数的 label
      if (labelInfo.funcId !== g.fromFuncId) {
        if (!this.isAncestorFunc(labelInfo.funcId, g.fromFuncId)) {
          throw new Error(
            `Goto to label ${g.labelVal} in another procedure is forbidden (ISO 7185 6.8.2.4)`,
          )
        }
      }
      // 跳入非透明块检查：label 深度 > goto 深度 → 跳入结构体内部
      const targetDepth = this.labelDepth.get(labelInfo.labelId)
      if (targetDepth !== undefined && targetDepth > g.fromDepth) {
        throw new Error(
          `Goto into structured statement body is forbidden (ISO 7185 6.8.2.4): label ${g.labelVal}`,
        )
      }
    }
  }

  // --------------------------------------------------------
  // ID 分配
  // --------------------------------------------------------

  private allocId(): number {
    return this.nextId_++
  }

  /** 记录 id 对应的可读名字（仅调试用） */
  private recordName(id: number, name: string): void {
    // 名字清理：只保留字母数字下划线，转小写
    const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
    if (cleaned) {
      this.idNames.set(id, cleaned)
    }
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
    if (!s) {
      throw new Error('Analyzer: no active scope')
    }
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
      if (v) {
        return v
      }
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
    kind: FuncKind,
    parentFuncId: number | null,
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
      hasBody: block !== null,
      kind,
    }
    this.funcInfos.set(funcId, info)
    if (parentFuncId !== null) {
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
        // 重复 label 声明检查（ISO 7185 6.2.2: 同一作用域内 label 唯一）
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
    // （指针类型的 domain-type 允许引用同一段中后定义的类型标识符）
    // 第一遍：注册所有类型名（placeholder，保持对象引用稳定）
    const typePlaceholders = new Map<string, TypeInfo>()
    for (const t of block.typeDeclarations) {
      const lower = t.name.name.toLowerCase()
      const placeholder: TypeInfo = { tag: 'unknown' }
      this.typeAliases.set(lower, placeholder)
      this.bind(t.name.name, { kind: 'type', typeInfo: placeholder })
      typePlaceholders.set(lower, placeholder)
    }
    // 第二遍：解析每个类型定义，回填到 placeholder（保持引用不变）
    for (const t of block.typeDeclarations) {
      const lower = t.name.name.toLowerCase()
      const info = this.resolveTypeInfo(t.typeDef)
      const placeholder = typePlaceholders.get(lower)!
      Object.assign(placeholder, info)
    }
    // 第三遍：指针类型重新解析 domainType（此时所有类型已定义）
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
        // 参数名与局部变量同名检查（ISO 7185 6.2.2: 同一作用域内标识符唯一）
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

    // PROCEDURE / FUNCTION — 两遍分析：
    // 第一遍：bind 所有 proc/func 名字（Pascal 中同 block 的兄弟函数互可见）
    // 第二遍：分析函数体（此时所有兄弟函数的名字都已绑定）
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

  private evalLiteral(node: ExpressionNode): { key: string; arg: string } | undefined {
    switch (node.kind) {
      case 'IntegerLiteral':
        return { key: 'i32', arg: node.raw }
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
      case 'i32':
        return { tag: 'i32' }
      case 'f64':
        return { tag: 'f64' }
      case 'bool':
        return { tag: 'bool' }
      case 'char':
        return { tag: 'char' }
      // key 'str' 是字符串字面量的编码层 key（非类型），
      // ISO 7185 中字符串字面量类型为 packed array[1..n] of char。
      // 此处返回长度未定的 char 数组占位（长度在 analyzeExpr 的 StringLiteral 分支按实际长度给出）。
      case 'str':
        return { tag: 'array', dims: [{ low: 1, high: 0 }], elem: { tag: 'char' } }
      default:
        return { tag: 'unknown' }
    }
  }

  // --------------------------------------------------------
  // 类型解析
  // --------------------------------------------------------

  private resolveTypeInfo(node: TypeNode): TypeInfo {
    const cached = this.typeNodeInfo.get(node)
    if (cached) {
      return cached
    }

    let info: TypeInfo
    switch (node.kind) {
      case 'SimpleType': {
        const name = node.name.name.toLowerCase()
        // 非标特性检查（AGENTS.md 原则 A.6）：string 类型未启用 extension 时报错
        if (name === 'string' && !this.extensions.has('string')) {
          throw new Error(
            `Non-standard type 'string' used without extension 'string' (ISO 7185 has no string type)`,
          )
        }
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
        let baseTag: TypeTag = 'i32'
        if (node.start.kind === 'CharLiteral' || node.end.kind === 'CharLiteral') {
          baseTag = 'char'
        } else if (node.start.kind === 'BooleanLiteral' || node.end.kind === 'BooleanLiteral') {
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
            if (name === 'char') {
              dims.push({ low: 0, high: 255 })
            } else if (name === 'boolean') {
              dims.push({ low: 0, high: 1 })
            } else if (name === 'integer') {
              dims.push({ low: 0, high: 2147483647 })
            } else {
              // 类型别名（可能是 subrange 或枚举）
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
        // 变体记录：构建变体树（保留分支/标签/嵌套结构，不再扁平化到 fields）
        const variant = node.variant ? this.buildVariantInfo(node.variant) : undefined
        info = { tag: 'rec', fields, variant }
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
        // 绑定枚举值（每个值是 i32 常量）
        for (let i = 0; i < node.values.length; i++) {
          this.bind(node.values[i].name, {
            kind: 'const',
            literal: { key: 'i32', arg: String(i) },
            typeInfo: { tag: 'i32' },
          })
        }
        break
      }
      case 'PointerType': {
        // ISO 7185 6.4.4: new-pointer-type = '↑' domain-type
        info = { tag: 'pointer', domainType: this.resolveTypeInfo(node.domainType) }
        break
      }
      default:
        info = { tag: 'unknown' }
    }

    this.typeNodeInfo.set(node, info)
    return info
  }

  /**
   * 递归构建变体部分信息树。
   * 保留 AST 的分支/标签/嵌套结构，供 runtime handler 使用：
   *   - 每个 case 标签求值为 ord（int/char/bool/enum），多标签共享分支
   *   - 每个分支可有多个字段声明（每个声明可有多个 names）
   *   - 分支内可嵌套变体（递归）
   */
  private buildVariantInfo(variant: RecordVariantPartNode): VariantPartInfo {
    const tagName = variant.tagName?.name.toLowerCase()
    const branches: VariantBranchInfo[] = variant.variants.map((v) => {
      // case 标签 → ord 值（多标签）
      const labels = v.caseLabels
        .map((lbl) => this.evalConstInt(lbl))
        .filter((x): x is number => x !== undefined)
      // 分支字段（多字段，每个声明可多 names）
      const fields = new Map<string, TypeInfo>()
      for (const f of v.fields) {
        const ti = this.resolveTypeInfo(f.type)
        for (const name of f.names) {
          fields.set(name.name.toLowerCase(), ti)
        }
      }
      // 嵌套变体
      const nested = v.variant ? this.buildVariantInfo(v.variant) : undefined
      return { labels, fields, nested }
    })
    return { tagName, branches }
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
        if (l === undefined || r === undefined) {
          return undefined
        }
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
        if (v === undefined) {
          return undefined
        }
        if (node.operator === '-') {
          return -v
        }
        return v
      }
      case 'Identifier': {
        const sym = this.lookup(node.name)
        if (sym?.kind === 'const' && sym.literal.key === 'i32') {
          return parseInt(sym.literal.arg, 10)
        }
        return undefined
      }
      default:
        return undefined
    }
  }

  private evalConstChar(node: ExpressionNode): string | undefined {
    if (node.kind === 'CharLiteral') {
      return node.value
    }
    if (node.kind === 'StringLiteral' && node.value.length === 1) {
      return node.value
    }
    return undefined
  }

  // --------------------------------------------------------
  // Goto 语义检查辅助
  // --------------------------------------------------------

  /** 沿 parentFuncId 链查找 label */
  private findLabel(
    funcId: number,
    labelVal: number,
  ): { labelId: number; funcId: number } | undefined {
    let fid: number | null = funcId
    while (fid !== null) {
      const funcLabels = this.labels.get(fid)
      if (funcLabels) {
        const info = funcLabels.get(labelVal)
        if (info) {
          return info
        }
      }
      const finfo = this.funcInfos.get(fid)
      fid = finfo ? finfo.parentFuncId : null
    }
    return undefined
  }

  /** 检查 ancestorFuncId 是否是 descFuncId 的祖先（含自身） */
  private isAncestorFunc(ancestorFuncId: number, descFuncId: number): boolean {
    let fid: number | null = descFuncId
    while (fid !== null) {
      if (fid === ancestorFuncId) {
        return true
      }
      const finfo = this.funcInfos.get(fid)
      fid = finfo ? finfo.parentFuncId : null
    }
    return false
  }

  // --------------------------------------------------------
  // 无定义引用检查（ISO 7185: 标识符须先声明后使用）
  //
  // 分析遍历阶段只收集（recordUndefinedRef），不在遍历中抛错；
  // 遍历结束后由独立的 checkUndefinedRefs() 一次性报告全部无定义引用。
  // --------------------------------------------------------

  /** 收集到的无定义引用（kind + 小写名 去重） */
  private undefinedRefs: { kind: 'procedure' | 'function' | 'identifier'; name: string }[] = []

  /** 记录一条无定义引用 */
  private recordUndefinedRef(
    kind: 'procedure' | 'function' | 'identifier',
    name: string,
  ): void {
    const lower = name.toLowerCase()
    if (!this.undefinedRefs.some((r) => r.kind === kind && r.name.toLowerCase() === lower)) {
      this.undefinedRefs.push({ kind, name })
    }
  }

  /** 独立检查阶段：一次性报告所有无定义引用 */
  private checkUndefinedRefs(): void {
    if (this.undefinedRefs.length === 0) {
      return
    }
    const lines = this.undefinedRefs.map((r) => {
      switch (r.kind) {
        case 'procedure':
          return `unknown procedure ${r.name}`
        case 'function':
          return `unknown function ${r.name}`
        case 'identifier':
          return `undefined identifier ${r.name}`
      }
    })
    throw new Error(`Undefined reference(s):\n${lines.join('\n')}`)
  }

  /** 是否额外 callable 注入的过程（AGENTS.md 原则 A.7） */
  private hasExtraProcedure(name: string): boolean {
    const e = this.extraCallables?.get(name.toLowerCase())
    return e?.kind === 'procedure'
  }

  /** 是否额外 callable 注入的函数（AGENTS.md 原则 A.7） */
  private hasExtraFunction(name: string): boolean {
    const e = this.extraCallables?.get(name.toLowerCase())
    return e?.kind === 'function'
  }

  /**
   * 把外部 extraCallables（key 可能任意大小写）归一为小写 key 的 Map，
   * 并与原生内建做冲突检查：同名原生且 allowOverrideNative=false → 抛错。
   * （AGENTS.md 原则 A.7 注入优先；A.6 非标默认报错。）
   */
  private mergeExtraCallables(
    extra: Record<string, ExtraCallable> | undefined,
  ): Map<string, ExtraCallable> | undefined {
    if (!extra) {
      return undefined
    }
    const map = new Map<string, ExtraCallable>()
    for (const [rawName, entry] of Object.entries(extra)) {
      const name = rawName.toLowerCase()
      if (map.has(name)) {
        throw new Error(`Duplicate extra callable '${rawName}' (case-insensitive collision)`)
      }
      const native = entry.kind === 'procedure' ? BUILTIN_PROCEDURES.has(name) : BUILTIN_FUNCTIONS.has(name)
      if (native && !entry.allowOverrideNative) {
        throw new Error(
          `Cannot override native ${entry.kind} '${rawName}'; set allowOverrideNative=true to override`,
        )
      }
      map.set(name, entry)
    }
    return map.size > 0 ? map : undefined
  }

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

    // 绑定函数名
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
    this.pushScope(funcId)
    this.analyzeParams(funcId, decl.parameters, false)
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
    this.pushScope(funcId)

    this.analyzeParams(funcId, decl.parameters, false)

    // retval 变量
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
    // 注意：不在内层作用域绑定函数名为 var（retval）。
    // 函数名在外层已绑定为 func，函数体内递归调用需要找到 func 符号。
    // compiler 在处理 funcName := expr 时通过 funcInfo(funcId).retval 获取 retval varId。

    this.analyzeBlock(decl.block, funcId)
    this.popScope()
  }

  private analyzeParams(
    funcId: number,
    params: ParameterDeclarationNode[],
    _nested: boolean,
  ): void {
    const info = this.funcInfos.get(funcId)!
    for (const p of params) {
      const ti = this.resolveTypeInfo(p.type)
      for (const name of p.names) {
        const varId = this.allocId()
        this.recordName(varId, name.name)
        const sym: VarSymbol = {
          kind: 'param',
          varId,
          typeInfo: ti,
          // ISO 7185: 文件类型本身就是引用语义（隐式按引用传递），
          // 不需要 cell 包装。文件变量赋值在 Pascal 中非法，
          // 所以无需通过 cell 支持写回。
          isVarParam: p.isVar && ti.tag !== 'file',
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
        for (const s of node.statements) {
          this.analyzeStatement(s)
        }
        return
      case 'Assignment': {
        const lt = this.analyzeExpr(node.left)
        const _rt = this.analyzeExpr(node.right)
        // 编译期 subrange 边界检查（ISO 7185 6.4.3.1）
        if (lt.tag === 'subrange' && lt.low !== undefined && lt.high !== undefined) {
          const constVal = this.evalConstInt(node.right)
          if (constVal !== undefined && (constVal < lt.low || constVal > lt.high)) {
            throw new Error(
              `Subrange assignment out of bounds: ${constVal} not in ${lt.low}..${lt.high}`,
            )
          }
          // char subrange 检查
          if (lt.baseTag === 'char') {
            const constChar = this.evalConstChar(node.right)
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
        // 延迟检查：goto 可能先于 label 出现，记录信息等 post-check 处理
        const labelVal = node.label.value
        const scope = this.currentScope()
        this.gotosToCheck.push({
          labelVal,
          fromDepth: this.nonTransparentDepth,
          fromFuncId: scope.funcId,
        })
        return
      }
      case 'LabeledStatement': {
        // 记录 label 出现的非透明块深度（用 labelId 作为 key，全局唯一）
        const lblVal = node.label.value
        const scope = this.currentScope()
        const labelInfo = this.findLabel(scope.funcId, lblVal)
        if (labelInfo) {
          // 重复 label 使用检查（ISO 7185 6.2.2: 同一 label 在代码中只能出现一次）
          if (this.usedLabels.has(labelInfo.labelId)) {
            throw new Error(`Duplicate label usage: ${lblVal}`)
          }
          this.usedLabels.add(labelInfo.labelId)
          this.labelDepth.set(labelInfo.labelId, this.nonTransparentDepth)
          // 记录使用位置 funcId（label 可能在祖先函数声明，但在本函数使用）
          this.labelUseFunc.set(labelInfo.labelId, scope.funcId)
        }
        this.analyzeStatement(node.statement)
        return
      }
      case 'WithStatement': {
        const temps: VarSymbol[] = []
        const newEntries: { fields: Map<string, TypeInfo> }[] = []
        for (const r of node.records) {
          const ti = this.analyzeExpr(r)
          const withId = this.allocId()
          this.recordName(withId, 'with_temp')
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
        const scope = this.currentScope()
        const info = this.funcInfos.get(scope.funcId)!
        info.locals.push(...temps)
        // 压入 withStack，供内层 with 表达式类型推断使用
        for (const e of newEntries) {
          this.withStack.push(e)
        }
        this.nonTransparentDepth++
        this.analyzeStatement(node.body)
        this.nonTransparentDepth--
        // 弹出 withStack
        for (let i = 0; i < newEntries.length; i++) {
          this.withStack.pop()
        }
        return
      }
      case 'ProcedureCall': {
        const sym = this.lookup(node.name.name)
        this.symbolCache.set(node.name, sym)
        // 过程调用无定义：收集（不在此抛错，统一在独立检查阶段报全部）
        if (
          !sym &&
          !BUILTIN_PROCEDURES.has(node.name.name.toLowerCase()) &&
          !this.hasExtraProcedure(node.name.name)
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
  // 表达式分析（推断类型 + 缓存 symbol）
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
        // ISO 7185：字符串字面量类型为 packed array[1..n] of char
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
        // 变量/无参函数引用无定义：收集（with 字段已在上方处理，内置无参标识符合法）
        if (!sym && !BUILTIN_IDENTIFIERS.has(node.name.toLowerCase())) {
          this.recordUndefinedRef('identifier', node.name)
        }
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
          } else if (lower === 'nil') {
            // ISO 7185 6.4.4: nil 是所有 pointer-type 的值
            info = { tag: 'pointer' }
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
          info = lt.tag === 'i32' ? { tag: 'i32' } : { tag: 'bool' }
        } else if (['=', '<>', '<', '<=', '>', '>='].includes(op)) {
          info = { tag: 'bool' }
        } else if (op === '/') {
          info = { tag: 'f64' }
        } else if (op === 'div' || op === 'mod') {
          info = { tag: 'i32' }
        } else {
          // + - *
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
        // 函数调用无定义：收集（不在此抛错，统一在独立检查阶段报全部）
        if (
          !sym &&
          !BUILTIN_FUNCTIONS.has(node.name.name.toLowerCase()) &&
          !this.hasExtraFunction(node.name.name)
        ) {
          this.recordUndefinedRef('function', node.name.name)
        }
        for (const a of node.arguments) {
          this.analyzeExpr(a)
        }
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
        // 编译期数组索引越界检查（ISO 7185 6.4.3.2）
        if (arrType.tag === 'array' && arrType.dims) {
          for (let i = 0; i < node.indices.length && i < arrType.dims.length; i++) {
            const constIdx = this.evalConstInt(node.indices[i])
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
        // 递归取元素类型
        info = this.arrayElemType(arrType, node.indices.length)
        break
      }

      case 'FieldAccess': {
        const objType = this.analyzeExpr(node.object)
        if (objType.tag === 'rec' && objType.fields) {
          info = objType.fields.get(node.field.name.toLowerCase()) ?? { tag: 'unknown' }
        } else if (node.field.name === '^' && objType.tag === 'pointer') {
          // ISO 7185 6.4.4 / 6.5.4: 指针解引用 p^ → 域类型
          info = objType.domainType ?? { tag: 'unknown' }
        } else if (node.field.name === '^' && objType.tag === 'file') {
          // 文件缓冲区访问 F^：返回文件元素类型（text 文件为 char）
          info = objType.elem ?? { tag: 'char' }
        } else {
          info = { tag: 'unknown' }
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
  // 冻结为只读 Analysis
  // --------------------------------------------------------

  private freeze(): Analysis {
    return {
      nextId: () => {
        return this.nextId_++
      },
      allocTempLocal: (funcId, typeInfo) => {
        const id = this.nextId_++
        const info = this.funcInfos.get(funcId)
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
      symbolOf: (node) => {
        return this.symbolCache.get(node)
      },
      labelInfo: (funcId, labelNum) => {
        let fid: number | null = funcId
        while (fid !== null) {
          const funcLabels = this.labels.get(fid)
          if (funcLabels) {
            const info = funcLabels.get(labelNum)
            if (info) {
              return info
            }
          }
          const finfo = this.funcInfos.get(fid)
          fid = finfo ? finfo.parentFuncId : null
        }
        return undefined
      },
      labelUseFuncOf: (labelId) => {
        return this.labelUseFunc.get(labelId)
      },
      funcOfBlock: (block) => {
        const r = this.blockFunc.get(block)
        if (r === undefined) {
          throw new Error('funcOfBlock: not found')
        }
        return r
      },
      funcOfDecl: (decl) => {
        const r = this.declFunc.get(decl)
        if (r === undefined) {
          throw new Error('funcOfDecl: not found')
        }
        return r
      },
      funcInfo: (id) => {
        const r = this.funcInfos.get(id)
        if (!r) {
          throw new Error('funcInfo: not found')
        }
        return r
      },
      withTempsOf: (node) => {
        return this.withTemps.get(node) ?? []
      },
      typeOf: (node) => {
        return this.exprType.get(node) ?? { tag: 'unknown' }
      },
      typeTagOfTypeNode: (node) => {
        return this.resolveTypeInfo(node)
      },
      evalConstInt: (node) => {
        return this.evalConstInt(node)
      },
      globalSymbolOf: (name) => {
        return this.globalBindings.get(name.toLowerCase())
      },
      debugNames: () => {
        return new Map(this.idNames)
      },
      extraCallables: () => {
        return this.extraCallables
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
  /** label 使用位置的 funcId（longJump 目标）。label 可能在祖先函数声明但在后代函数使用 */
  labelUseFuncOf(labelId: number): number | undefined
  funcOfBlock(block: BlockNode): number
  funcOfDecl(decl: ProcedureDeclarationNode | FunctionDeclarationNode): number
  funcInfo(funcId: number): FuncInfo
  withTempsOf(node: WithStatementNode): VarSymbol[]
  typeOf(node: ExpressionNode): TypeInfo
  typeTagOfTypeNode(node: TypeNode): TypeInfo
  evalConstInt(node: ExpressionNode): number | undefined
  globalSymbolOf(name: string): Symbol | undefined
  /** id → 可读名字映射（调试用，仅 json-code-compiler 读取） */
  debugNames(): Map<number, string>
  /** 额外 callable 注入表（小写名为 key；编译期用于查 syscall 名） */
  extraCallables(): Map<string, ExtraCallable> | undefined
}

// ============================================================
// 入口
// ============================================================

export function analyzeProgram(
  program: ProgramNode,
  extensions?: string[],
  extraCallables?: Record<string, ExtraCallable>,
): Analysis {
  return new Analyzer().analyze(program, extensions, extraCallables)
}
