import type {
  StatementNode,
  CompoundStatementNode,
} from '../ast/types'
import { Scope } from './emit/utils'
import type { Compiler } from './compiler'
import type { BlockLabelAnalysis } from './label-analysis'

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
  analysis: BlockLabelAnalysis,
  scope: Scope,
  indent: number,
  compiler: Compiler
): string {
  const declaredLabels = analysis.block.labelDeclarations?.labels ?? []
  const labelCases = new Map<string, number>()
  const labelStmts = new Map<string, StatementNode[]>()
  let caseNum = 1
  for (const label of declaredLabels) {
    const name = String(label.value)
    const info = analysis.labelInfo.get(name)
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
