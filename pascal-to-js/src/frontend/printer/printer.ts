// AST Node to Pascal Source Code Printer
// 幂等性保证：s0 -> parse -> n0 -> print -> s1 -> parse -> n1 -> print -> s2, s1 === s2
//
// 格式规则：
// - 关键字全部大写
// - 2 空格缩进
// - 语句分隔符 ; 不出现在最后一条语句后（标准 Pascal 风格）
// - 字面量保留 raw 字段（原始 token 内容），BooleanLiteral 输出 TRUE/FALSE

import type {
  ArrayAccessNode,
  ArrayTypeNode,
  AssignmentNode,
  AstNode,
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
  LabelDeclarationNode,
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
} from '../node.ts'

// 公开 API

/** AST 节点转 Pascal 源代码（幂等） */
export function nodeToCode(node: AstNode): string {
  const ctx: PrintContext = { indent: 0 }
  return printNode(node, ctx)
}

// 内部实现

interface PrintContext {
  indent: number
}

function indentStr(ctx: PrintContext): string {
  return '  '.repeat(ctx.indent)
}

function withIndent(ctx: PrintContext, delta: number): PrintContext {
  return { indent: ctx.indent + delta }
}

function printNode(node: AstNode, ctx: PrintContext): string {
  switch (node.kind) {
    case 'Program':
      return printProgram(node as ProgramNode, ctx)
    case 'Block':
      return printBlock(node as BlockNode, ctx)
    case 'CompoundStatement':
      return printCompound(node as CompoundStatementNode, ctx)
    case 'EmptyStatement':
      return ''
    case 'Assignment':
      return printAssignment(node as AssignmentNode, ctx)
    case 'IfStatement':
      return printIf(node as IfStatementNode, ctx)
    case 'WhileStatement':
      return printWhile(node as WhileStatementNode, ctx)
    case 'RepeatStatement':
      return printRepeat(node as RepeatStatementNode, ctx)
    case 'ForStatement':
      return printFor(node as ForStatementNode, ctx)
    case 'CaseStatement':
      return printCase(node as CaseStatementNode, ctx)
    case 'GotoStatement':
      return printGoto(node as GotoStatementNode)
    case 'LabeledStatement':
      return printLabeled(node as LabeledStatementNode, ctx)
    case 'WithStatement':
      return printWith(node as WithStatementNode, ctx)
    case 'ProcedureCall':
      return printProcedureCall(node as ProcedureCallNode)

    // 声明
    case 'LabelDeclaration':
      return printLabelDecl(node as LabelDeclarationNode)
    case 'ConstDeclaration':
      return printConstDecl(node as ConstDeclarationNode)
    case 'TypeDeclaration':
      return printTypeDecl(node as TypeDeclarationNode, ctx)
    case 'VariableDeclaration':
      return printVarDecl(node as VariableDeclarationNode, ctx)
    case 'ProcedureDeclaration':
      return printProcedureDecl(node as ProcedureDeclarationNode, ctx)
    case 'FunctionDeclaration':
      return printFunctionDecl(node as FunctionDeclarationNode, ctx)
    case 'ParameterDeclaration':
      return printParamDecl(node as ParameterDeclarationNode, ctx)

    // 类型
    case 'SimpleType':
      return printSimpleType(node as SimpleTypeNode)
    case 'RangeType':
      return printRangeType(node as RangeTypeNode, ctx)
    case 'ArrayType':
      return printArrayType(node as ArrayTypeNode, ctx)
    case 'RecordType':
      return printRecordType(node as RecordTypeNode, ctx)
    case 'FileType':
      return printFileType(node as FileTypeNode, ctx)
    case 'SetType':
      return printSetType(node as SetTypeNode, ctx)
    case 'EnumerationType':
      return printEnumType(node as EnumerationTypeNode)

    // 表达式
    case 'Identifier':
      return (node as IdentifierNode).name
    case 'IntegerLiteral':
      return (node as IntegerLiteralNode).raw
    case 'RealLiteral':
      return (node as RealLiteralNode).raw
    case 'StringLiteral':
      return quoteString((node as StringLiteralNode).raw)
    case 'CharLiteral':
      return quoteChar((node as CharLiteralNode).raw)
    case 'BooleanLiteral':
      return (node as BooleanLiteralNode).value ? 'TRUE' : 'FALSE'
    case 'BinaryExpression':
      return printBinary(node as BinaryExpressionNode, ctx)
    case 'UnaryExpression':
      return printUnary(node as UnaryExpressionNode, ctx)
    case 'FunctionCall':
      return printFunctionCall(node as FunctionCallNode, ctx)
    case 'ArrayAccess':
      return printArrayAccess(node as ArrayAccessNode, ctx)
    case 'FieldAccess':
      return printFieldAccess(node as FieldAccessNode, ctx)
    case 'ParenthesizedExpression':
      return `(${printExpr((node as ParenthesizedExpressionNode).expression, ctx)})`
    case 'SetConstructor':
      return printSetConstructor(node as SetConstructorNode, ctx)
    case 'InExpression':
      return printIn(node as InExpressionNode, ctx)
    default:
      throw new Error(`printer: unknown node kind: ${node.kind}`)
  }
}

