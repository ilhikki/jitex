/*
 * 对外输入输出：类型定义、Analysis 接口、常量表、公共工具函数。
 * 零依赖（除 frontend/node.ts），纯类型 + 纯函数。
 */

import {
  BlockNode,
  ExpressionNode,
  FunctionDeclarationNode,
  IdentifierNode,
  ProcedureDeclarationNode,
  TypeNode,
  WithStatementNode,
} from '@/frontend/node.ts'

// 类型系统

export type TypeTag =
  | 'integer'
  | 'real'
  | 'boolean'
  | 'char'
  | 'array'
  | 'record'
  | 'set'
  | 'file'
  | 'enum'
  | 'subrange'
  | 'pointer'
  | 'unknown'
  // 内部标记（非 ISO 类型）：过程形参。过程标识符不能出现在表达式中（ISO 6.6.3.4），
  // 此 tag 仅用于分析阶段明确该符号的语义，rewrite 阶段不会见到它。
  | 'procedure'

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

// 符号

export interface VarSymbol {
  kind: 'var' | 'param'
  varId: number
  typeInfo: TypeInfo
  isVarParam: boolean
  /**
   * ISO 7185 6.6.3.4/6.6.3.5：本形参为可调用形参（过程/函数作形式参数）。
   * 有值时该形参在其块内标识实参过程/函数，可作语句或 factor 调用。
   */
  callable?: CallableParamInfo
}

/** 可调用形参的签名信息（供调用解析与实参 congruity 校验） */
export interface CallableParamInfo {
  kind: 'procedure' | 'function'
  /** 形参自带的 formal-parameter-list 的签名（可为空） */
  params: CallableParamSig[]
  /** 仅 function：结果类型 */
  retTypeInfo?: TypeInfo
}

/** 形参自带形参表中单个形参段的签名（congruity 判定用，见 ISO 7185 6.6.3.6） */
export interface CallableParamSig {
  isVar: boolean
  typeInfo: TypeInfo
}

export interface FuncSymbol {
  kind: 'func'
  funcId: number
  retTypeInfo?: TypeInfo
}

/**
 * 字面量编码 + 其类型。
 *
 * key 只描述宿主表示（number / string / bytes / field …），
 * Pascal 类型由 typeInfo 单独携带，不从 key 反推。
 */
export interface LiteralValue {
  key: string
  arg: string
  typeInfo: TypeInfo
}

export interface ConstSymbol {
  kind: 'const'
  literal: LiteralValue
  typeInfo: TypeInfo
}

export interface TypeSymbol {
  kind: 'type'
  typeInfo: TypeInfo
}

export type AnalysisSymbol = VarSymbol | FuncSymbol | ConstSymbol | TypeSymbol

// 函数信息

/** 函数/过程/程序的分类，用于决定编译期与运行期的初始化策略 */
export type FuncKind = 'function' | 'procedure' | 'program'

export interface FuncInfo {
  funcId: number
  parentFuncId: number | undefined
  params: VarSymbol[]
  locals: VarSymbol[]
  retval?: VarSymbol
  children: number[]
  hasBody: boolean
  kind: FuncKind
}

// 额外 callable 注入

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

// 内置过程/函数名

/** 内置过程名（ISO 7185 6.6.5 标准过程 + runtime 扩展） */
export const BUILTIN_PROCEDURES = new Set([
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
  'pack',
  'unpack',
])

