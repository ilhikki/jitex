// SourceMap: AST ↔ 源码行号双向映射
// 通过遍历 AST 收集所有含 raw: Token 的叶子节点，建立映射关系

import type {
  AstNode,
  ArrayAccessNode,
  ArrayTypeNode,
  AssignmentNode,
  BinaryExpressionNode,
  BlockNode,
  BooleanLiteralNode,
  CaseBranchNode,
  CaseStatementNode,
  CharLiteralNode,
  CompoundStatementNode,
  ConstDeclarationNode,
  EnumerationTypeNode,
  ExpressionNode,
  FieldAccessNode,
  FileTypeNode,
  ForStatementNode,
  FunctionCallNode,
  FunctionDeclarationNode,
  GotoStatementNode,
  IdentifierNode,
  IfStatementNode,
  InExpressionNode,
  IntegerLiteralNode,
  LabeledStatementNode,
  ParameterDeclarationNode,
  ParenthesizedExpressionNode,
  ProcedureCallNode,
  ProcedureDeclarationNode,
  ProgramNode,
  RangeTypeNode,
  RealLiteralNode,
  RecordTypeNode,
  RepeatStatementNode,
  SetConstructorNode,
  SetTypeNode,
  SimpleTypeNode,
  StatementNode,
  StringLiteralNode,
  TypeDeclarationNode,
  TypeNode,
  UnaryExpressionNode,
  VariableDeclarationNode,
  WhileStatementNode,
  WithStatementNode,
  Token,
} from './types'

// ============================================================================
// 公开 API
// ============================================================================

export interface NodeLineInfo {
  /** 节点起始行（1-based） */
  startLine: number
  /** 节点结束行（1-based） */
  endLine: number
  /** 节点起始列（1-based） */
  startColumn: number
  /** 节点结束列（1-based） */
  endColumn: number
}

export class SourceMap {
  /** AST 节点 → 行号信息 */
  private nodeToLineMap: Map<AstNode, NodeLineInfo> = new Map()
  /** 行号 → AST 节点列表（一行可能有多个节点） */
  private lineToNodesMap: Map<number, AstNode[]> = new Map()
  /** AST 根节点 */
  private root: AstNode

  constructor(root: AstNode) {
    this.root = root
    this.build(root)
  }

  /** 获取 AST 节点对应的行号信息 */
  getNodeLine(node: AstNode): NodeLineInfo | null {
    return this.nodeToLineMap.get(node) ?? null
  }

  /** 根据行号精确查找 AST 节点列表 */
  getNodesAtLine(line: number): AstNode[] {
    return this.lineToNodesMap.get(line) ?? []
  }

  /** 根据行号模糊查找：找到行号范围内包含该行的所有节点中最小（最精确）的那个 */
  getNodeNearLine(line: number): AstNode | null {
    // 精确查找：如果某节点恰好在该行
    const exact = this.lineToNodesMap.get(line)
    if (exact && exact.length > 0) {
      // 返回范围最小的（最精确的）
      return this.findSmallestNode(exact)
    }

    // 模糊查找：搜索附近行（±3 行），找范围最小且包含目标行的节点
    let bestNode: AstNode | null = null
    let bestRange = Infinity

    for (const [node, info] of this.nodeToLineMap) {
      if (line >= info.startLine && line <= info.endLine) {
        const range = info.endLine - info.startLine
        if (range < bestRange) {
          bestRange = range
          bestNode = node
        }
      }
    }

    // 如果范围查找也没找到，找最近的行
    if (!bestNode) {
      let minDist = Infinity
      for (const [node, info] of this.nodeToLineMap) {
        const dist = Math.min(Math.abs(info.startLine - line), Math.abs(info.endLine - line))
        if (dist < minDist) {
          minDist = dist
          bestNode = node
        }
      }
    }

    return bestNode
  }

  /** 获取根节点 */
  getRoot(): AstNode {
    return this.root
  }

  // ============================================================================
  // 内部实现
  // ============================================================================

