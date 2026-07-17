// Array TypePlugin

import type {
  ArrayType,
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
        toCode: (dest: Ref, src: Ref[], ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: ctx.typeId || 'array',
            opName: 'INDEX',
            opKind: 'index',
            dest,
            src,
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (arrayValue: PascalValue, ...indexValues: PascalValue[]) => {
          const arr = arrayValue.raw as unknown[]
          const indices = indexValues.map((iv) => iv.raw as number)
          let result: unknown = arr
          for (const idx of indices) {
            if (Array.isArray(result)) {
              result = result[idx]
            } else {
              throw new Error('Array access: not an array')
            }
          }
          if (result === undefined) {
            return { typeId: 'integer', raw: 0 }
          }
          return { typeId: 'integer', raw: result as number }
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
        toCode: (dest: Ref, src: Ref[], ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: ctx.typeId || 'array',
            opName: 'SET_INDEX',
            opKind: 'setIndex',
            dest,
            src,
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (arrayValue: PascalValue, ...args: PascalValue[]) => {
          const arr = arrayValue.raw as unknown[]
          const value = args[args.length - 1]
          const indices = args.slice(0, args.length - 1).map((iv) => iv.raw as number)
          
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
        invoke: (typeId: string, ctx: RuntimeCtx) => {
          const typeDef = ctx.typeTable.get(typeId)
          if (!typeDef || typeDef.kind !== 'array') {
            throw new Error(`Type ${typeId} is not an array`)
          }
          const arrType = typeDef as ArrayType
          const createArray = (dimensions: typeof arrType.dimensions, dimIndex: number): unknown => {
            if (dimIndex >= dimensions.length) {
              return 0
            }
            const dim = dimensions[dimIndex]
            const result: unknown[] = []
            for (let i = dim.low; i <= dim.high; i++) {
              result[i] = createArray(dimensions, dimIndex + 1)
            }
            return result
          }
          return { typeId, raw: createArray(arrType.dimensions, 0) }
        },
      },

      copy: {
        can: (typeId: string) => {
          const typeDef = typeTable.get(typeId)
          return typeDef?.kind === 'array'
        },
        toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: ctx.typeId || 'array',
            opName: 'copy',
            opKind: 'copy',
            dest,
            src: [src],
            sourcePos: ctx.sourcePos,
          }]
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
    },
  }
}
