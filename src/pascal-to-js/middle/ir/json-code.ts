type VarId = number

type LabelId = number

export interface Function {
  id: VarId
  params: VarId[]
  locals: VarId[]
  children: Function[]
  body: Statement[]
}

export type Statement = Label | Jmp | JumpIf | LongJump | Return | Eval

export interface Label {
  kind: 'label'
  labelId: LabelId
}

export interface Jmp {
  kind: 'jump'
  labelId: LabelId
}

export interface JumpIf {
  kind: 'jumpIf'
  condition: Expr
  then: LabelId
  else: LabelId
}

export interface LongJump {
  kind: 'longJump'
  labelId: LabelId
  functionId: VarId
}

export interface Return {
  kind: 'return'
  value?: Expr
}

export interface Eval {
  kind: 'eval'
  expr: Expr
}

export type Expr = Ref | Literal | Call | Syscall

export interface Ref {
  kind: 'ref'
  varId: VarId
}

export interface Literal {
  kind: 'literal'
  key: string
  arg: string
}

export interface Call {
  kind: 'call'
  functionId: VarId
  args: Expr[]
}

export interface Syscall {
  kind: 'syscall'
  key: string
  args: Expr[]
}