  private build(node: AstNode): void {
    const tokens = collectTokens(node)
    if (tokens.length === 0) return

    let minLine = Infinity
    let maxLine = -Infinity
    let minColumn = Infinity
    let maxColumn = -1

    for (const token of tokens) {
      if (token.start.line < minLine) minLine = token.start.line
      if (token.end.line > maxLine) maxLine = token.end.line
      if (token.start.line === minLine && token.start.column < minColumn) {
        minColumn = token.start.column
      }
      if (token.end.line === maxLine && token.end.column > maxColumn) {
        maxColumn = token.end.column
      }
    }

    const info: NodeLineInfo = {
      startLine: minLine,
      endLine: maxLine,
      startColumn: minColumn,
      endColumn: maxColumn,
    }

    this.nodeToLineMap.set(node, info)

    // 注册到行号→节点映射
    for (let line = minLine; line <= maxLine; line++) {
      let list = this.lineToNodesMap.get(line)
      if (!list) {
        list = []
        this.lineToNodesMap.set(line, list)
      }
      list.push(node)
    }
  }

  private findSmallestNode(nodes: AstNode[]): AstNode {
    let best = nodes[0]
    let bestRange = Infinity
    for (const node of nodes) {
      const info = this.nodeToLineMap.get(node)
      if (info) {
        const range = info.endLine - info.startLine
        if (range < bestRange) {
          bestRange = range
          best = node
        }
      }
    }
    return best
  }
}

// ============================================================================
// Token 收集：递归遍历 AST，收集所有 raw: Token
// ============================================================================

function collectTokens(node: AstNode): Token[] {
  const tokens: Token[] = []
  collectTokensRecursive(node, tokens)
  return tokens
}

function collectTokensRecursive(node: AstNode, tokens: Token[]): void {
  if (!node || typeof node !== 'object') return

  // 字面量节点：有 raw: Token 字段
  switch (node.kind) {
    case 'IntegerLiteral':
    case 'RealLiteral':
    case 'StringLiteral':
    case 'CharLiteral':
      tokens.push((node as any).raw)
      return
  }

  // 递归遍历子节点
  for (const child of getChildren(node)) {
    collectTokensRecursive(child, tokens)
  }
}

