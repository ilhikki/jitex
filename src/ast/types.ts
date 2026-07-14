// AST Node Types — FP style: plain records with duck-typed `kind` field

// ============================================================================
// Position & Token Types
// ============================================================================

export interface Position {
  line: number
  column: number
  offset: number
}

export interface Token {
  type: string
  content: string
  start: Position
  end: Position
}

export interface LexerInput {
  source: string
  offset: number
  offsetToPosition: (offset: number) => Position
}

// ============================================================================
// Parser Types
// ============================================================================

export interface ParserInput {
  tokens: Token[]
  position: number
}

export type ParseResult<T = AstNode> =
  | { success: true; newPosition: number; astNode: T }
  | { success: false; error: string; position: number }

// ============================================================================
// AST Node Definitions (records, not classes)
// ============================================================================

export interface AstNode {
  kind: string
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
  labelDeclarations: LabelDeclarationNode | null
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
  block: BlockNode | null  // null when FORWARD
  isForward: boolean
}

export interface FunctionDeclarationNode extends AstNode {
  kind: 'FunctionDeclaration'
  name: IdentifierNode
  parameters: ParameterDeclarationNode[]
  returnType: TypeNode
  block: BlockNode | null  // null when FORWARD
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
}

export interface FileTypeNode extends AstNode {
  kind: 'FileType'
  elementType: TypeNode | null  // null for "FILE" without OF
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
  elseBranch: StatementNode | null
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
  otherwise: StatementNode | null
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
  elements: [ExpressionNode, ExpressionNode | null][]  // [start, end|null] pairs
}

export interface InExpressionNode extends AstNode {
  kind: 'InExpression'
  left: ExpressionNode
  right: ExpressionNode
}