/** 内置函数名（ISO 7185 6.6.6 标准函数 + runtime 扩展） */
export const BUILTIN_FUNCTIONS = new Set([
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

/** 内置无参标识符（parser 将无参调用解析为 Identifier） */
export const BUILTIN_IDENTIFIERS = new Set(['maxint', 'nil', 'eof', 'eoln'])

// 简单类型表

export const SIMPLE_TYPES: Record<string, TypeInfo> = {
  integer: { tag: 'integer' },
  longint: { tag: 'integer' },
  shortint: { tag: 'integer' },
  byte: { tag: 'integer' },
  word: { tag: 'integer' },
  cardinal: { tag: 'integer' },
  real: { tag: 'real' },
  single: { tag: 'real' },
  double: { tag: 'real' },
  extended: { tag: 'real' },
  boolean: { tag: 'boolean' },
  char: { tag: 'char' },
  // string 是非标扩展（ISO 7185 无 string 类型，只有 packed array[1..n] of char）。
  // 启用 extension 'string' 时映射为 char 数组（长度不定，dims.high 用 0 占位）。
  string: { tag: 'array', dims: [{ low: 1, high: 0 }], elem: { tag: 'char' } },
  text: { tag: 'file', elem: { tag: 'char' } },
}

// 公共工具函数

/**
 * 编译期常量整数求值（用于 subrange 边界、数组索引、case 标签）。
 * 参数化 lookup，Pass 1 和 Pass 2 各传自己的作用域查询。
 */
export function evalConstInt(
  node: ExpressionNode,
  lookup: (name: string) => AnalysisSymbol | undefined,
): number | undefined {
  switch (node.kind) {
    case 'IntegerLiteral':
      return node.value
    case 'CharLiteral':
      return node.value.charCodeAt(0)
    case 'BooleanLiteral':
      return node.value ? 1 : 0
    case 'BinaryExpression': {
      const l = evalConstInt(node.left, lookup)
      const r = evalConstInt(node.right, lookup)
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
      const v = evalConstInt(node.operand, lookup)
      if (v === undefined) {
        return undefined
      }
      if (node.operator === '-') {
        return -v
      }
      return v
    }
    case 'Identifier': {
      const sym = lookup(node.name)
      if (sym?.kind === 'const' && sym.typeInfo.tag === 'integer') {
        return parseInt(sym.literal.arg, 10)
      }
      return undefined
    }
    default:
      return undefined
  }
}

/** 编译期常量字符求值 */
export function evalConstChar(node: ExpressionNode): string | undefined {
  if (node.kind === 'CharLiteral') {
    return node.value
  }
  if (node.kind === 'StringLiteral' && node.value.length === 1) {
    return node.value
  }
  return undefined
}

/** 字面量 → 编码 + 类型（const 声明用） */
export function evalLiteral(
  node: ExpressionNode,
): LiteralValue | undefined {
  switch (node.kind) {
    case 'IntegerLiteral':
      return { key: 'number', arg: node.raw, typeInfo: { tag: 'integer' } }
    case 'RealLiteral':
      return { key: 'number', arg: node.raw, typeInfo: { tag: 'real' } }
    case 'StringLiteral':
      // ISO 7185 6.1.7：string-literal 的类型是 packed array[1..n] of char
      return {
        key: 'string',
        arg: node.value,
        typeInfo: { tag: 'array', dims: [{ low: 1, high: 0 }], elem: { tag: 'char' } },
      }
    case 'CharLiteral':
      return { key: 'string', arg: node.value, typeInfo: { tag: 'char' } }
    case 'BooleanLiteral':
      // boolean 取序数值（ISO 6.4.2.2）：true → 1，false → 0
      return { key: 'number', arg: node.value ? '1' : '0', typeInfo: { tag: 'boolean' } }
    default:
      return undefined
  }
}

// Analysis — 编译阶段可见的只读接口

export interface Analysis {
  nextId(): number
  allocTempLocal(funcId: number, typeInfo: TypeInfo): number
  symbolOf(node: IdentifierNode): AnalysisSymbol | undefined
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
  globalSymbolOf(name: string): AnalysisSymbol | undefined
  /** id → 可读名字映射（调试用，仅 json-code-compiler 读取） */
  debugNames(): Map<number, string>
  /** 额外 callable 注入表（小写名为 key；编译期用于查 syscall 名） */
  extraCallables(): Map<string, ExtraCallable> | undefined
}
