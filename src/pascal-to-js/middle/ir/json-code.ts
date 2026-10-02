/**
 * Numeric identifier for variables, parameters, locals, and functions.
 * Must be an integer greater than or equal to 1.
 * Ids must not be duplicated within the same program.
 */
export type VarId = number

/**
 * Numeric identifier for jump labels.
 * Must be an integer greater than or equal to 1.
 * Ids must not be duplicated within the same program.
 */
export type LabelId = number

/**
 * A lowered program function, identified by id and owning its params,
 * locals, nested functions, and statement body.
 */
export interface Function {
  id: VarId
  params: VarId[]
  locals: VarId[]
  children: Function[]
  body: Statement[]
}

/**
 * A single lowered statement.
 */
export type Statement = Label | Jmp | JumpIf | LongJump | Return | Eval

/**
 * Marks a position that jumps may target.
 */
export interface Label {
  kind: 'label'
  labelId: LabelId
}

/**
 * Unconditional jump to a label.
 */
export interface Jmp {
  kind: 'jump'
  labelId: LabelId
}

/**
 * Conditional jump to one of two labels.
 */
export interface JumpIf {
  kind: 'jumpIf'
  condition: Expr
  then: LabelId
  else: LabelId
}

/**
 * Non-local jump that unwinds to a label in another function.
 */
export interface LongJump {
  kind: 'longJump'
  labelId: LabelId
  functionId: VarId
}

/**
 * Returns from the current function, optionally with a value.
 */
export interface Return {
  kind: 'return'
  value?: Expr
}

/**
 * Evaluates an expression for its side effects and discards the result.
 */
export interface Eval {
  kind: 'eval'
  expr: Expr
}

/**
 * A single lowered expression.
 */
export type Expr = Ref | Literal | Call | Syscall

/**
 * Reference to a local or parameter variable by id.
 */
export interface Ref {
  kind: 'ref'
  varId: VarId
}

/**
 * A literal value encoded as a key and its raw argument text.
 */
export interface Literal {
  kind: 'literal'
  key: string
  arg: string
}

/**
 * Direct call to another function by id.
 */
export interface Call {
  kind: 'call'
  functionId: VarId
  args: Expr[]
}

/**
 * Host runtime call identified by key, with argument expressions.
 */
export interface Syscall {
  kind: 'syscall'
  key: string
  args: Expr[]
}
