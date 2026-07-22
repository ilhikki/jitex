import type {
  StatementNode,
  CompoundStatementNode,
} from '../ast/types'
import { Scope } from './emit/utils'
import type { Compiler, LoopContext } from './compiler'
import type { BlockLabelAnalysis } from './label-analysis'
import {
  collectLabelValuesInStmt,
  collectGotoTargetsInStmt,
} from './label-analysis'

/**
 * 分析一个循环体内有哪些 label 和 goto，决定是否需要内层状态机。
 *
 * 返回：
 * - needsInner: 循环体内是否有 goto 指向同循环体内的 label（需要内层状态机）
 * - innerLabels: 循环体内所有 label 值
 * - tailLabels: 在循环体末尾的 label 值（可用 continue 替代）
 * - gotosInBody: 循环体内所有 goto 目标
 */
interface LoopAnalysis {
  innerLabels: Set<string>
  tailLabels: Set<string>
  gotosInBody: Set<string>
  needsInner: boolean
}

function analyzeLoopBody(
  compiler: Compiler,
  body: StatementNode,
  allBodyStmts?: StatementNode[]
): LoopAnalysis {
  const innerLabels = collectLabelValuesInStmt(body)
  const gotosInBody = collectGotoTargetsInStmt(body)

  // 找出循环体末尾的 label
  const tailLabels = new Set<string>()
  const stmts = allBodyStmts ?? (body.kind === 'CompoundStatement'
    ? (body as CompoundStatementNode).statements
    : [body])

  // 从后往前找末尾的 label
  for (let i = stmts.length - 1; i >= 0; i--) {
    const s = stmts[i]
    if (s.kind === 'LabeledStatement') {
      const ls = s as any
      tailLabels.add(String(ls.label.value))
      // 继续看 LabeledStatement 的内部是否也是末尾 label
      // 但这里只看顶层：最后一个语句如果是 label，它就是末尾 label
    } else {
      break  // 遇到非 label 语句就停
    }
  }

  // 是否有 goto 指向同循环体内的 label？
  let needsInner = false
  if (compiler.labelCases) {
    for (const target of gotosInBody) {
      if (innerLabels.has(target)) {
        // 目标在同循环体内
        if (!tailLabels.has(target)) {
          // 不在末尾 → 需要内层状态机
          needsInner = true
          break
        }
        // 在末尾 → 用 continue 即可，不需要内层状态机
      }
    }
  }

  return { innerLabels, tailLabels, gotosInBody, needsInner }
}

/**
 * 发射内层状态机（用于循环体内有 goto 到同循环体内非末尾 label 的情况）
 *
 * 结构：
 * let __inner_pc = 0;
 * __inner_loop_N: while (true) {
 *   switch (__inner_pc) {
 *     case 0:  // 循环体的所有语句
 *     case 1:  // label X 的剩余代码
 *     case -1: break __inner_loop_N;
 *     default: throw ...;
 *   }
 * }
 */
let _innerLoopCounter = 0

function emitInnerStateMachine(
  body: StatementNode,
  bodyStmts: StatementNode[],
  innerLabelInfo: Map<string, { remaining: StatementNode[] }>,
  compiler: Compiler,
  scope: Scope,
  indent: number
): string {
  const pad = ' '.repeat(indent)
  const pcVar = `__inner_pc_${_innerLoopCounter}`
  const loopLabel = `__inner_loop_${_innerLoopCounter}`
  _innerLoopCounter++

  const labelCases = new Map<string, number>()
  const labelStmts = new Map<string, StatementNode[]>()
  let caseNum = 1
  for (const [name, info] of innerLabelInfo) {
    labelCases.set(name, caseNum)
    labelStmts.set(name, info.remaining)
    caseNum++
  }

  const lines: string[] = []
  lines.push(`${pad}let ${pcVar} = 0`)
  lines.push(`${pad}${loopLabel}: while (true) {`)
  lines.push(`${pad}  switch (${pcVar}) {`)

  // 保存并设置内层状态机上下文
  const savedLabelCases = compiler.labelCases
  const savedSwitchName = compiler.labelSwitchName
  const savedPcVar = compiler.currentPcVar
  const outerLabelCases = savedLabelCases
  const outerSwitchName = savedSwitchName

  // 合并内外层 labelCases，这样 goto 代码能同时查到内外层的 label
  const mergedCases = new Map<string, number>()
  for (const [k, v] of outerLabelCases ?? []) {
    mergedCases.set(k, v)
  }
  for (const [k, v] of labelCases) {
    mergedCases.set(k, v)
  }
  compiler.labelCases = mergedCases
  compiler.labelSwitchName = loopLabel
  compiler.currentPcVar = pcVar

  // case 0：循环体的所有语句
  lines.push(`${pad}    case 0: {`)
  for (const stmt of bodyStmts) {
    const code = compiler.emitStmt(stmt, scope, indent + 6)
    if (code) lines.push(code)
  }
  lines.push(`${pad}      ${pcVar} = -1; continue ${loopLabel};`)
  lines.push(`${pad}    }`)

  // case 1..n：内层 label 的剩余代码
  for (const [labelName, cn] of labelCases) {
    const stmts = labelStmts.get(labelName) || []
    lines.push(`${pad}    case ${cn}: {`)
    for (const stmt of stmts) {
      const code = compiler.emitStmt(stmt, scope, indent + 6)
      if (code) lines.push(code)
    }
    lines.push(`${pad}      ${pcVar} = -1; continue ${loopLabel};`)
    lines.push(`${pad}    }`)
  }

  // case -1：退出内层状态机
  lines.push(`${pad}    case -1: break ${loopLabel};`)
  // default：快速失败
  lines.push(`${pad}    default: throw new Error('JS VM: invalid ${pcVar} value ' + ${pcVar});`)

  lines.push(`${pad}  }`)
  lines.push(`${pad}}`)

  // 恢复外层上下文
  compiler.labelCases = outerLabelCases
  compiler.labelSwitchName = outerSwitchName
  compiler.currentPcVar = savedPcVar

  return lines.join('\n')
}

