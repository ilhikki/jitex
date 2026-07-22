import type {
  StatementNode,
  CompoundStatementNode,
  BlockNode,
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

/**
 * 分析循环体内的 label 和 goto，决定是否需要内层状态机。
 *
 * @param compiler 编译器实例
 * @param body 循环体语句（可能是单个语句或 CompoundStatement）
 * @param allBodyStmts 可选的已展开的循环体语句列表（用于正确识别末尾 label）
 * @returns LoopAnalysis 分析结果
 */
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
 *
 * @param body 循环体语句（原始 AST 节点）
 * @param bodyStmts 展开后的循环体语句列表
 * @param innerLabelInfo 内层 label 信息映射（label 名 -> { remaining 语句 }）
 * @param compiler 编译器实例
 * @param scope 当前作用域
 * @param indent 当前缩进级别
 * @returns 生成的 JS 代码字符串
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
 * 结构：
 * let __pc_N = 0;
 * __goto_loop_N: while (true) {
 *   switch (__pc_N) {
 *     case 0:   // 入口：执行全部代码
 *     case 1:   // label X 的剩余代码
 *     case -1:  // 正常退出
 *     default:  // 快速失败
 *   }
 * }
 *
 * 当该 block 需要处理跨函数 goto 时，会在外层包裹 try/catch。
 *
 * @param pcVar 程序计数器变量名（如 __pc_0）
 * @param loopLabel while 循环的 JS label（如 __goto_loop_0）
 * @param labelCases label 名到 case 编号的映射
 * @param fullStmts block 顶层 compound 的所有语句
 * @param labelStmts 每个 label 的剩余语句映射
 * @param compiler 编译器实例
 * @param scope 当前作用域
 * @param indent 当前缩进级别
 * @returns 生成的 JS 代码字符串
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

  // 判断本 block 状态机是否需要 try/catch 包裹
  // 条件：本 block 的某个 label 被来自其他函数/过程的 goto 引用（needsTryCatch）
  let needsTryCatch = false
  if (compiler.labelAnalysis) {
    for (const [, a] of iterateAnalyses(compiler.labelAnalysis.root)) {
      if (a.pcVar === pcVar && a.needsTryCatch) {
        needsTryCatch = true
        break
      }
    }
  }

  lines.push(`${pad}let ${pcVar} = 0`)
  lines.push(`${pad}${loopLabel}: while (true) {`)

  // try/catch 必须放在状态机循环里面、switch 外面（用户要求）
  // 仅在该 block 有来自其他函数/过程的 goto 目标时添加
  if (needsTryCatch) {
    lines.push(`${pad}  try {`)
  }

  const padSwitch = needsTryCatch ? `${pad}    ` : `${pad}  `
  lines.push(`${padSwitch}if (++ctx.steps > ctx.maxSteps) { throw new Error('JS VM: step limit exceeded') }`)
  lines.push(`${padSwitch}switch (${pcVar}) {`)

  const savedLabelCases = compiler.labelCases
  const savedSwitchName = compiler.labelSwitchName
  const savedPcVar = compiler.currentPcVar
  const savedBlockAnalysis: BlockLabelAnalysis | null = compiler.currentBlockAnalysis

  // 查找对应的 analysis
  let activeBlockAnalysis: BlockLabelAnalysis | null = null
  if (compiler.labelAnalysis) {
    for (const [, a] of iterateAnalyses(compiler.labelAnalysis.root)) {
      if (a.pcVar === pcVar) {
        activeBlockAnalysis = a
        break
      }
    }
  }
  compiler.currentBlockAnalysis = activeBlockAnalysis
  compiler.labelCases = labelCases
  compiler.labelSwitchName = loopLabel
  compiler.currentPcVar = pcVar

  const padCase = needsTryCatch ? `${pad}      ` : `${pad}    `

  // case 0：入口，执行所有语句
  lines.push(`${padCase}case 0: {`)
  for (const stmt of fullStmts) {
    const code = compiler.emitStmt(stmt, scope, indent + (needsTryCatch ? 8 : 6))
    if (code) lines.push(code)
  }
  lines.push(`${padCase}  ${pcVar} = -1; continue ${loopLabel};`)
  lines.push(`${padCase}}`)

  // case 1..n：每个 label 的剩余代码
  for (const [labelName, caseNum] of labelCases) {
    const stmts = labelStmts.get(labelName) || []
    lines.push(`${padCase}case ${caseNum}: {`)
    for (const stmt of stmts) {
      const code = compiler.emitStmt(stmt, scope, indent + (needsTryCatch ? 8 : 6))
      if (code) lines.push(code)
    }
    lines.push(`${padCase}  ${pcVar} = -1; continue ${loopLabel};`)
    lines.push(`${padCase}}`)
  }

  // case -1：正常退出
  lines.push(`${padCase}case -1: break ${loopLabel};`)

  // default：快速失败
  lines.push(`${padCase}default: throw new Error('JS VM: invalid ${pcVar} value ' + ${pcVar});`)

  lines.push(`${padSwitch}}`)

  if (needsTryCatch) {
    // catch：处理 __GotoSignal 异常
    // 只接受目标是当前状态机（targetPc === pcVar）的信号；
    // 其他 __GotoSignal（如从更内层函数 throw 上来但目标是其他 block）重新抛出
    lines.push(`${pad}  } catch (__e) {`)
    lines.push(`${pad}    if (__e instanceof __GotoSignal && __e.targetPc === ${JSON.stringify(pcVar)}) {`)
    lines.push(`${pad}      ${pcVar} = __e.targetCase; continue ${loopLabel};`)
    lines.push(`${pad}    }`)
    lines.push(`${pad}    throw __e;`)
    lines.push(`${pad}  }`)
  }

  lines.push(`${pad}}`)

  compiler.labelCases = savedLabelCases
  compiler.labelSwitchName = savedSwitchName
  compiler.currentPcVar = savedPcVar
  compiler.currentBlockAnalysis = savedBlockAnalysis

  return lines.join('\n')
}