// 表达式

/** 字符串字面量加引号，内部单引号转义为双单引号 */
function quoteString(raw: string): string {
  return `'${raw.replace(/'/g, "''")}'`
}

/** 字符字面量：CHAR_CODE 格式（#开头）直接输出，否则加引号 */
function quoteChar(raw: string): string {
  if (raw.startsWith('#')) {
    return raw
  }
  return `'${raw.replace(/'/g, "''")}'`
}

function printExpr(expr: ExpressionNode, ctx: PrintContext): string {
  return printNode(expr, ctx)
}

function printBinary(node: BinaryExpressionNode, ctx: PrintContext): string {
  const left = printExpr(node.left, ctx)
  const right = printExpr(node.right, ctx)
  const op = node.operator.toUpperCase()
  return `${left} ${op} ${right}`
}

function printUnary(node: UnaryExpressionNode, ctx: PrintContext): string {
  const operand = printExpr(node.operand, ctx)
  const op = node.operator.toUpperCase()
  // not 前置，+/- 前置
  return `${op} ${operand}`
}

function printFunctionCall(node: FunctionCallNode, ctx: PrintContext): string {
  const name = node.name.name
  const args = node.arguments.map((a) => printExpr(a, ctx)).join(', ')
  return `${name}(${args})`
}

function printArrayAccess(node: ArrayAccessNode, ctx: PrintContext): string {
  const base = printExpr(node.array, ctx)
  const indices = node.indices.map((i) => printExpr(i, ctx)).join(', ')
  return `${base}[${indices}]`
}

function printFieldAccess(
  node: { object: ExpressionNode; field: IdentifierNode },
  ctx: PrintContext,
): string {
  const obj = printExpr(node.object, ctx)
  // Pascal 指针解引用/文件缓冲区：F^ 在 AST 中表示为 FieldAccess(field.name='^')
  if (node.field.name === '^') {
    return `${obj}^`
  }
  return `${obj}.${node.field.name}`
}

function printSetConstructor(node: SetConstructorNode, ctx: PrintContext): string {
  if (node.elements.length === 0) {
    return '[]'
  }
  const parts = node.elements.map(([start, end]) => {
    const s = printExpr(start, ctx)
    return end ? `${s}..${printExpr(end, ctx)}` : s
  })
  return `[${parts.join(', ')}]`
}

function printIn(node: InExpressionNode, ctx: PrintContext): string {
  const left = printExpr(node.left, ctx)
  const right = printExpr(node.right, ctx)
  return `${left} IN ${right}`
}

// 语句

function printProgram(node: ProgramNode, ctx: PrintContext): string {
  const params = node.parameters.length > 0 ? `(${node.parameters.map((p) => p.name).join(', ')})` : ''
  const header = `program ${node.name.name}${params};`
  const block = printBlock(node.block, ctx)
  return `${header}\n${block}.`
}

function printBlock(node: BlockNode, ctx: PrintContext): string {
  const parts: string[] = []

  if (node.labelDeclarations && node.labelDeclarations.labels.length > 0) {
    const labels = node.labelDeclarations.labels.map((l) => l.raw).join(', ')
    parts.push(`label\n  ${labels};`)
  }

  if (node.constDeclarations.length > 0) {
    const consts = node.constDeclarations.map((c) => printConstDecl(c)).join(';\n  ')
    parts.push(`const\n  ${consts};`)
  }

  if (node.typeDeclarations.length > 0) {
    const types = node.typeDeclarations.map((t) => printTypeDecl(t, ctx)).join(';\n  ')
    parts.push(`type\n  ${types};`)
  }

  if (node.variableDeclarations.length > 0) {
    const vars = node.variableDeclarations.map((v) => printVarDecl(v, ctx)).join(';\n  ')
    parts.push(`var\n  ${vars};`)
  }

  for (const proc of node.procedureDeclarations) {
    parts.push(printProcedureDecl(proc, ctx) + ';')
  }
  for (const fn of node.functionDeclarations) {
    parts.push(printFunctionDecl(fn, ctx) + ';')
  }

  parts.push(printCompound(node.compound, ctx))

  return parts.join('\n')
}

