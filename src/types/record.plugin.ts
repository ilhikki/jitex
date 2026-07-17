import type {
  RecordType,
  PascalValue,
  Ref,
  JsonInstruction,
} from '../vm/jsoncode'
import type {
  TypePlugin,
  TypeTable,
  CodeGenContext,
  RuntimeCtx,
} from './index'

export function makeRecordValue(fields: Record<string, unknown>, typeId: string): PascalValue {
  return { typeId, raw: fields }
}

export function createRecordPlugin(typeTable: TypeTable): TypePlugin {
  return {
    name: 'record',
    version: '1.0.0',
    types: [],
    ops: {
      field: {
        can: (recordType: string, fieldName: string, tt: TypeTable) => {
          const typeDef = tt.get(recordType)
          if (typeDef && typeDef.kind === 'record') {
            const recType = typeDef as RecordType
            const field = recType.fields.find((f) => f.name === fieldName.toUpperCase())
            if (field) return field.typeId
          }
          return null
        },
        toCode: (dest: Ref, record: Ref, fieldName: string, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: ctx.typeId || 'record',
            opName: 'field',
            opKind: 'field',
            dest,
            src: [record],
            extra: { field: fieldName },
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (record: PascalValue, fieldName: string, runtime: RuntimeCtx): PascalValue => {
          const rec = record.raw as Record<string, unknown>
          const fieldVal = rec[fieldName.toUpperCase()]
          const typeDef = runtime.typeTable.get(record.typeId)
          if (typeDef && typeDef.kind === 'record') {
            const recType = typeDef as RecordType
            const field = recType.fields.find((f) => f.name === fieldName.toUpperCase())
            if (field) {
              return { typeId: field.typeId, raw: fieldVal }
            }
          }
          return { typeId: 'integer', raw: fieldVal as number }
        },
      },

      setField: {
        can: (recordType: string, fieldName: string, valueType: string, tt: TypeTable) => {
          const typeDef = tt.get(recordType)
          if (typeDef && typeDef.kind === 'record') {
            const recType = typeDef as RecordType
            const field = recType.fields.find((f) => f.name === fieldName.toUpperCase())
            if (field) return field.typeId === valueType
          }
          return false
        },
        toCode: (dest: Ref, value: Ref, fieldName: string, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: ctx.typeId || 'record',
            opName: 'setField',
            opKind: 'setField',
            dest,
            src: [value],
            extra: { field: fieldName },
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (record: PascalValue, value: PascalValue, fieldName: string): PascalValue => {
          const rec = record.raw as Record<string, unknown>
          rec[fieldName.toUpperCase()] = value.raw
          return record
        },
      },

      default: {
        can: (typeId: string, tt: TypeTable) => {
          const typeDef = tt.get(typeId)
          return typeDef?.kind === 'record'
        },
        toCode: (dest: Ref, typeId: string, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId,
            opName: 'default',
            opKind: 'default',
            dest,
            src: [],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (typeId: string, runtime: RuntimeCtx): PascalValue => {
          const typeDef = runtime.typeTable.get(typeId)
          if (!typeDef || typeDef.kind !== 'record') {
            throw new Error(`Type ${typeId} is not a record`)
          }
          const recType = typeDef as RecordType
          const fields: Record<string, unknown> = {}
          for (const field of recType.fields) {
            fields[field.name] = 0
          }
          return { typeId, raw: fields }
        },
      },

      copy: {
        can: (typeId: string, tt: TypeTable) => {
          const typeDef = tt.get(typeId)
          return typeDef?.kind === 'record'
        },
        toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: ctx.typeId || 'record',
            opName: 'copy',
            opKind: 'copy',
            dest,
            src: [src],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (value: PascalValue): PascalValue => {
          const rec = value.raw as Record<string, unknown>
          return { typeId: value.typeId, raw: { ...rec } }
        },
      },

      assign: {
        can: (fromType: string, toType: string, tt: TypeTable) => {
          const fromDef = tt.get(fromType)
          const toDef = tt.get(toType)
          return fromDef?.kind === 'record' && toDef?.kind === 'record' && fromType === toType
        },
        toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: ctx.typeId || 'record',
            opName: 'assign',
            opKind: 'assign',
            dest,
            src: [src],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (dest: PascalValue, src: PascalValue): PascalValue => {
          const srcRec = src.raw as Record<string, unknown>
          const destRec = dest.raw as Record<string, unknown>
          for (const key of Object.keys(srcRec)) {
            destRec[key] = srcRec[key]
          }
          return dest
        },
      },
    },
  }
}
