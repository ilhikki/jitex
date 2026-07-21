export interface PascalValue {
  typeId: string
  raw: unknown
}

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
  | FileType
  | EnumType

export interface SourcePos {
  line: number
  column: number
  offset: number
}

export type Ref =
  | { kind: 'global'; name: string; upLevel?: number }
  | { kind: 'local'; name: string; upLevel?: number }
  | { kind: 'temp'; index: number }

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

export interface FileType extends TypeBase {
  kind: 'file'
  elementTypeId?: string
}

export interface EnumType extends TypeBase {
  kind: 'enum'
  values: string[]
}

export interface SysCallArg {
  value: PascalValue
  width?: number
  precision?: number
}

export type SysCallHandler = (
  args: (PascalValue | SysCallArg)[],
  state: unknown,
  runtime?: RuntimeCtx
) => Promise<PascalValue | void> | PascalValue | void

export interface TypeTable {
  get(id: string): TypeDef | undefined
  has(id: string): boolean
  register(def: TypeDef): void
  all(): TypeDef[]
}

export function createTypeTable(): TypeTable {
  const types = new Map<string, TypeDef>()
  return {
    get(id) {
      return types.get(id)
    },
    has(id) {
      return types.has(id)
    },
    register(def) {
      types.set(def.id, def)
    },
    all() {
      return Array.from(types.values())
    },
  }
}

import type { PascalIO } from '../runtime/file-model'

export interface RuntimeCtx {
  typeTable: TypeTable
  sysCalls: Map<string, SysCallHandler>
  io?: PascalIO
}

export interface TypeOps {
  literal?: LiteralOp
  assign?: AssignOp
  unary?: Record<string, UnaryOp>
  binary?: Record<string, BinaryOp>
  compare?: Record<string, CompareOp>
  index?: IndexOp
  setIndex?: SetIndexOp
  field?: FieldOp
  setField?: SetFieldOp
  control?: ControlOp
  default?: DefaultOp
  copy?: CopyOp
}

export interface LiteralOp {
  can: (node: unknown, typeTable: TypeTable) => string | null
  invoke: (value: unknown, typeId: string, runtime: RuntimeCtx) => PascalValue
}

export interface AssignOp {
  can: (fromType: string, toType: string, typeTable: TypeTable) => boolean
  invoke: (dest: PascalValue, src: PascalValue, runtime: RuntimeCtx) => PascalValue
}

export interface UnaryOp {
  can: (operandType: string, typeTable: TypeTable) => string | null
  invoke: (operand: PascalValue, runtime: RuntimeCtx) => PascalValue
}

export interface BinaryOp {
  can: (leftType: string, rightType: string, typeTable: TypeTable) => string | null
  invoke: (left: PascalValue, right: PascalValue, runtime: RuntimeCtx) => PascalValue
}

export interface CompareOp {
  can: (leftType: string, rightType: string, typeTable: TypeTable) => string | null
  invoke: (left: PascalValue, right: PascalValue, op: string, runtime: RuntimeCtx) => PascalValue
}

export interface IndexOp {
  can: (arrayType: string, indexType: string, typeTable: TypeTable) => string | null
  invoke: (array: PascalValue, ...indexValues: PascalValue[]) => PascalValue
}

export interface SetIndexOp {
  can: (arrayType: string, indexType: string, valueType: string, typeTable: TypeTable) => boolean
  invoke: (array: PascalValue, ...args: PascalValue[]) => PascalValue
}

export interface FieldOp {
  can: (recordType: string, fieldName: string, typeTable: TypeTable) => string | null
  invoke: (record: PascalValue, fieldName: string, runtime: RuntimeCtx) => PascalValue
}

export interface SetFieldOp {
  can: (recordType: string, fieldName: string, valueType: string, typeTable: TypeTable) => boolean
  invoke: (record: PascalValue, value: PascalValue, fieldName: string, runtime: RuntimeCtx) => PascalValue
}

export interface ControlOp {
  can: (typeId: string, typeTable: TypeTable) => boolean
  invoke: (value: PascalValue, runtime: RuntimeCtx) => boolean
}

export interface DefaultOp {
  can: (typeId: string, typeTable: TypeTable) => boolean
  invoke: (typeId: string, runtime: RuntimeCtx) => PascalValue
}

export interface CopyOp {
  can: (typeId: string, typeTable: TypeTable) => boolean
  invoke: (value: PascalValue, runtime: RuntimeCtx) => PascalValue
}

export interface TypePlugin {
  name: string
  version: string
  types: TypeDef[]
  ops: TypeOps
}