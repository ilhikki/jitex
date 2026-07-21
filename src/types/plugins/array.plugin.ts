import type {
  ArrayType,
  PascalValue,
  TypePlugin,
  TypeTable,
  RuntimeCtx,
} from '../types'

export function makeArrayValue(values: unknown[]): PascalValue {
  return { typeId: 'array', raw: values }
}

export function createArrayPlugin(typeTable: TypeTable): TypePlugin {
  return {
    name: 'array',
    version: '1.0.0',
    types: [],
    ops: {
      index: {
        can: (typeId: string) => {
          const typeDef = typeTable.get(typeId)
          if (typeDef && typeDef.kind === 'array') {
            return (typeDef as ArrayType).elementTypeId
          }
          return null
        },
        invoke: (arrayValue: PascalValue, ...indexValues: PascalValue[]) => {
          const arr = arrayValue.raw as unknown[]
          const indices = indexValues.map((iv) => iv.raw as number)
          let currentTypeId = arrayValue.typeId
          for (let i = 0; i < indices.length; i++) {
            const td = typeTable.get(currentTypeId)
            if (td && td.kind === 'array') {
              const at = td as ArrayType
              const dim = at.dimensions[0]
              const idx = indices[i]
              if (idx < dim.low || idx > dim.high) {
                throw new Error(`Array index ${idx} out of range ${dim.low}..${dim.high}`)
              }
              currentTypeId = at.elementTypeId
            } else {
              break
            }
          }
          let result: unknown = arr
          for (const idx of indices) {
            if (Array.isArray(result)) {
              result = result[idx]
            } else {
              throw new Error('Array access: not an array')
            }
          }
          let elemTypeId = 'integer'
          let remaining = indices.length
          currentTypeId = arrayValue.typeId
          while (remaining > 0) {
            const td = typeTable.get(currentTypeId)
            if (td && td.kind === 'array') {
              elemTypeId = (td as ArrayType).elementTypeId
              currentTypeId = elemTypeId
              remaining--
            } else {
              break
            }
          }
          if (result === undefined) {
            const td = typeTable.get(elemTypeId)
            if (td && td.kind === 'record') return { typeId: elemTypeId, raw: {} }
            if (td && td.kind === 'array') return { typeId: elemTypeId, raw: [] }
            return { typeId: elemTypeId, raw: 0 }
          }
          return { typeId: elemTypeId, raw: result }
        },
      },

      setIndex: {
        can: (typeId: string) => {
          const typeDef = typeTable.get(typeId)
          if (typeDef && typeDef.kind === 'array') {
            return true
          }
          return false
        },
        invoke: (arrayValue: PascalValue, ...args: PascalValue[]) => {
          const arr = arrayValue.raw as unknown[]
          const value = args[args.length - 1]
          const indices = args.slice(0, args.length - 1).map((iv) => iv.raw as number)

          let currentTypeId = arrayValue.typeId
          for (let i = 0; i < indices.length; i++) {
            const td = typeTable.get(currentTypeId)
            if (td && td.kind === 'array') {
              const at = td as ArrayType
              const dim = at.dimensions[0]
              const idx = indices[i]
              if (idx < dim.low || idx > dim.high) {
                throw new Error(`Array index ${idx} out of range ${dim.low}..${dim.high}`)
              }
              currentTypeId = at.elementTypeId
            } else {
              break
            }
          }

          let target: unknown[] = arr
          for (let i = 0; i < indices.length - 1; i++) {
            const idx = indices[i]
            if (!Array.isArray(target[idx])) {
              target[idx] = []
            }
            target = target[idx] as unknown[]
          }
          const lastIdx = indices[indices.length - 1]
          target[lastIdx] = value.raw

          return arrayValue
        },
      },

      default: {
        can: (typeId: string) => {
          const typeDef = typeTable.get(typeId)
          return typeDef?.kind === 'array'
        },
        invoke: (typeId: string, ctx: RuntimeCtx) => {
          const typeDef = ctx.typeTable.get(typeId)
          if (!typeDef || typeDef.kind !== 'array') {
            throw new Error(`Type ${typeId} is not an array`)
          }
          const arrType = typeDef as ArrayType
          const buildDefault = (tid: string): unknown => {
            const td = ctx.typeTable.get(tid)
            if (!td) return 0
            if (td.kind === 'record') {
              const rt = td as any
              const obj: Record<string, unknown> = {}
              for (const f of rt.fields) {
                obj[f.name] = buildDefault(f.typeId)
              }
              return obj
            }
            if (td.kind === 'array') {
              const at = td as ArrayType
              const dim = at.dimensions[0]
              const result: unknown[] = []
              for (let i = dim.low; i <= dim.high; i++) {
                result[i] = buildDefault(at.elementTypeId)
              }
              return result
            }
            if (td.kind === 'string') return ''
            if (td.kind === 'char') return '\x00'
            if (td.kind === 'boolean') return false
            return 0
          }
          const dim = arrType.dimensions[0]
          const result: unknown[] = []
          for (let i = dim.low; i <= dim.high; i++) {
            result[i] = buildDefault(arrType.elementTypeId)
          }
          return { typeId, raw: result }
        },
      },

      copy: {
        can: (typeId: string) => {
          const typeDef = typeTable.get(typeId)
          return typeDef?.kind === 'array'
        },
        invoke: (value: PascalValue) => {
          const deepCopy = (obj: unknown): unknown => {
            if (Array.isArray(obj)) {
              return obj.map(deepCopy)
            }
            return obj
          }
          return { typeId: value.typeId, raw: deepCopy(value.raw) }
        },
      },

      assign: {
        can: (fromType: string, toType: string) => {
          const fromDef = typeTable.get(fromType)
          const toDef = typeTable.get(toType)
          return fromDef?.kind === 'array' && toDef?.kind === 'array'
        },
        invoke: (dest: PascalValue, src: PascalValue) => {
          const deepCopy = (obj: unknown): unknown => {
            if (Array.isArray(obj)) {
              return obj.map(deepCopy)
            }
            return obj
          }
          return { typeId: src.typeId, raw: deepCopy(src.raw) }
        },
      },
    },
  }
}