/**
 * 发射外层状态机
 *
 * __pc: while (true) {
 *   switch (__pc) {
 *     case 0:   // 入口：执行全部代码
 *     case 1:   // label X 的剩余代码
 *     case -1:  // 正常退出
 *     default:  // 快速失败
 *   }
 * }
 */
function emitStateMachine(
  pcVar: string,
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

  lines.push(`${pad}let ${pcVar} = 0`)
  lines.push(`${pad}${loopLabel}: while (true) {`)
  lines.push(
    `${pad}  if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`
  )
  lines.push(`${pad}  switch (${pcVar}) {`)

  const savedLabelCases = compiler.labelCases
  const savedSwitchName = compiler.labelSwitchName
  const savedPcVar = compiler.currentPcVar

  compiler.labelCases = labelCases
  compiler.labelSwitchName = loopLabel
  compiler.currentPcVar = pcVar

  // case 0：入口，执行所有语句
  lines.push(`${pad}    case 0: {`)
  for (const stmt of fullStmts) {
    const code = compiler.emitStmt(stmt, scope, indent + 6)
    if (code) lines.push(code)
  }
  lines.push(`${pad}      ${pcVar} = -1; continue ${loopLabel};`)
  lines.push(`${pad}    }`)

  // case 1..n：每个 label 的剩余代码
  for (const [labelName, caseNum] of labelCases) {
    const stmts = labelStmts.get(labelName) || []
    lines.push(`${pad}    case ${caseNum}: {`)
    for (const stmt of stmts) {
      const code = compiler.emitStmt(stmt, scope, indent + 6)
      if (code) lines.push(code)
    }
    lines.push(`${pad}      ${pcVar} = -1; continue ${loopLabel};`)
    lines.push(`${pad}    }`)
  }

  // case -1：正常退出
  lines.push(`${pad}    case -1: break ${loopLabel};`)

  // default：快速失败
  lines.push(`${pad}    default: throw new Error('JS VM: invalid ${pcVar} value ' + ${pcVar});`)

  lines.push(`${pad}  }`)
  lines.push(`${pad}}`)

  compiler.labelCases = savedLabelCases
  compiler.labelSwitchName = savedSwitchName
  compiler.currentPcVar = savedPcVar

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
    '__pc',
    '__goto_loop',
    labelCases,
    compound.statements,
    labelStmts,
    compiler,
    scope,
    indent
  )
}

// ---------------------------------------------------------------------------
// 循环辅助：判断循环体是否需要 JS label / 内层状态机
// ---------------------------------------------------------------------------

let _loopCounter = 0

export function nextLoopLabel(prefix: string): string {
  return `${prefix}_${_loopCounter++}`
}

/** 判断循环体是否与状态机有交互（包含 goto 或 label） */
export function loopNeedsLabel(compiler: Compiler, body: StatementNode): boolean {
  if (!compiler.labelCases) return false
  const gotos = collectGotoTargetsInStmt(body)
  const labels = collectLabelValuesInStmt(body)
  return gotos.size > 0 || labels.size > 0
}

/** 分析循环体，返回 LoopAnalysis */
export function getLoopAnalysis(
  compiler: Compiler,
  body: StatementNode,
  allBodyStmts?: StatementNode[]
): LoopAnalysis {
  return analyzeLoopBody(compiler, body, allBodyStmts)
}

/** 为循环体生成内层状态机 */
export function emitLoopInnerStateMachine(
  body: StatementNode,
  bodyStmts: StatementNode[],
  innerLabelInfo: Map<string, { remaining: StatementNode[] }>,
  compiler: Compiler,
  scope: Scope,
  indent: number
): string {
  return emitInnerStateMachine(body, bodyStmts, innerLabelInfo, compiler, scope, indent)
}
