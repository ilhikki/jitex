// Goto 编译策略
//
// 核心原则：
// - 透明块（CompoundStatement/CaseStatement/WithStatement）：不生成独立状态机，标签提升到外层
// - 不透明块（While/Repeat/For/If/函数体）：可生成独立状态机，内部跳转用 continue，跳到外层用 break
// - 所有 GOTO 都用 continue/break 实现，绝对禁用 throw

import type {
  StatementNode,
  CompoundStatementNode,
  IntegerLiteralNode,
  LabeledStatementNode,
  CaseStatementNode,
  WithStatementNode,
  IfStatementNode,
  WhileStatementNode,
  RepeatStatementNode,
  ForStatementNode,
} from '../ast/types'
import { Scope } from './item'
import type { Compiler } from './compiler'

// 判断是否为透明块（不生成独立状态机，标签可穿透）
// 透明块：CompoundStatement、CaseStatement、WithStatement
function isTransparentBlock(stmt: StatementNode): boolean {
  return (
    stmt.kind === 'CompoundStatement' ||
    stmt.kind === 'CaseStatement' ||
    stmt.kind === 'WithStatement'
  )
}

// 判断是否为不透明块（可生成独立状态机）
// 不透明块：IfStatement、WhileStatement、RepeatStatement、ForStatement
function isOpaqueBlock(stmt: StatementNode): boolean {
  return (
    stmt.kind === 'IfStatement' ||
    stmt.kind === 'WhileStatement' ||
    stmt.kind === 'RepeatStatement' ||
    stmt.kind === 'ForStatement'
  )
}

// 收集语句列表中所有的 label（穿透透明块）
// 返回 Map<labelName, {stmt, remainingStmts}>
//   - stmt: LabeledStatement 节点
//   - remainingStmts: 从该 label 开始的剩余语句列表（扁平的，穿透透明块）
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
    // 穿透透明块，收集内部的 label
    if (isTransparentBlock(stmt)) {
      const innerLabels = collectLabelsFromTransparentBlock(stmt)
      for (const [name, info] of innerLabels) {
        // 剩余语句 = 透明块内剩余 + 块外剩余
        const afterBlock = stmts.slice(i + 1)
        const fullRemaining = [...info.remaining, ...afterBlock]
        result.set(name, { stmt: info.stmt, remaining: fullRemaining })
      }
    }
  }

  return result
}

// 从透明块中收集 label（递归穿透）
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

// 从语句列表的某个索引开始，获取剩余语句（穿透透明块展开）
function getRemainingStatements(stmts: StatementNode[], startIndex: number): StatementNode[] {
  const result: StatementNode[] = []
  const firstStmt = stmts[startIndex]

  if (firstStmt.kind === 'LabeledStatement') {
    const ls = firstStmt as LabeledStatementNode
    // 如果内部是透明块，展开透明块内部的语句
    if (isTransparentBlock(ls.statement)) {
      const innerStmts = flattenTransparentBlock(ls.statement)
      result.push(...innerStmts)
    } else {
      result.push(ls.statement)
    }
  } else if (isTransparentBlock(firstStmt)) {
    const innerStmts = flattenTransparentBlock(firstStmt)
    result.push(...innerStmts)
  } else {
    result.push(firstStmt)
  }

  // 加上后面的语句
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

// 展开透明块为扁平的语句列表
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
  // CaseStatement 和 WithStatement 比较复杂，暂时不展开内部
  // 它们的内部 label 已经在 collectLabelsFlat 中处理了
  return [block]
}

// 检查不透明块内是否有 label（不穿透到透明块外）
function hasLabelsInOpaqueBlock(stmt: StatementNode): boolean {
  if (stmt.kind === 'WhileStatement') {
    const w = stmt as WhileStatementNode
    return hasLabelsInStatement(w.body)
  }
  if (stmt.kind === 'RepeatStatement') {
    const r = stmt as RepeatStatementNode
    for (const s of r.statements) {
      if (hasLabelsInStatement(s)) return true
    }
    return false
  }
  if (stmt.kind === 'ForStatement') {
    const f = stmt as ForStatementNode
    return hasLabelsInStatement(f.body)
  }
  if (stmt.kind === 'IfStatement') {
    const i = stmt as IfStatementNode
    if (hasLabelsInStatement(i.thenBranch)) return true
    if (i.elseBranch && hasLabelsInStatement(i.elseBranch)) return true
    return false
  }
  return false
}

function hasLabelsInStatement(stmt: StatementNode): boolean {
  if (stmt.kind === 'LabeledStatement') return true
  if (stmt.kind === 'CompoundStatement') {
    const cs = stmt as CompoundStatementNode
    for (const s of cs.statements) {
      if (hasLabelsInStatement(s)) return true
    }
    return false
  }
  if (isTransparentBlock(stmt)) {
    // 透明块内的 label 算外层的，不算不透明块内部的
    return false
  }
  if (isOpaqueBlock(stmt)) {
    // 嵌套的不透明块内的 label 算它自己的，不算当前层的
    return false
  }
  return false
}

// 生成状态机代码
//  - loopLabel: JS label 名，用于 break/continue
//  - labelCases: label -> caseNumber 映射
//  - fullStmts: 完整的语句列表（case 0 用）
//  - labelStmts: label -> 剩余语句列表（case N 用）
//  - compiler: 编译器实例，用于 emitStmt
//  - scope: 作用域
//  - indent: 缩进级别
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
  lines.push(`${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`)
  lines.push(`${pad}  switch (__pc) {`)

  // 保存 compiler 状态
  const savedLabelCases = compiler.labelCases
  const savedSwitchName = compiler.labelSwitchName
  const savedGotoMode = compiler.gotoMode
  const savedGotoLabel = compiler.gotoLabel

  compiler.labelCases = labelCases
  compiler.labelSwitchName = loopLabel
  compiler.gotoMode = null
  compiler.gotoLabel = null

  // case 0: 从开始执行
  lines.push(`${pad}    case 0: {`)
  for (const stmt of fullStmts) {
    const code = compiler.emitStmt(stmt, scope, indent + 6)
    if (code) lines.push(code)
  }
  lines.push(`${pad}      __pc = -1; continue ${loopLabel};`)
  lines.push(`${pad}    }`)

  // case N: 从每个 label 开始执行
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

  // 恢复 compiler 状态
  compiler.labelCases = savedLabelCases
  compiler.labelSwitchName = savedSwitchName
  compiler.gotoMode = savedGotoMode
  compiler.gotoLabel = savedGotoLabel

  return lines.join('\n')
}

// 主函数：为包含 goto 的块生成代码
export function emitBlockWithGoto(
  compound: CompoundStatementNode,
  scope: Scope,
  indent: number,
  labels: IntegerLiteralNode[],
  compiler: Compiler
): string {
  // 收集所有 label 及其剩余代码
  const labelInfo = collectLabelsFlat(compound.statements)

  // 构建 label -> caseNumber 映射
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

  // 生成状态机
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
