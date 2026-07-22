import type {
  BlockNode,
  CompoundStatementNode,
  GotoStatementNode,
  IntegerLiteralNode,
  LabeledStatementNode,
  ProgramNode,
  StatementNode,
} from '../ast/types'

export type GotoStrategy = 'simpleForward' | 'simpleBackward' | 'flagVariable' | 'stateMachine'

export interface LabelInfo {
  stmt: LabeledStatementNode
  value: number
  remaining: StatementNode[]
}

export interface GotoInfo {
  stmt: GotoStatementNode
  target: number
}

export interface BlockLabelAnalysis {
  block: BlockNode
  declaredLabels: Set<number>
  labelInfo: Map<string, LabelInfo>
  gotos: GotoInfo[]
  gotoCount: number
  strategy: GotoStrategy
  parent: BlockLabelAnalysis | null
  children: BlockLabelAnalysis[]
}

export interface LabelAnalysisResult {
  root: BlockLabelAnalysis
  blockMap: WeakMap<BlockNode, BlockLabelAnalysis>
}

function isTransparentBlock(stmt: StatementNode): boolean {
  return (
    stmt.kind === 'CompoundStatement' ||
    stmt.kind === 'CaseStatement' ||
    stmt.kind === 'WithStatement'
  )
}

function flattenTransparentBlock(block: StatementNode): StatementNode[] {
  if (block.kind === 'CompoundStatement') {
    const cs = block as CompoundStatementNode
    const result: StatementNode[] = []
    for (const s of cs.statements) {
      if (isTransparentBlock(s)) {
        result.push(...flattenTransparentBlock(s))
      } else {
        result.push(s)
      }
    }
    return result
  }
  return [block]
}

function getRemainingStatements(stmts: StatementNode[], startIndex: number): StatementNode[] {
  const result: StatementNode[] = []
  const firstStmt = stmts[startIndex] as LabeledStatementNode

  if (isTransparentBlock(firstStmt.statement)) {
    result.push(...flattenTransparentBlock(firstStmt.statement))
  } else {
    result.push(firstStmt.statement)
  }

  for (let i = startIndex + 1; i < stmts.length; i++) {
    const stmt = stmts[i]
    if (isTransparentBlock(stmt)) {
      result.push(...flattenTransparentBlock(stmt))
    } else {
      result.push(stmt)
    }
  }

  return result
}

function collectLabelsFlat(
  stmts: StatementNode[]
): Map<string, { stmt: LabeledStatementNode; remaining: StatementNode[] }> {
  const result = new Map<string, { stmt: LabeledStatementNode; remaining: StatementNode[] }>()

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]
    if (stmt.kind === 'LabeledStatement') {
      const ls = stmt as LabeledStatementNode
      const labelName = String((ls.label as IntegerLiteralNode).value)
      const remaining = getRemainingStatements(stmts, i)
      result.set(labelName, { stmt: ls, remaining })
    }
    if (isTransparentBlock(stmt)) {
      const innerLabels = collectLabelsFromTransparentBlock(stmt)
      for (const [name, info] of innerLabels) {
        const afterBlock = stmts.slice(i + 1)
        const fullRemaining = [...info.remaining, ...afterBlock]
        result.set(name, { stmt: info.stmt, remaining: fullRemaining })
      }
    } else if (stmt.kind === 'IfStatement') {
      const is = stmt as any
      const afterBlock = stmts.slice(i + 1)
      const thenLabels = collectLabelsFromNonTransparentBlock(is.thenBranch)
      for (const [name, info] of thenLabels) {
        const fullRemaining = [...info.remaining, ...afterBlock]
        result.set(name, { stmt: info.stmt, remaining: fullRemaining })
      }
      if (is.elseBranch) {
        const elseLabels = collectLabelsFromNonTransparentBlock(is.elseBranch)
        for (const [name, info] of elseLabels) {
          const fullRemaining = [...info.remaining, ...afterBlock]
          result.set(name, { stmt: info.stmt, remaining: fullRemaining })
        }
      }
    } else if (stmt.kind === 'WhileStatement') {
      const ws = stmt as any
      const afterBlock = stmts.slice(i + 1)
      const innerLabels = collectLabelsFromNonTransparentBlock(ws.body)
      for (const [name, info] of innerLabels) {
        const fullRemaining = [...info.remaining, ...afterBlock]
        result.set(name, { stmt: info.stmt, remaining: fullRemaining })
      }
    } else if (stmt.kind === 'RepeatStatement') {
      const rs = stmt as any
      const afterBlock = stmts.slice(i + 1)
      const innerLabels = collectLabelsFlat(rs.statements)
      for (const [name, info] of innerLabels) {
        const fullRemaining = [...info.remaining, ...afterBlock]
        result.set(name, { stmt: info.stmt, remaining: fullRemaining })
      }
    } else if (stmt.kind === 'ForStatement') {
      const fs = stmt as any
      const afterBlock = stmts.slice(i + 1)
      const innerLabels = collectLabelsFromNonTransparentBlock(fs.body)
      for (const [name, info] of innerLabels) {
        const fullRemaining = [...info.remaining, ...afterBlock]
        result.set(name, { stmt: info.stmt, remaining: fullRemaining })
      }
    }
  }

  return result
}

