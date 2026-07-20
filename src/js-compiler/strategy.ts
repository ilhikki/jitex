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
  labels: Map<
    string,
    {
      index: number // 在顶层 statements 中的位置
      hasGotoBefore: boolean // 是否有 goto 在 label 之前（后向跳转）
      hasGotoAfter: boolean // 是否有 goto 在 label 之后（前向跳转）
      inLoop: boolean // label 是否在循环内
      isTopLevel: boolean // label 是否在 compound 顶层
    }
  >
  gotos: Array<{
    target: string
    topIndex: number // 所在顶层语句的索引
    loopDepth: number
    crossesLoop: boolean
  }>
  hasMultipleLabels: boolean
}

// 分析 compound 中的 label 和 goto（递归扫描，包括嵌套块）
export function analyzeLabels(
  compound: CompoundStatementNode,
  allLabels: IntegerLiteralNode[]
): LabelAnalysis {
  const labels = new Map<
    string,
    {
      index: number
      hasGotoBefore: boolean
      hasGotoAfter: boolean
      inLoop: boolean
      isTopLevel: boolean
    }
  >()
  const gotos: Array<{
    target: string
    topIndex: number
    loopDepth: number
    crossesLoop: boolean
  }> = []

  // 用 allLabels 初始化 labels map（所有声明的 label 都要考虑）
  for (const l of allLabels) {
    const lblName = String((l as any).value)
    labels.set(lblName, {
      index: -1,
      hasGotoBefore: false,
      hasGotoAfter: false,
      inLoop: false,
      isTopLevel: false,
    })
  }

  // 递归扫描所有语句，收集 label 和 goto 信息
  let topIndex = 0
  let loopDepth = 0
  let foundLabelAtTop: string[] = []

  function scanNode(node: AstNode, isTopLevel: boolean) {
    if (
      node.kind === 'WhileStatement' ||
      node.kind === 'RepeatStatement' ||
      node.kind === 'ForStatement'
    ) {
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

    if (node.kind === 'LabeledStatement') {
      const lblName = String(((node as LabeledStatementNode).label as any).value)
      const lblInfo = labels.get(lblName)
      if (lblInfo) {
        if (lblInfo.index === -1) {
          lblInfo.index = topIndex
        }
        lblInfo.inLoop = lblInfo.inLoop || loopDepth > 0
        if (isTopLevel) {
          lblInfo.isTopLevel = true
        }
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

    if (
      node.kind === 'WhileStatement' ||
      node.kind === 'RepeatStatement' ||
      node.kind === 'ForStatement'
    ) {
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
    if (labelInfo && labelInfo.index !== -1) {
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
