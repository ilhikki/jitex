import type {
  BlockNode,
  CompoundStatementNode,
  GotoStatementNode,
  IntegerLiteralNode,
  LabeledStatementNode,
  ProgramNode,
  StatementNode,
} from '../ast/types'

/** ISO 7185 6.1.6: label 范围 0..9999 */
export const LABEL_MIN = 0
export const LABEL_MAX = 9999

export interface LabelInfo {
  stmt: LabeledStatementNode
  value: number
  /** 从该 label 语句体开始到块结束的所有语句 */
  remaining: StatementNode[]
}

export interface GotoInfo {
  stmt: GotoStatementNode
  target: number
}

/**
 * 跨 block goto 的目标信息：目标 label 在哪个 block 的状态机中、caseNum 是多少。
 */
export interface GotoTarget {
  /** 目标 label 所在 block 的 ID（用于生成 __pc_<blockId>） */
  blockId: number
  /** 目标 label 在该 block 状态机中的 case 编号 */
  caseNum: number
}

export interface BlockLabelAnalysis {
  block: BlockNode
  /** 每个 block 唯一 ID，用于生成 __pc_<id> 变量名 */
  blockId: number
  /** 该 block 的 pc 变量名（如 __pc_0） */
  pcVar: string
  /** 该 block 的 while 循环 JS 标签（如 __goto_loop_0） */
  loopLabel: string
  /**
   * 所在函数/过程 block 的 blockId。
   * 函数/过程 block = procedure-declaration/function-declaration 的 block，
   * 或 program block（顶层 block 也是函数 block）。
   * 用于判断 goto 是否"函数逃逸"：goto 所在 block 和 label 所在 block 的
   * functionBlockId 不同 = 跨函数逃逸。
   */
  functionBlockId: number
  declaredLabels: Set<number>
  /** 本块顶层 compound 直接包含的 label（含透明块内部） */
  labelInfo: Map<string, LabelInfo>
  gotos: GotoInfo[]
  gotoCount: number
  /**
   * 跨 block goto 目标表：name → {blockId, caseNum}
   * 包含自身 + 所有祖先的 label（自身优先遮蔽）
   */
  visibleGotoTargets: Map<string, GotoTarget>
  /**
   * 本 block 是否有"函数逃逸"goto（goto 目标在另一个函数/过程 block 中）。
   * 决定该 block 的状态机是否需要 try/catch 包裹。
   */
  hasFunctionEscapingGoto: boolean
  /**
   * 本 block 是否有"来自其他函数/过程"的 goto 目标（被外层函数逃逸）。
   * 决定本 block 状态机是否需要 try/catch 捕获函数逃逸。
   */
  needsTryCatch: boolean
  parent: BlockLabelAnalysis | null
  children: BlockLabelAnalysis[]
}

export interface LabelAnalysisResult {
  root: BlockLabelAnalysis
  blockMap: WeakMap<BlockNode, BlockLabelAnalysis>
}

// ---------------------------------------------------------------------------
// 透明块 / 非透明块
// ---------------------------------------------------------------------------

/**
 * 判断一个语句是否是"透明块"。
 *
 * 透明块是指其内部的 label 可以被外部直接引用的语句。
 * 在 label 分析中，透明块会被展开，其内部的 label 被视为所在外层 block 的 label。
 *
 * @param stmt 待判断的语句
 * @returns 如果是透明块（CompoundStatement/CaseStatement/WithStatement），返回 true
 */
function isTransparentBlock(stmt: StatementNode): boolean {
  return (
    stmt.kind === 'CompoundStatement' ||
    stmt.kind === 'CaseStatement' ||
    stmt.kind === 'WithStatement'
  )
}

/**
 * 把透明块递归展开成平铺语句列表。
 *
 * 对于 CompoundStatement，递归展开其内部的所有子语句；
 * 对于其他透明块（CaseStatement/WithStatement），返回自身（它们的内部结构由专门的函数处理）。
 *
 * @param block 待展开的透明块
 * @returns 展开后的语句列表
 */
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

// ---------------------------------------------------------------------------
// 收集 label 的 remaining 语句
// ---------------------------------------------------------------------------

/**
 * 获取从指定索引开始到块结束的所有剩余语句。
 *
 * 对于 LabeledStatement，会展开其内部的透明块；
 * 对于后续语句，也会展开透明块。
 *
 * @param stmts 语句列表
 * @param startIndex 起始索引（指向 LabeledStatement）
 * @returns 剩余语句列表
 */
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

