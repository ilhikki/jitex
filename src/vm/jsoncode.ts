// JsonCode: 中间代码类型定义
// 设计原则：纯数据，可序列化，人类可读

// ============================================================================
// SourcePos
// ============================================================================

export interface SourcePos {
  line: number
  column: number
  file?: string
}

// ============================================================================
// Ref: 变量引用（语义化）
// ============================================================================

export type Ref = GlobalRef | LocalRef | TempRef

export interface GlobalRef {
  kind: 'global'
  name: string
}

export interface LocalRef {
  kind: 'local'
  name: string
  upLevel?: number // 静态链层级：0=当前帧, 1=直接外层, ...
}

export interface TempRef {
  kind: 'temp'
  index: number
}

export function globalRef(name: string): GlobalRef {
  return { kind: 'global', name: name.toUpperCase() }
}

export function localRef(name: string): LocalRef {
  return { kind: 'local', name: name.toUpperCase() }
}

export function tempRef(index: number): TempRef {
  return { kind: 'temp', index }
}

export function refKey(r: Ref): string {
  switch (r.kind) {
    case 'global': return `G:${r.name}`
    case 'local': return `L:${r.name}`
    case 'temp': return `T:${r.index}`
  }
}

export function refEqual(a: Ref, b: Ref): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'global': return (a as GlobalRef).name === (b as GlobalRef).name
    case 'local': return (a as LocalRef).name === (b as LocalRef).name
    case 'temp': return (a as TempRef).index === (b as TempRef).index
  }
}

// ============================================================================
// PascalValue: 运行时值（纯数据）
// ============================================================================

export interface PascalValue {
  typeId: string
  raw: unknown
}

// ============================================================================
// JsonInstruction: 指令集
// ============================================================================

export type JsonInstruction =
  | DeclareInst
  | MoveInst
  | LiteralInst
  | TempAllocInst
  | TempFreeInst
  | JmpInst
  | JmpIfFalseInst
  | LabelInst
  | CallInst
  | RetInst
  | SysCallInst
  | TypeOpInst

export interface DeclareInst {
  op: 'DECLARE'
  scope: 'global' | 'local'
  name: string
  typeId: string
  sourcePos?: SourcePos
}

export interface MoveInst {
  op: 'MOVE'
  dest: Ref
  src: Ref
  sourcePos?: SourcePos
}

export interface LiteralInst {
  op: 'LITERAL'
  dest: Ref
  typeId: string
  value: unknown
  sourcePos?: SourcePos
}

export interface TempAllocInst {
  op: 'TEMP_ALLOC'
  count: number
  sourcePos?: SourcePos
}

export interface TempFreeInst {
  op: 'TEMP_FREE'
  count: number
  sourcePos?: SourcePos
}

export interface JmpInst {
  op: 'JMP'
  target: string
  sourcePos?: SourcePos
}

export interface JmpIfFalseInst {
  op: 'JMP_IF_FALSE'
  cond: Ref
  target: string
  sourcePos?: SourcePos
}

export interface LabelInst {
  op: 'LABEL'
  label: string
  sourcePos?: SourcePos
}

export interface CallInst {
  op: 'CALL'
  proc: string
  args: Ref[]
  dest?: Ref
  sourcePos?: SourcePos
}

export interface RetInst {
  op: 'RET'
  value?: Ref
  sourcePos?: SourcePos
}

export interface SysCallInst {
  op: 'SYS_CALL'
  proc: string
  args: Ref[]
  dest?: Ref
  // WRITE/WRITELN 参数的格式说明（width/precision），按 args 索引对齐
  // 仅对 WRITE/WRITELN 有意义；其他 syscall 忽略
  argFormats?: { width?: Ref; precision?: Ref }[]
  sourcePos?: SourcePos
}

export interface TypeOpInst {
  op: 'TYPE_OP'
  typeId: string
  opName: string
  opKind: 'unary' | 'binary' | 'index' | 'setIndex' | 'field' | 'setField' | 'compare' | 'assign' | 'default' | 'copy' | 'call' | 'control'
  dest: Ref
  src: Ref[]
  extra?: unknown
  sourcePos?: SourcePos
}

// ============================================================================
// TypeDef: 类型定义（判别联合）
// ============================================================================

export type TypeDef =
  | IntegerType
  | RealType
  | BooleanType
  | CharType
  | StringType
  | SubrangeType
  | ArrayType
  | RecordType
  | SetType
  | PointerType
  | FileType
  | EnumType

export interface TypeBase {
  id: string
  kind: string
}

export interface IntegerType extends TypeBase {
  kind: 'integer'
  size: 16 | 32 | 64
  signed: boolean
}

export interface RealType extends TypeBase {
  kind: 'real'
  size: 32 | 64
}

export interface BooleanType extends TypeBase {
  kind: 'boolean'
}

export interface CharType extends TypeBase {
  kind: 'char'
}

export interface StringType extends TypeBase {
  kind: 'string'
  length?: number
}

export interface SubrangeType extends TypeBase {
  kind: 'subrange'
  baseTypeId: string
  min: number
  max: number
}

export interface ArrayType extends TypeBase {
  kind: 'array'
  elementTypeId: string
  dimensions: ArrayDim[]
  isPacked: boolean
}

export interface ArrayDim {
  low: number
  high: number
  indexTypeId: string
}

export interface RecordType extends TypeBase {
  kind: 'record'
  fields: RecordField[]
}

export interface RecordField {
  name: string
  typeId: string
  offset: number
}

export interface SetType extends TypeBase {
  kind: 'set'
  baseTypeId: string
  minOrd: number
  maxOrd: number
}

export interface PointerType extends TypeBase {
  kind: 'pointer'
  targetTypeId: string
}

export interface FileType extends TypeBase {
  kind: 'file'
  elementTypeId?: string
}

export interface EnumType extends TypeBase {
  kind: 'enum'
  values: string[]
}

// ============================================================================
// ProcDef / JsonCode
// ============================================================================

export interface ParamDef {
  name: string
  typeId: string
  isVar: boolean
}

export interface VarDecl {
  name: string
  typeId: string
}

export interface ProcDef {
  name: string
  params: ParamDef[]
  returnType?: string
  locals: VarDecl[]
  maxTemps: number
  body: JsonInstruction[]
  level?: number // 嵌套层级：main=0, 直接嵌套在 main 中的=1, ...
  sourcePos?: SourcePos
}

export interface JsonCode {
  version: string
  typeTable: TypeDef[]
  globals: VarDecl[]
  procedures: ProcDef[]
  entry: string
  sourceFile?: string
}