function printCompound(node: CompoundStatementNode, ctx: PrintContext): string {
  if (node.statements.length === 0) {
    return 'begin\nend'
  }
  const innerCtx = withIndent(ctx, 1)
  const stmts = node.statements
    .map((s) => {
      const code = printStatement(s, innerCtx)
      return code === '' ? undefined : indentStr(innerCtx) + code
    })
    .filter((x) => x !== undefined)
  return `begin\n${stmts.join(';\n')}\n${indentStr(ctx)}end`
}

function printStatement(stmt: StatementNode, ctx: PrintContext): string {
  const code = printNode(stmt, ctx)
  return code
}

function printAssignment(node: AssignmentNode, ctx: PrintContext): string {
  const left = printExpr(node.left, ctx)
  const right = printExpr(node.right, ctx)
  return `${left} := ${right}`
}

function printIf(node: IfStatementNode, ctx: PrintContext): string {
  const cond = printExpr(node.condition, ctx)
  const thenCode = printThenElseBody(node.thenBranch, ctx)
  if (node.elseBranch) {
    const elseCode = printThenElseBody(node.elseBranch, ctx)
    return `if ${cond} then\n${thenCode}\n${indentStr(ctx)}else\n${elseCode}`
  }
  return `if ${cond} then\n${thenCode}`
}

/** then/else 分支体：单语句需缩进，复合语句保持原样 */
function printThenElseBody(stmt: StatementNode, ctx: PrintContext): string {
  if (stmt.kind === 'CompoundStatement') {
    return printCompound(stmt as CompoundStatementNode, ctx)
  }
  const innerCtx = withIndent(ctx, 1)
  return indentStr(innerCtx) + printStatement(stmt, innerCtx)
}

function printWhile(node: WhileStatementNode, ctx: PrintContext): string {
  const cond = printExpr(node.condition, ctx)
  const body = printLoopBody(node.body, ctx)
  return `while ${cond} do\n${body}`
}

function printRepeat(node: RepeatStatementNode, ctx: PrintContext): string {
  const innerCtx = withIndent(ctx, 1)
  if (node.statements.length === 0) {
    return `repeat\n${indentStr(ctx)}until ${printExpr(node.untilCondition, ctx)}`
  }
  const stmts = node.statements.map((s) => {
    return indentStr(innerCtx) + printStatement(s, innerCtx)
  })
  return `repeat\n${stmts.join(';\n')}\n${indentStr(ctx)}until ${printExpr(node.untilCondition, ctx)}`
}

function printFor(node: ForStatementNode, ctx: PrintContext): string {
  const init = printExpr(node.initial, ctx)
  const final = printExpr(node.final, ctx)
  const body = printLoopBody(node.body, ctx)
  return `for ${node.variable.name} := ${init} ${node.direction} ${final} do\n${body}`
}

/** 循环体：单语句需缩进，复合语句保持原样 */
function printLoopBody(stmt: StatementNode, ctx: PrintContext): string {
  if (stmt.kind === 'CompoundStatement') {
    return printCompound(stmt as CompoundStatementNode, ctx)
  }
  const innerCtx = withIndent(ctx, 1)
  return indentStr(innerCtx) + printStatement(stmt, innerCtx)
}

function printCase(node: CaseStatementNode, ctx: PrintContext): string {
  const expr = printExpr(node.expression, ctx)
  const innerCtx = withIndent(ctx, 1)
  const branches = node.branches.map((b) => printCaseBranch(b, innerCtx))
  let result = `case ${expr} of\n${branches.join(';\n')}`
  if (node.otherwise) {
    const otherwiseCode = printStatement(node.otherwise, innerCtx)
    result += `;\n${indentStr(innerCtx)}otherwise ${otherwiseCode}`
  }
  result += `\n${indentStr(ctx)}end`
  return result
}

function printCaseBranch(branch: CaseBranchNode, ctx: PrintContext): string {
  const labels = branch.labels.map((l) => printExpr(l, ctx)).join(', ')
  const stmt = printStatement(branch.statement, ctx)
  return `${indentStr(ctx)}${labels}: ${stmt}`
}

function printGoto(node: GotoStatementNode): string {
  return `goto ${node.label.raw}`
}

function printLabeled(node: LabeledStatementNode, ctx: PrintContext): string {
  const stmt = printStatement(node.statement, ctx)
  return `${node.label.raw}: ${stmt}`
}

