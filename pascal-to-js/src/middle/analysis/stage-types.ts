/*
 * 对内：每个阶段的输入输出类型定义。
 * Pass 间数据传递的契约，不含实现逻辑。
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
import { AnalysisSymbol, ExtraCallable, FuncInfo, TypeInfo, VarSymbol } from './analysis-type.ts'

// ============================================================
// AnalysisContext — 只读配置（非可变 state）
// ============================================================

export class AnalysisContext {
  readonly extensions: Set<string>
  readonly extraCallables: Map<string, ExtraCallable> | undefined

  constructor(
    extensions?: string[],
    extraCallables?: Map<string, ExtraCallable> | undefined,
  ) {
    this.extensions = extensions ? new Set(extensions) : new Set()
    this.extraCallables = extraCallables
  }

  hasExtension(name: string): boolean {
    return this.extensions.has(name)
  }

  hasExtraProcedure(name: string): boolean {
    const e = this.extraCallables?.get(name.toLowerCase())
    return e?.kind === 'procedure'
  }

  hasExtraFunction(name: string): boolean {
    const e = this.extraCallables?.get(name.toLowerCase())
    return e?.kind === 'function'
  }
}

// ============================================================
// ScopeSnapshot — 作用域快照（Pass 1 建立可写，Pass 2 只读）
// ============================================================

export interface ScopeSnapshot {
  bindings: Map<string, AnalysisSymbol>
  funcId: number
  outer: ScopeSnapshot | undefined
}

// ============================================================
// DeclarationResult — Pass 1 输出
// ============================================================

export interface DeclarationResult {
  /** 函数信息表 */
  funcInfos: Map<number, FuncInfo>
  /** BlockNode → funcId */
  blockFunc: Map<BlockNode, number>
  /** Decl → funcId */
  declFunc: Map<ProcedureDeclarationNode | FunctionDeclarationNode, number>
  /** 每个 BlockNode 的作用域快照（含 outer 链） */
  blockScopes: Map<BlockNode, ScopeSnapshot>
  /** 类型别名（小写名 → TypeInfo） */
  typeAliases: Map<string, TypeInfo>
  /** TypeNode → TypeInfo 缓存 */
  typeNodeInfo: Map<TypeNode, TypeInfo>
  /** id → 可读名字（调试用） */
  idNames: Map<number, string>
  /** ID 计数器（可变，buildAnalysis 接管） */
  nextId: number
  /** FORWARD 声明的函数 */
  forwardFuncs: Map<string, number>
  /** 标号表：funcId → (labelVal → { labelId, funcId }) */
  labels: Map<number, Map<number, { labelId: number; funcId: number }>>
  /** 全局作用域 bindings */
  globalBindings: Map<string, AnalysisSymbol>
}

// ============================================================
// GotoRecord — Pass 2 收集的 goto 记录
// ============================================================

export interface GotoRecord {
  labelVal: number
  fromDepth: number
  fromFuncId: number
}

// ============================================================
// StatementResult — Pass 2 输出
// ============================================================

export interface StatementResult {
  /** 表达式 → 类型 */
  exprType: Map<ExpressionNode, TypeInfo>
  /** Identifier → 符号缓存 */
  symbolCache: Map<IdentifierNode, AnalysisSymbol | undefined>
  /** with 语句的临时变量 */
  withTemps: Map<WithStatementNode, VarSymbol[]>
  /** goto 记录（Pass 3 检查用） */
  gotoRecords: GotoRecord[]
  /** labelId → 出现的非透明块深度 */
  labelDepth: Map<number, number>
  /** labelId → 使用位置的 funcId */
  labelUseFunc: Map<number, number>
  /** 已使用的 label（检测重复使用） */
  usedLabels: Set<number>
  /** 无定义引用（Pass 3 检查用） */
  undefinedRefs: { kind: 'procedure' | 'function' | 'identifier'; name: string }[]
}