/**
 * 遍历所有 block analysis（深度优先）
 *
 * @param root 根 block 的 label analysis
 * @returns 迭代器，每次返回 [BlockNode, BlockLabelAnalysis] 对
 */
function* iterateAnalyses(root: BlockLabelAnalysis): Iterable<[BlockNode, BlockLabelAnalysis]> {
  const stack: BlockLabelAnalysis[] = [root]
  while (stack.length > 0) {
    const a = stack.pop()!
    yield [a.block, a]
    for (const child of a.children) {
      stack.push(child)
    }
  }
}

/**
 * 为包含 goto/label 的 block 发射状态机代码。
 *
 * 根据 label analysis 结果，为每个声明的 label 生成对应的 case，
 * 并调用 emitStateMachine 生成完整的状态机结构。
 *
 * @param compound block 的顶层 compound 语句
 * @param analysis 该 block 的 label analysis 结果
 * @param scope 当前作用域
 * @param indent 当前缩进级别
 * @param compiler 编译器实例
 * @returns 生成的 JS 状态机代码字符串
 */
export function emitBlockWithGoto(
  compound: CompoundStatementNode,
  analysis: BlockLabelAnalysis,
  scope: Scope,
  indent: number,
  compiler: Compiler
): string {
  // 只为本 block 自己的 declared label 生成 case。
  // 跨 block goto 在 GotoStatement 编译时通过 visibleGotoTargets 处理。
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
    analysis.pcVar,
    analysis.loopLabel,
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

/** 循环计数器，用于生成唯一的循环 JS label */
let _loopCounter = 0

/**
 * 生成下一个唯一的循环 JS label。
 *
 * @param prefix 前缀（如 '__for_loop'）
 * @returns 带计数器的唯一 label（如 '__for_loop_0'）
 */
export function nextLoopLabel(prefix: string): string {
  return `${prefix}_${_loopCounter++}`
}

/**
 * 判断循环体是否与状态机有交互（包含 goto 或 label）。
 *
 * 如果循环体包含任何 goto 语句或 label 语句，则需要特殊处理（如添加 JS label、内层状态机）。
 *
 * @param compiler 编译器实例
 * @param body 循环体语句
 * @returns 如果循环体包含 goto 或 label，返回 true
 */
export function loopNeedsLabel(compiler: Compiler, body: StatementNode): boolean {
  if (!compiler.labelCases) return false
  const gotos = collectGotoTargetsInStmt(body)
  const labels = collectLabelValuesInStmt(body)
  return gotos.size > 0 || labels.size > 0
}

/**
 * 分析循环体，返回 LoopAnalysis 结果。
 *
 * 封装了内部函数 analyzeLoopBody，提供公共接口。
 *
 * @param compiler 编译器实例
 * @param body 循环体语句（可能是单个语句或 CompoundStatement）
 * @param allBodyStmts 可选的已展开的循环体语句列表
 * @returns LoopAnalysis 分析结果
 */
export function getLoopAnalysis(
  compiler: Compiler,
  body: StatementNode,
  allBodyStmts?: StatementNode[]
): LoopAnalysis {
  return analyzeLoopBody(compiler, body, allBodyStmts)
}

/**
 * 为循环体生成内层状态机代码。
 *
 * 当循环体内有 goto 指向同循环体内非末尾 label 时，需要生成内层状态机。
 * 封装了内部函数 emitInnerStateMachine，提供公共接口。
 *
 * @param body 循环体语句（原始 AST 节点）
 * @param bodyStmts 展开后的循环体语句列表
 * @param innerLabelInfo 内层 label 信息映射（label 名 -> { remaining 语句 }）
 * @param compiler 编译器实例
 * @param scope 当前作用域
 * @param indent 当前缩进级别
 * @returns 生成的 JS 状态机代码字符串
 */
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
