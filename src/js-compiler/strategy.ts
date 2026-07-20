// Goto 编译策略

import type {
  AstNode,
  CompoundStatementNode,
  IntegerLiteralNode,
  LabeledStatementNode,
  GotoStatementNode,
  StatementNode,
} from '../ast/types'

// goto 静态分析结果
export interface LabelAnalysis {
  labels: Map<string, {
    index: number           // 在顶层 statements 中的位置
    hasGotoBefore: boolean  // 是否有 goto 在 label 之前（后向跳转）
    hasGotoAfter: boolean   // 是否有 goto 在 label 之后（前向跳转）
    inLoop: boolean         // label 是否在循环内
  }>
  gotos: Array<{
    target: string
    topIndex: number        // 所在顶层语句的索引
    loopDepth: number
    crossesLoop: boolean
  }>
  hasMultipleLabels: boolean
}

// 分析 compound 中的 label 和 goto（递归扫描，包括嵌套块）
export function analyzeLabels(compound: CompoundStatementNode, allLabels: IntegerLiteralNode[]): LabelAnalysis {
  const labels = new Map<string, { index: number; hasGotoBefore: boolean; hasGotoAfter: boolean; inLoop: boolean }>()
  const gotos: Array<{ target: string; topIndex: number; loopDepth: number; crossesLoop: boolean }> = []

  // 第一遍：扫描顶层 statements，收集 label 信息
  for (let i = 0; i < compound.statements.length; i++) {
    const s = compound.statements[i]
    if (s.kind === 'LabeledStatement') {
      const lblName = String(((s as LabeledStatementNode).label as any).value)
      labels.set(lblName, {
        index: i,
        hasGotoBefore: false,
        hasGotoAfter: false,
        inLoop: false,
      })
    }
  }

  // 第二遍：递归扫描所有语句，收集 goto 信息
  let topIndex = 0
  let loopDepth = 0

  function scanNode(node: AstNode, isTopLevel: boolean) {
    if (node.kind === 'WhileStatement' || node.kind === 'RepeatStatement' || node.kind === 'ForStatement') {
      loopDepth++
    }

    if (node.kind === 'GotoStatement') {
      const gs = node as GotoStatementNode
      const target = String((gs.label as any).value)
      const labelInfo = labels.get(target)
      const crossesLoop = labelInfo ? loopDepth > (labelInfo.inLoop ? 1 : 0) : false
      gotos.push({
        target,
        topIndex,
        loopDepth,
        crossesLoop,
      })
    }

    if (node.kind === 'LabeledStatement' && isTopLevel) {
      const lblName = String(((node as LabeledStatementNode).label as any).value)
      const lblInfo = labels.get(lblName)
      if (lblInfo) {
        lblInfo.inLoop = loopDepth > 0
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'kind') continue
      const child = (node as any)[key]
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && item.kind) {
              scanNode(item, false)
            }
          }
        } else if (child.kind) {
          scanNode(child, false)
        }
      }
    }

    if (node.kind === 'WhileStatement' || node.kind === 'RepeatStatement' || node.kind === 'ForStatement') {
      loopDepth--
    }
  }

  for (let i = 0; i < compound.statements.length; i++) {
    topIndex = i
    scanNode(compound.statements[i], true)
  }

  // 计算每个 label 的前向/后向信息
  for (const gotoInfo of gotos) {
    const labelInfo = labels.get(gotoInfo.target)
    if (labelInfo) {
      if (gotoInfo.topIndex < labelInfo.index) {
        labelInfo.hasGotoAfter = true
      } else if (gotoInfo.topIndex > labelInfo.index) {
        labelInfo.hasGotoBefore = true
      } else {
        labelInfo.hasGotoBefore = true
      }
    }
  }

  const hasMultipleLabels = labels.size > 1

  return { labels, gotos, hasMultipleLabels }
}
