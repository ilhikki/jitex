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

export class AnalysisContext {
  readonly extraCallables: Map<string, ExtraCallable> | undefined

  constructor(extraCallables?: Map<string, ExtraCallable> | undefined) {
    this.extraCallables = extraCallables
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

export interface ScopeSnapshot {
  bindings: Map<string, AnalysisSymbol>
  funcId: number
  outer: ScopeSnapshot | undefined
}

export interface DeclarationResult {
  funcInfos: Map<number, FuncInfo>

  blockFunc: Map<BlockNode, number>

  declFunc: Map<ProcedureDeclarationNode | FunctionDeclarationNode, number>

  blockScopes: Map<BlockNode, ScopeSnapshot>

  typeAliases: Map<string, TypeInfo>

  typeNodeInfo: Map<TypeNode, TypeInfo>

  idNames: Map<number, string>

  nextId: number

  forwardFuncs: Map<string, number>

  labels: Map<number, Map<number, { labelId: number; funcId: number }>>

  globalBindings: Map<string, AnalysisSymbol>
}

export interface GotoRecord {
  labelVal: number
  fromDepth: number
  fromFuncId: number
}

export interface StatementResult {
  exprType: Map<ExpressionNode, TypeInfo>

  symbolCache: Map<IdentifierNode, AnalysisSymbol | undefined>

  withTemps: Map<WithStatementNode, VarSymbol[]>

  gotoRecords: GotoRecord[]

  labelDepth: Map<number, number>

  labelUseFunc: Map<number, number>

  usedLabels: Set<number>

  undefinedRefs: { kind: 'procedure' | 'function' | 'identifier'; name: string }[]
}
