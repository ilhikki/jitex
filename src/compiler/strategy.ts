import type {
  StatementNode,
  CompoundStatementNode,
  IntegerLiteralNode,
  LabeledStatementNode,
  CaseStatementNode,
  WithStatementNode,
} from '../ast/types'
import { Scope } from './emit/utils'
import type { Compiler } from './compiler'

function isTransparentBlock(stmt: StatementNode): boolean {
  return (
    stmt.kind === 'CompoundStatement' ||
    stmt.kind === 'CaseStatement' ||
    stmt.kind === 'WithStatement'
  )
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
    }
  }

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
    const cs = block as CaseStatementNode
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
    const ws = block as WithStatementNode
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

function getRemainingStatements(stmts: StatementNode[], startIndex: number): StatementNode[] {
  const result: StatementNode[] = []
  const firstStmt = stmts[startIndex] as LabeledStatementNode
  const ls = firstStmt

  if (isTransparentBlock(ls.statement)) {
    const innerStmts = flattenTransparentBlock(ls.statement)
    result.push(...innerStmts)
  } else {
    result.push(ls.statement)
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

function emitStateMachine(
  loopLabel: string,
  labelCases: Map<string, number>,
  fullStmts: StatementNode[],
  labelStmts: Map<string, StatementNode[]>,
  compiler: Compiler,
  scope: Scope,
  indent: number
): string {
  const pad = ' '.repeat(indent)
  const lines: string[] = []

  lines.push(`${pad}let __pc = 0`)
  lines.push(`${pad}${loopLabel}: while (true) {`)
  lines.push(
    `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`
  )
  lines.push(`${pad}  switch (__pc) {`)

  const savedLabelCases = compiler.labelCases
  const savedSwitchName = compiler.labelSwitchName
  const savedGotoMode = compiler.gotoMode
  const savedGotoLabel = compiler.gotoLabel

  compiler.labelCases = labelCases
  compiler.labelSwitchName = loopLabel
  compiler.gotoMode = null
  compiler.gotoLabel = null

  lines.push(`${pad}    case 0: {`)
  for (const stmt of fullStmts) {
    const code = compiler.emitStmt(stmt, scope, indent + 6)
    if (code) lines.push(code)
  }
  lines.push(`${pad}      __pc = -1; continue ${loopLabel};`)
  lines.push(`${pad}    }`)

  for (const [labelName, caseNum] of labelCases) {
    const stmts = labelStmts.get(labelName) || []
    lines.push(`${pad}    case ${caseNum}: {`)
    for (const stmt of stmts) {
      const code = compiler.emitStmt(stmt, scope, indent + 6)
      if (code) lines.push(code)
    }
    lines.push(`${pad}      __pc = -1; continue ${loopLabel};`)
    lines.push(`${pad}    }`)
  }

  lines.push(`${pad}    default: break ${loopLabel};`)
  lines.push(`${pad}  }`)
  lines.push(`${pad}}`)

  compiler.labelCases = savedLabelCases
  compiler.labelSwitchName = savedSwitchName
  compiler.gotoMode = savedGotoMode
  compiler.gotoLabel = savedGotoLabel

  return lines.join('\n')
}

export function emitBlockWithGoto(
  compound: CompoundStatementNode,
  scope: Scope,
  indent: number,
  labels: IntegerLiteralNode[],
  compiler: Compiler
): string {
  const labelInfo = collectLabelsFlat(compound.statements)

  const labelCases = new Map<string, number>()
  const labelStmts = new Map<string, StatementNode[]>()
  let caseNum = 1
  for (const label of labels) {
    const name = String(label.value)
    const info = labelInfo.get(name)
    if (info) {
      labelCases.set(name, caseNum)
      labelStmts.set(name, info.remaining)
      caseNum++
    }
  }

  return emitStateMachine(
    '__goto_loop',
    labelCases,
    compound.statements,
    labelStmts,
    compiler,
    scope,
    indent
  )
}
