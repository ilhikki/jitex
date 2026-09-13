import { Position } from './token.ts'

export interface SourceLocation {
  start: Position
  end: Position
}
export interface AstNode {
  kind: string
  loc: SourceLocation
}

// --- Literals ---

export interface IdentifierNode extends AstNode {
  kind: 'Identifier'
  name: string
}

export interface IntegerLiteralNode extends AstNode {
  kind: 'IntegerLiteral'
  value: number
  raw: string
}

export interface RealLiteralNode extends AstNode {
  kind: 'RealLiteral'
  value: number
  raw: string
}

export interface StringLiteralNode extends AstNode {
  kind: 'StringLiteral'
  value: string
  raw: string
}

export interface CharLiteralNode extends AstNode {
  kind: 'CharLiteral'
  value: string
  raw: string
}

export interface BooleanLiteralNode extends AstNode {
  kind: 'BooleanLiteral'
  value: boolean
}

// --- Program & Block ---

export interface ProgramNode extends AstNode {
  kind: 'Program'
  name: IdentifierNode
  parameters: IdentifierNode[]
  block: BlockNode
}

export interface BlockNode extends AstNode {
  kind: 'Block'
  labelDeclarations: LabelDeclarationNode | undefined
  constDeclarations: ConstDeclarationNode[]
  typeDeclarations: TypeDeclarationNode[]
  variableDeclarations: VariableDeclarationNode[]
  procedureDeclarations: ProcedureDeclarationNode[]
  functionDeclarations: FunctionDeclarationNode[]
  compound: CompoundStatementNode
}

// --- Declarations ---

export interface LabelDeclarationNode extends AstNode {
  kind: 'LabelDeclaration'
  labels: IntegerLiteralNode[]
}

export interface ConstDeclarationNode extends AstNode {
  kind: 'ConstDeclaration'
  name: IdentifierNode
  value: ExpressionNode
}

export interface TypeDeclarationNode extends AstNode {
  kind: 'TypeDeclaration'
  name: IdentifierNode
  typeDef: TypeNode
}

export interface VariableDeclarationNode extends AstNode {
  kind: 'VariableDeclaration'
  names: IdentifierNode[]
  type: TypeNode
}

export interface ProcedureDeclarationNode extends AstNode {
  kind: 'ProcedureDeclaration'
  name: IdentifierNode
  parameters: ParameterDeclarationNode[]
  block: BlockNode | undefined
  isForward: boolean
}

export interface FunctionDeclarationNode extends AstNode {
  kind: 'FunctionDeclaration'
  name: IdentifierNode
  parameters: ParameterDeclarationNode[]
  returnType: TypeNode
  block: BlockNode | undefined
  isForward: boolean
}

export interface ParameterDeclarationNode extends AstNode {
  kind: 'ParameterDeclaration'
  names: IdentifierNode[]
  type: TypeNode
  isVar: boolean
}

// --- Types ---

export type TypeNode =
  | SimpleTypeNode
  | RangeTypeNode
  | ArrayTypeNode
  | RecordTypeNode
  | FileTypeNode
  | SetTypeNode
  | EnumerationTypeNode
  | PointerTypeNode

export interface SimpleTypeNode extends AstNode {
  kind: 'SimpleType'
  name: IdentifierNode
}

export interface RangeTypeNode extends AstNode {
  kind: 'RangeType'
  start: ExpressionNode
  end: ExpressionNode
}

export interface ArrayTypeNode extends AstNode {
  kind: 'ArrayType'
  indexTypes: TypeNode[]
  elementType: TypeNode
  isPacked: boolean
}

export interface RecordTypeNode extends AstNode {
  kind: 'RecordType'
  fields: VariableDeclarationNode[]
  variant?: RecordVariantPartNode
}

export interface RecordVariantPartNode extends AstNode {
  kind: 'RecordVariantPart'
  tagName?: IdentifierNode
  tagType: TypeNode
  variants: RecordVariantNode[]
}

export interface RecordVariantNode extends AstNode {
  kind: 'RecordVariant'
  caseLabels: ExpressionNode[]
  fields: VariableDeclarationNode[]
  variant?: RecordVariantPartNode
}

export interface FileTypeNode extends AstNode {
  kind: 'FileType'
  elementType: TypeNode | undefined // undefined for "FILE" without OF
  isPacked: boolean
}

export interface SetTypeNode extends AstNode {
  kind: 'SetType'
  baseType: TypeNode
}