/** 获取 AST 节点的所有子节点（不递归进入 raw: Token） */
function getChildren(node: AstNode): AstNode[] {
  const children: AstNode[] = []

  switch (node.kind) {
    case 'Program': {
      const n = node as ProgramNode
      children.push(n.block)
      break
    }
    case 'Block': {
      const n = node as BlockNode
      if (n.labelDeclarations) children.push(n.labelDeclarations)
      n.constDeclarations.forEach((c) => children.push(c))
      n.typeDeclarations.forEach((t) => children.push(t))
      n.variableDeclarations.forEach((v) => children.push(v))
      n.procedureDeclarations.forEach((p) => children.push(p))
      n.functionDeclarations.forEach((f) => children.push(f))
      children.push(n.compound)
      break
    }
    case 'LabelDeclaration': {
      const n = node as any
      n.labels.forEach((l: any) => children.push(l))
      break
    }
    case 'ConstDeclaration': {
      const n = node as ConstDeclarationNode
      children.push(n.value)
      break
    }
    case 'TypeDeclaration': {
      const n = node as TypeDeclarationNode
      children.push(n.typeDef)
      break
    }
    case 'VariableDeclaration': {
      const n = node as VariableDeclarationNode
      // names 是 IdentifierNode[]，不需要单独收集（没有 raw: Token）
      children.push(n.type)
      break
    }
    case 'ProcedureDeclaration': {
      const n = node as ProcedureDeclarationNode
      n.parameters.forEach((p) => children.push(p))
      if (n.block) children.push(n.block)
      break
    }
    case 'FunctionDeclaration': {
      const n = node as FunctionDeclarationNode
      n.parameters.forEach((p) => children.push(p))
      children.push(n.returnType)
      if (n.block) children.push(n.block)
      break
    }
    case 'ParameterDeclaration': {
      const n = node as ParameterDeclarationNode
      children.push(n.type)
      break
    }
    case 'CompoundStatement': {
      const n = node as CompoundStatementNode
      n.statements.forEach((s) => children.push(s))
      break
    }
    case 'Assignment': {
      const n = node as AssignmentNode
      children.push(n.left, n.right)
      break
    }
    case 'IfStatement': {
      const n = node as IfStatementNode
      children.push(n.condition, n.thenBranch)
      if (n.elseBranch) children.push(n.elseBranch)
      break
    }
    case 'WhileStatement': {
      const n = node as WhileStatementNode
      children.push(n.condition, n.body)
      break
    }
    case 'RepeatStatement': {
      const n = node as RepeatStatementNode
      n.statements.forEach((s) => children.push(s))
      children.push(n.untilCondition)
      break
    }
    case 'ForStatement': {
      const n = node as ForStatementNode
      children.push(n.initial, n.final, n.body)
      break
    }
    case 'CaseStatement': {
      const n = node as CaseStatementNode
      children.push(n.expression)
      n.branches.forEach((b) => children.push(b))
      if (n.otherwise) children.push(n.otherwise)
      break
    }
    case 'CaseBranch': {
      const n = node as CaseBranchNode
      n.labels.forEach((l) => children.push(l))
      children.push(n.statement)
      break
    }
    case 'GotoStatement': {
      const n = node as GotoStatementNode
      children.push(n.label)
      break
    }
    case 'LabeledStatement': {
      const n = node as LabeledStatementNode
      children.push(n.label, n.statement)
      break
    }
    case 'WithStatement': {
      const n = node as WithStatementNode
      n.records.forEach((r) => children.push(r))
      children.push(n.body)
      break
    }
    case 'ProcedureCall': {
      const n = node as ProcedureCallNode
      n.arguments.forEach((a) => children.push(a))
      break
    }
    case 'BinaryExpression': {
      const n = node as BinaryExpressionNode
      children.push(n.left, n.right)
      break
    }
    case 'UnaryExpression': {
      const n = node as UnaryExpressionNode
      children.push(n.operand)
      break
    }
    case 'FunctionCall': {
      const n = node as FunctionCallNode
      n.arguments.forEach((a) => children.push(a))
      break
    }
    case 'ArrayAccess': {
      const n = node as ArrayAccessNode
      children.push(n.array)
      n.indices.forEach((i) => children.push(i))
      break
    }
    case 'FieldAccess': {
      const n = node as FieldAccessNode
      children.push(n.object)
      break
    }
    case 'ParenthesizedExpression': {
      const n = node as ParenthesizedExpressionNode
      children.push(n.expression)
      break
    }
    case 'SetConstructor': {
      const n = node as SetConstructorNode
      n.elements.forEach(([start, end]) => {
        children.push(start)
        if (end) children.push(end)
      })
      break
    }
    case 'InExpression': {
      const n = node as InExpressionNode
      children.push(n.left, n.right)
      break
    }
    // 类型节点
    case 'SimpleType':
    case 'Identifier':
    case 'EmptyStatement':
    case 'BooleanLiteral':
      // 叶子节点，无子节点
      break
    case 'RangeType': {
      const n = node as RangeTypeNode
      children.push(n.start, n.end)
      break
    }
    case 'ArrayType': {
      const n = node as ArrayTypeNode
      n.indexTypes.forEach((i) => children.push(i))
      children.push(n.elementType)
      break
    }
    case 'RecordType': {
      const n = node as RecordTypeNode
      n.fields.forEach((f) => {
        children.push(f.type)
      })
      break
    }
    case 'FileType': {
      const n = node as FileTypeNode
      if (n.elementType) children.push(n.elementType)
      break
    }
    case 'SetType': {
      const n = node as SetTypeNode
      children.push(n.baseType)
      break
    }
    case 'EnumerationType': {
      // 枚举值是 IdentifierNode[]，无 raw: Token
      break
    }
    default:
      // 未知节点类型，跳过
      break
  }

  return children
}