function collectLabelsFromNonTransparentBlock(
  stmt: StatementNode
): Map<string, { stmt: LabeledStatementNode; remaining: StatementNode[] }> {
  const result = new Map<string, { stmt: LabeledStatementNode; remaining: StatementNode[] }>()

  const recurse = (s: StatementNode): void => {
    if (s.kind === 'CompoundStatement') {
      const cs = s as CompoundStatementNode
      const innerLabels = collectLabelsFlat(cs.statements)
      for (const [name, info] of innerLabels) {
        result.set(name, info)
      }
    } else if (s.kind === 'LabeledStatement') {
      const ls = s as LabeledStatementNode
      const labelName = String((ls.label as IntegerLiteralNode).value)
      result.set(labelName, { stmt: ls, remaining: [ls.statement] })
    } else if (s.kind === 'IfStatement') {
      const is = s as any
      recurse(is.thenBranch)
      if (is.elseBranch) recurse(is.elseBranch)
    } else if (s.kind === 'WhileStatement' || s.kind === 'ForStatement') {
      recurse((s as any).body)
    } else if (s.kind === 'RepeatStatement') {
      for (const inner of (s as any).statements) recurse(inner)
    }
  }

  recurse(stmt)
  return result
}

function collectLabelsFromTransparentBlock(
  block: StatementNode
): Map<string, { stmt: LabeledStatementNode; remaining: StatementNode[] }> {
  const result = new Map<string, { stmt: LabeledStatementNode; remaining: StatementNode[] }>()

  if (block.kind === 'CompoundStatement') {
    const cs = block as CompoundStatementNode
    const innerLabels = collectLabelsFlat(cs.statements)
    for (const [name, info] of innerLabels) {
      result.set(name, info)
    }
  } else if (block.kind === 'CaseStatement') {
    const cs = block as any
    for (const branch of cs.branches) {
      if (isTransparentBlock(branch.statement)) {
        const innerLabels = collectLabelsFromTransparentBlock(branch.statement)
        for (const [name, info] of innerLabels) {
          result.set(name, info)
        }
      } else if (branch.statement.kind === 'LabeledStatement') {
        const ls = branch.statement as LabeledStatementNode
        const labelName = String((ls.label as IntegerLiteralNode).value)
        result.set(labelName, { stmt: ls, remaining: [ls.statement] })
      }
    }
    if (cs.otherwise && isTransparentBlock(cs.otherwise)) {
      const innerLabels = collectLabelsFromTransparentBlock(cs.otherwise)
      for (const [name, info] of innerLabels) {
        result.set(name, info)
      }
    }
  } else if (block.kind === 'WithStatement') {
    const ws = block as any
    if (isTransparentBlock(ws.body)) {
      const innerLabels = collectLabelsFromTransparentBlock(ws.body)
      for (const [name, info] of innerLabels) {
        result.set(name, info)
      }
    } else if (ws.body.kind === 'LabeledStatement') {
      const ls = ws.body as LabeledStatementNode
      const labelName = String((ls.label as IntegerLiteralNode).value)
      result.set(labelName, { stmt: ls, remaining: [ls.statement] })
    }
  }

  return result
}