function printWith(node: WithStatementNode, ctx: PrintContext): string {
  const recs = node.records.map((r) => printExpr(r, ctx)).join(', ')
  const body = printLoopBody(node.body, ctx)
  return `with ${recs} do\n${body}`
}

function printProcedureCall(node: ProcedureCallNode): string {
  const args = node.arguments.length > 0 ? `(${node.arguments.map((a) => printExpr(a, { indent: 0 })).join(', ')})` : ''
  return `${node.name.name}${args}`
}

// 声明

function printLabelDecl(node: { labels: IntegerLiteralNode[] }): string {
  return node.labels.map((l) => l.raw).join(', ')
}

function printConstDecl(node: ConstDeclarationNode): string {
  const value = printExpr(node.value, { indent: 0 })
  return `${node.name.name} = ${value}`
}

function printTypeDecl(node: TypeDeclarationNode, ctx: PrintContext): string {
  const typeDef = printType(node.typeDef, ctx)
  return `${node.name.name} = ${typeDef}`
}

function printVarDecl(node: VariableDeclarationNode, ctx: PrintContext): string {
  const names = node.names.map((n) => n.name).join(', ')
  const type = printType(node.type, ctx)
  return `${names}: ${type}`
}

function printProcedureDecl(node: ProcedureDeclarationNode, ctx: PrintContext): string {
  const params = node.parameters.length > 0 ? `(${node.parameters.map((p) => printParamDecl(p, ctx)).join('; ')})` : ''
  let result = `procedure ${node.name.name}${params}`
  if (node.isForward) {
    result += '; forward'
    return result
  }
  if (node.block) {
    const block = printBlock(node.block, ctx)
    result += `;\n${block}`
  }
  return result
}

function printFunctionDecl(node: FunctionDeclarationNode, ctx: PrintContext): string {
  const params = node.parameters.length > 0 ? `(${node.parameters.map((p) => printParamDecl(p, ctx)).join('; ')})` : ''
  const returnType = printType(node.returnType, ctx)
  let result = `function ${node.name.name}${params}: ${returnType}`
  if (node.isForward) {
    result += '; forward'
    return result
  }
  if (node.block) {
    const block = printBlock(node.block, ctx)
    result += `;\n${block}`
  }
  return result
}

function printParamDecl(node: ParameterDeclarationNode, ctx: PrintContext): string {
  const names = node.names.map((n) => n.name).join(', ')
  // ISO 7185 6.6.3.4/6.6.3.5：可调用形参段（过程/函数作形式参数）
  if (node.callable) {
    const params = node.callable.parameters.length > 0
      ? `(${node.callable.parameters.map((p) => printParamDecl(p, ctx)).join('; ')})`
      : ''
    const result = node.callable.returnType ? `: ${printType(node.callable.returnType, ctx)}` : ''
    return `${node.callable.kind} ${names}${params}${result}`
  }
  const type = node.type ? printType(node.type, ctx) : ''
  return node.isVar ? `var ${names}: ${type}` : `${names}: ${type}`
}

// 类型

function printType(type: TypeNode, ctx: PrintContext): string {
  return printNode(type, ctx)
}

function printSimpleType(node: SimpleTypeNode): string {
  return node.name.name
}

function printRangeType(node: RangeTypeNode, ctx: PrintContext): string {
  const start = printExpr(node.start, ctx)
  const end = printExpr(node.end, ctx)
  return `${start}..${end}`
}

function printArrayType(node: ArrayTypeNode, ctx: PrintContext): string {
  const indices = node.indexTypes.map((t) => printType(t, ctx)).join(', ')
  const elem = printType(node.elementType, ctx)
  const packed = node.isPacked ? 'packed ' : ''
  return `${packed}array[${indices}] of ${elem}`
}

function printRecordType(node: RecordTypeNode, ctx: PrintContext): string {
  if (node.fields.length === 0) {
    return 'record end'
  }
  const fields = node.fields.map((f) => printVarDecl(f, ctx)).join('; ')
  return `record ${fields} end`
}

function printFileType(node: FileTypeNode, ctx: PrintContext): string {
  const packed = node.isPacked ? 'packed ' : ''
  if (node.elementType) {
    return `${packed}file of ${printType(node.elementType, ctx)}`
  }
  return `${packed}file`
}

function printSetType(node: SetTypeNode, ctx: PrintContext): string {
  return `set of ${printType(node.baseType, ctx)}`
}

function printEnumType(node: EnumerationTypeNode): string {
  const values = node.values.map((v) => v.name).join(', ')
  return `(${values})`
}