// ---------------------------------------------------------------------------
// 收集 label
// ---------------------------------------------------------------------------

/**
 * 在平铺的语句列表中收集所有 label。
 *
 * 处理透明块（CompoundStatement/CaseStatement/WithStatement）和非透明块（If/While/Repeat/For）。
 * 对于透明块，递归展开并收集其内部的 label；
 * 对于非透明块，label 的 remaining 语句包含块内剩余语句 + 块外后续语句。
 *
 * @param stmts 语句列表
 * @returns label 名到 { stmt, remaining } 的映射
 */
export function collectLabelsFlat(
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

/**
 * 从非透明块中收集 label。
 *
 * 非透明块（If/While/Repeat/For）内部的 label 只能被块内的 goto 引用。
 * 递归遍历块内的所有语句，收集 label 及其直接的 remaining 语句。
 *
 * @param stmt 非透明块语句
 * @returns label 名到 { stmt, remaining } 的映射
 */
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

/**
 * 从透明块中收集 label。
 *
 * 透明块（CompoundStatement/CaseStatement/WithStatement）内部的 label 可以被外部 goto 引用。
 * 递归展开并收集其内部的 label。
 *
 * @param block 透明块语句
 * @returns label 名到 { stmt, remaining } 的映射
 */
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

// ---------------------------------------------------------------------------
// 收集 goto
// ---------------------------------------------------------------------------

/**
 * 在语句列表中收集所有 goto 语句。
 *
 * 递归遍历透明块内部的 goto 语句。
 *
 * @param stmts 语句列表
 * @returns GotoInfo 列表
 */
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

// ---------------------------------------------------------------------------
// 分析整个 block
// ---------------------------------------------------------------------------

// blockId 计数器（顶层调用前可重置）
let _blockIdCounter = 0

/**
 * 重置 blockId 计数器（在 analyzeLabels 入口处调用，确保每次编译从 0 开始）
 */
function resetBlockIdCounter(): void {
  _blockIdCounter = 0
}

/**
 * 分析单个 block 的 label 和 goto 信息。
 *
 * 递归处理子 block（函数/过程声明），收集本 block 的 label 和 goto，
 * 分配 blockId、pcVar、loopLabel，构建分析树结构。
 *
 * @param block 待分析的 block
 * @param parent 父 block 的分析结果（顶层 block 为 null）
 * @param blockMap BlockNode 到 BlockLabelAnalysis 的映射（用于快速查找）
 * @param isFunctionBlock 是否是函数/过程 block（决定 functionBlockId 的分配）
 * @returns 该 block 的分析结果
 */
function analyzeBlock(
  block: BlockNode,
  parent: BlockLabelAnalysis | null,
  blockMap: WeakMap<BlockNode, BlockLabelAnalysis>,
  isFunctionBlock: boolean
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

  // 分配 blockId 和对应的 pc 变量名 / loop 标签名
  const blockId = _blockIdCounter++
  const pcVar = `__pc_${blockId}`
  const loopLabel = `__goto_loop_${blockId}`

  // functionBlockId：自己如果是函数/过程 block，就是自己的 blockId；
  // 否则继承父 block 的 functionBlockId
  const functionBlockId = isFunctionBlock ? blockId : (parent?.functionBlockId ?? blockId)

  const analysis: BlockLabelAnalysis = {
    block,
    blockId,
    pcVar,
    loopLabel,
    functionBlockId,
    declaredLabels,
    labelInfo,
    gotos,
    gotoCount: gotos.length,
    visibleGotoTargets: new Map(),
    hasFunctionEscapingGoto: false,  // 第四遍填充
    needsTryCatch: false,  // 第四遍填充
    parent,
    children: [],
  }

  blockMap.set(block, analysis)

  // 先递归处理子 block（子 block 是函数/过程 block，isFunctionBlock=true）
  for (const proc of block.procedureDeclarations) {
    if (proc.block) {
      const child = analyzeBlock(proc.block, analysis, blockMap, true)
      analysis.children.push(child)
    }
  }
  for (const func of block.functionDeclarations) {
    if (func.block) {
      const child = analyzeBlock(func.block, analysis, blockMap, true)
      analysis.children.push(child)
    }
  }

  return analysis
}

/**
 * 分析整个程序的 label 和 goto 关系，构建完整的 label analysis 树。
 *
 * 执行四遍遍历：
 *
 * 第一遍（递归）：构建分析树结构
 * - 为每个 block 分配唯一的 blockId、pcVar、loopLabel
 * - 收集每个 block 的 declaredLabels、labelInfo、gotos
 * - 递归处理子 block（函数/过程声明）
 *
 * 第二遍：预计算每个 block 的 ownLabelCases
 * - 为每个 block 的声明 label 分配 case 编号（从 1 开始）
 * - 存储到 ownLabelCasesByBlock 供后续使用
 *
 * 第三遍：填充 visibleGotoTargets
 * - 每个 block 可见的 goto 目标 = 自身声明的 label + 所有祖先声明的 label
 * - 自身 label 优先遮蔽祖先同名 label
 *
 * 第四遍：标记函数逃逸和 try/catch 需求
 * - 函数逃逸：goto 所在 block 和目标 label 所在 block 的 functionBlockId 不同
 * - hasFunctionEscapingGoto：该 block 有 goto 跨函数/过程边界
 * - needsTryCatch：该 block 有 label 被其他函数/过程的 goto 引用
 *
 * @param program 程序根节点
 * @returns LabelAnalysisResult（包含分析树和 blockMap）
 */
export function analyzeLabels(program: ProgramNode): LabelAnalysisResult {
  resetBlockIdCounter()
  const blockMap = new WeakMap<BlockNode, BlockLabelAnalysis>()
  // program block 顶层是函数/过程 block
  const root = analyzeBlock(program.block, null, blockMap, true)

  // 第二遍：预计算每个 block 的 ownLabelCases（按声明顺序从 1 开始）
  // 并计算所有祖先的 ownLabelCases
  // 收集所有 block 的 ownLabelCases 到一个 Map<blockId, Map<labelName, caseNum>>
  const ownLabelCasesByBlock = new Map<number, Map<string, number>>()
  for (const [block, analysis] of iterateBlocks(root)) {
    const cases = new Map<string, number>()
    let cn = 1
    for (const lbl of analysis.declaredLabels) {
      cases.set(String(lbl), cn)
      cn++
    }
    ownLabelCasesByBlock.set(analysis.blockId, cases)
  }

  // 第三遍：为每个 block 的 visibleGotoTargets 填充完整信息
  for (const [block, analysis] of iterateBlocks(root)) {
    // 自身 label
    let cn = 1
    for (const lbl of analysis.declaredLabels) {
      analysis.visibleGotoTargets.set(String(lbl), { blockId: analysis.blockId, caseNum: cn })
      cn++
    }
    // 祖先 label（自身优先遮蔽）
    let p: BlockLabelAnalysis | null = analysis.parent
    while (p) {
      const parentCases = ownLabelCasesByBlock.get(p.blockId)!
      for (const lbl of p.declaredLabels) {
        const name = String(lbl)
        if (!analysis.visibleGotoTargets.has(name)) {
          analysis.visibleGotoTargets.set(name, { blockId: p.blockId, caseNum: parentCases.get(name)! })
        }
      }
      p = p.parent
    }
  }

  // 第四遍：标记函数逃逸和需要 try/catch 的 block
  // 函数逃逸 = goto 所在 block 的 functionBlockId 与目标 label 所在 block 的 functionBlockId 不同
  // 被函数逃逸到达 = 某个 block 的 label 被来自其他函数/过程 block 的 goto 引用
  for (const [block, analysis] of iterateBlocks(root)) {
    for (const g of analysis.gotos) {
      const target = analysis.visibleGotoTargets.get(String(g.target))
      if (!target) continue
      const targetAnalysis = findAnalysisById(root, target.blockId)
      if (!targetAnalysis) continue
      // 函数逃逸：源和目标在不同函数/过程 block
      if (analysis.functionBlockId !== targetAnalysis.functionBlockId) {
        analysis.hasFunctionEscapingGoto = true
        targetAnalysis.needsTryCatch = true
      }
    }
  }

  return { root, blockMap }
}

/**
 * 根据 blockId 在分析树中查找对应的 BlockLabelAnalysis。
 *
 * @param root 分析树根节点
 * @param blockId 目标 blockId
 * @returns 对应的分析结果，未找到返回 null
 */
function findAnalysisById(root: BlockLabelAnalysis, blockId: number): BlockLabelAnalysis | null {
  for (const a of iterateAnalysesAll(root)) {
    if (a.blockId === blockId) return a
  }
  return null
}

/**
 * 遍历所有 BlockLabelAnalysis（深度优先）。
 *
 * @param root 分析树根节点
 * @returns 迭代器，每次返回一个 BlockLabelAnalysis
 */
function* iterateAnalysesAll(root: BlockLabelAnalysis): Iterable<BlockLabelAnalysis> {
  const stack: BlockLabelAnalysis[] = [root]
  while (stack.length > 0) {
    const a = stack.pop()!
    yield a
    for (const child of a.children) {
      stack.push(child)
    }
  }
}

/**
 * 遍历所有 block（深度优先）。
 *
 * @param root 分析树根节点
 * @returns 迭代器，每次返回 [BlockNode, BlockLabelAnalysis] 对
 */
function* iterateBlocks(root: BlockLabelAnalysis): Iterable<[BlockNode, BlockLabelAnalysis]> {
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
 * 根据 BlockNode 获取其对应的 BlockLabelAnalysis。
 *
 * @param result LabelAnalysisResult（由 analyzeLabels 返回）
 * @param block 目标 BlockNode
 * @returns 对应的分析结果，未找到返回 undefined
 */
export function getAnalysisForBlock(
  result: LabelAnalysisResult,
  block: BlockNode
): BlockLabelAnalysis | undefined {
  return result.blockMap.get(block)
}

// ---------------------------------------------------------------------------
// 工具：递归查找语句中包含的 label 集合（用于判断 goto 目标是否在同一循环体内）
// ---------------------------------------------------------------------------

/**
 * 收集一个语句内部所有 LabeledStatement 的 label 值。
 *
 * 递归遍历 CompoundStatement、IfStatement、WhileStatement、ForStatement、
 * RepeatStatement、CaseStatement、WithStatement 的内部结构。
 *
 * @param stmt 待分析的语句
 * @returns label 值的集合（字符串形式）
 */
export function collectLabelValuesInStmt(stmt: StatementNode): Set<string> {
  const result = new Set<string>()
  const recurse = (s: StatementNode): void => {
    if (s.kind === 'LabeledStatement') {
      const ls = s as LabeledStatementNode
      result.add(String((ls.label as IntegerLiteralNode).value))
      recurse(ls.statement)
    } else if (s.kind === 'CompoundStatement') {
      for (const c of (s as CompoundStatementNode).statements) recurse(c)
    } else if (s.kind === 'IfStatement') {
      const is = s as any
      recurse(is.thenBranch)
      if (is.elseBranch) recurse(is.elseBranch)
    } else if (s.kind === 'WhileStatement' || s.kind === 'ForStatement') {
      recurse((s as any).body)
    } else if (s.kind === 'RepeatStatement') {
      for (const c of (s as any).statements) recurse(c)
    } else if (s.kind === 'CaseStatement') {
      const cs = s as any
      for (const b of cs.branches) recurse(b.statement)
      if (cs.otherwise) recurse(cs.otherwise)
    } else if (s.kind === 'WithStatement') {
      recurse((s as any).body)
    }
  }
  recurse(stmt)
  return result
}

/**
 * 收集一个语句内部所有 GotoStatement 的目标 label 值。
 *
 * 递归遍历 CompoundStatement、IfStatement、WhileStatement、ForStatement、
 * RepeatStatement、CaseStatement、WithStatement 的内部结构。
 *
 * @param stmt 待分析的语句
 * @returns goto 目标 label 值的集合（字符串形式）
 */
export function collectGotoTargetsInStmt(stmt: StatementNode): Set<string> {
  const result = new Set<string>()
  const recurse = (s: StatementNode): void => {
    if (s.kind === 'GotoStatement') {
      const gs = s as GotoStatementNode
      result.add(String((gs.label as IntegerLiteralNode).value))
    } else if (s.kind === 'LabeledStatement') {
      recurse((s as LabeledStatementNode).statement)
    } else if (s.kind === 'CompoundStatement') {
      for (const c of (s as CompoundStatementNode).statements) recurse(c)
    } else if (s.kind === 'IfStatement') {
      const is = s as any
      recurse(is.thenBranch)
      if (is.elseBranch) recurse(is.elseBranch)
    } else if (s.kind === 'WhileStatement' || s.kind === 'ForStatement') {
      recurse((s as any).body)
    } else if (s.kind === 'RepeatStatement') {
      for (const c of (s as any).statements) recurse(c)
    } else if (s.kind === 'CaseStatement') {
      const cs = s as any
      for (const b of cs.branches) recurse(b.statement)
      if (cs.otherwise) recurse(cs.otherwise)
    } else if (s.kind === 'WithStatement') {
      recurse((s as any).body)
    }
  }
  recurse(stmt)
  return result
}