function collectGotos(stmts: StatementNode[]): GotoInfo[] {
  const result: GotoInfo[] = []
  for (const stmt of stmts) {
    if (stmt.kind === 'GotoStatement') {
      const gs = stmt as GotoStatementNode
      result.push({ stmt: gs, target: (gs.label as IntegerLiteralNode).value })
    }
    if (isTransparentBlock(stmt)) {
      const innerStmts = flattenTransparentBlock(stmt)
      for (const inner of innerStmts) {
        if (inner.kind === 'GotoStatement') {
          const gs = inner as GotoStatementNode
          result.push({ stmt: gs, target: (gs.label as IntegerLiteralNode).value })
        }
      }
    }
  }
  return result
}

function determineStrategy(
  stmts: StatementNode[],
  labelInfo: Map<string, LabelInfo>,
  gotoCount: number
): GotoStrategy {
  const labelCount = labelInfo.size

  if (labelCount === 0) return 'simpleForward'

  const flatStmts = flattenTransparentBlock({
    kind: 'CompoundStatement',
    statements: stmts,
  } as CompoundStatementNode)

  if (labelCount === 1 && gotoCount <= 2) {
    const [name, info] = [...labelInfo.entries()][0]
    let isInTransparentBlock = false

    for (let i = 0; i < stmts.length; i++) {
      const stmt = stmts[i]
      if (stmt === info.stmt) {
        isInTransparentBlock = false
      } else if (isTransparentBlock(stmt)) {
        const innerStmts = flattenTransparentBlock(stmt)
        if (innerStmts.includes(info.stmt)) {
          isInTransparentBlock = true
        }
      }
    }

    if (!isInTransparentBlock) {
      let hasForwardGoto = false
      let hasBackwardGoto = false

      const targetIndex = flatStmts.findIndex(
        (ss) => ss === info.stmt
      )

      for (const s of flatStmts) {
        if (s.kind === 'GotoStatement') {
          const gs = s as GotoStatementNode
          const target = String((gs.label as any).value)
          if (target === name) {
            const gotoIndex = flatStmts.indexOf(s)
            if (gotoIndex < targetIndex) {
              hasBackwardGoto = true
            } else {
              hasForwardGoto = true
            }
          }
        }
      }

      if (hasForwardGoto && !hasBackwardGoto) return 'simpleForward'
      if (hasBackwardGoto && !hasForwardGoto) return 'simpleBackward'
      return 'flagVariable'
    }
  }

  return 'stateMachine'
}

function analyzeBlock(
  block: BlockNode,
  parent: BlockLabelAnalysis | null,
  blockMap: WeakMap<BlockNode, BlockLabelAnalysis>
): BlockLabelAnalysis {
  const declaredLabels = new Set<number>()
  if (block.labelDeclarations) {
    for (const l of block.labelDeclarations.labels) {
      declaredLabels.add(l.value)
    }
  }

  const rawLabelInfo = collectLabelsFlat(block.compound.statements)
  const labelInfo = new Map<string, LabelInfo>()
  for (const [name, info] of rawLabelInfo) {
    const value = Number(name)
    labelInfo.set(name, {
      stmt: info.stmt,
      value,
      remaining: info.remaining,
    })
  }

  const gotos = collectGotos(block.compound.statements)
  const strategy = determineStrategy(block.compound.statements, labelInfo, gotos.length)

  const analysis: BlockLabelAnalysis = {
    block,
    declaredLabels,
    labelInfo,
    gotos,
    gotoCount: gotos.length,
    strategy,
    parent,
    children: [],
  }

  blockMap.set(block, analysis)

  for (const proc of block.procedureDeclarations) {
    if (proc.block) {
      const child = analyzeBlock(proc.block, analysis, blockMap)
      analysis.children.push(child)
    }
  }
  for (const func of block.functionDeclarations) {
    if (func.block) {
      const child = analyzeBlock(func.block, analysis, blockMap)
      analysis.children.push(child)
    }
  }

  return analysis
}

export function analyzeLabels(program: ProgramNode): LabelAnalysisResult {
  const blockMap = new WeakMap<BlockNode, BlockLabelAnalysis>()
  const root = analyzeBlock(program.block, null, blockMap)
  return { root, blockMap }
}

export function getAnalysisForBlock(
  result: LabelAnalysisResult,
  block: BlockNode
): BlockLabelAnalysis | undefined {
  return result.blockMap.get(block)
}
