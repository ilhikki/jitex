import type {
  RecordType,
  PascalValue,
  TypePlugin,
  TypeTable,
  RuntimeCtx,
} from '../types'

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
        invoke: (typeId: string, runtime: RuntimeCtx): PascalValue => {
          const buildDefault = (tid: string): unknown => {
            const td = runtime.typeTable.get(tid)
            if (!td) return 0
            if (td.kind === 'record') {
              const rt = td as RecordType
              const obj: Record<string, unknown> = {}
              for (const f of rt.fields) {
                obj[f.name] = buildDefault(f.typeId)
              }
              return obj
            }
            if (td.kind === 'array') {
              const at = td as any
              const len = (at.high as number) - (at.low as number) + 1
              const arr: unknown[] = []
              for (let i = 0; i < len; i++) {
                arr.push(buildDefault(at.elementTypeId))
              }
              return arr
            }
            if (td.kind === 'string') return ''
            if (td.kind === 'char') return '\x00'
            if (td.kind === 'boolean') return false
            return 0
          }
          const typeDef = runtime.typeTable.get(typeId)
          if (!typeDef || typeDef.kind !== 'record') {
            throw new Error(`Type ${typeId} is not a record`)
          }
          const recType = typeDef as RecordType
          const fields: Record<string, unknown> = {}
          for (const field of recType.fields) {
            fields[field.name] = buildDefault(field.typeId)
          }
          return { typeId, raw: fields }
        },
      },

      copy: {
        can: (typeId: string, tt: TypeTable) => {
          const typeDef = tt.get(typeId)
          return typeDef?.kind === 'record'
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