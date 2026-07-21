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
  }
}

import type { PascalIO } from '../runtime/file-model'

export interface RuntimeCtx {
  typeTable: TypeTable
  sysCalls: Map<string, SysCallHandler>
  io?: PascalIO
}

export interface TypePlugin {
  name: string
  version: string
  types: TypeDef[]
}