export interface EnumerationTypeNode extends AstNode {
  kind: 'EnumerationType'
  values: IdentifierNode[]
}

// ISO 7185 6.4.4 Pointer-types: new-pointer-type = '↑' domain-type
// 实际源码中使用 '^' 代替 '↑'。
export interface PointerTypeNode extends AstNode {
  kind: 'PointerType'
  domainType: TypeNode
}

// --- Statements ---

export type StatementNode =
  | CompoundStatementNode
  | AssignmentNode
  | IfStatementNode
  | WhileStatementNode
  | RepeatStatementNode
  | ForStatementNode
  | CaseStatementNode
  | GotoStatementNode
  | WithStatementNode
  | ProcedureCallNode
  | EmptyStatementNode
  | LabeledStatementNode

export interface CompoundStatementNode extends AstNode {
  kind: 'CompoundStatement'
  statements: StatementNode[]
}

export interface EmptyStatementNode extends AstNode {
  kind: 'EmptyStatement'
}

export interface AssignmentNode extends AstNode {
  kind: 'Assignment'
  left: ExpressionNode
  right: ExpressionNode
}

export interface IfStatementNode extends AstNode {
  kind: 'IfStatement'
  condition: ExpressionNode
  thenBranch: StatementNode
  elseBranch: StatementNode | undefined
}

export interface WhileStatementNode extends AstNode {
  kind: 'WhileStatement'
  condition: ExpressionNode
  body: StatementNode
}

export interface RepeatStatementNode extends AstNode {
  kind: 'RepeatStatement'
  statements: StatementNode[]
  untilCondition: ExpressionNode
}

export interface ForStatementNode extends AstNode {
  kind: 'ForStatement'
  variable: IdentifierNode
  initial: ExpressionNode
  final: ExpressionNode
  direction: 'TO' | 'DOWNTO'
  body: StatementNode
}

export interface CaseStatementNode extends AstNode {
  kind: 'CaseStatement'
  expression: ExpressionNode
  branches: CaseBranchNode[]
  otherwise: StatementNode | undefined
}

export interface CaseBranchNode extends AstNode {
  kind: 'CaseBranch'
  labels: ExpressionNode[]
  statement: StatementNode
}

export interface GotoStatementNode extends AstNode {
  kind: 'GotoStatement'
  label: IntegerLiteralNode
}

export interface LabeledStatementNode extends AstNode {
  kind: 'LabeledStatement'
  label: IntegerLiteralNode
  statement: StatementNode
}

export interface WithStatementNode extends AstNode {
  kind: 'WithStatement'
  records: ExpressionNode[]
  body: StatementNode
}

export interface ProcedureCallNode extends AstNode {
  kind: 'ProcedureCall'
  name: IdentifierNode
  arguments: ExpressionNode[]
}

// --- Expressions ---

export type ExpressionNode =
  | IdentifierNode
  | IntegerLiteralNode
  | RealLiteralNode
  | StringLiteralNode
  | CharLiteralNode
  | BooleanLiteralNode
  | BinaryExpressionNode
  | UnaryExpressionNode
  | FunctionCallNode
  | ArrayAccessNode
  | FieldAccessNode
  | ParenthesizedExpressionNode
  | SetConstructorNode
  | InExpressionNode

export interface BinaryExpressionNode extends AstNode {
  kind: 'BinaryExpression'
  left: ExpressionNode
  operator: string
  right: ExpressionNode
}

export interface UnaryExpressionNode extends AstNode {
  kind: 'UnaryExpression'
  operator: string
  operand: ExpressionNode
}

export interface FunctionCallNode extends AstNode {
  kind: 'FunctionCall'
  name: IdentifierNode
  arguments: ExpressionNode[]
}

export interface ArrayAccessNode extends AstNode {
  kind: 'ArrayAccess'
  array: ExpressionNode
  indices: ExpressionNode[]
}

export interface FieldAccessNode extends AstNode {
  kind: 'FieldAccess'
  object: ExpressionNode
  field: IdentifierNode
}

export interface ParenthesizedExpressionNode extends AstNode {
  kind: 'ParenthesizedExpression'
  expression: ExpressionNode
}

export interface SetConstructorNode extends AstNode {
  kind: 'SetConstructor'
  elements: [ExpressionNode, ExpressionNode | undefined][] // [start, end|undefined] pairs
}

export interface InExpressionNode extends AstNode {
  kind: 'InExpression'
  left: ExpressionNode
  right: ExpressionNode
}
