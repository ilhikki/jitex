import type {
  PascalValue,
  TypePlugin,
  TypeTable,
} from './types'

export function createEnumPlugin(typeTable: TypeTable): TypePlugin {
  return {
    name: 'enum',
    version: '1.0.0',
    types: [],
    ops: {
      literal: {
        can: () => null,
        invoke: () => ({ typeId: 'integer', raw: 0 }),
      },

      assign: {
        can: (fromType: string, toType: string, tt: TypeTable) => {
          const fromDef = tt.get(fromType)
          const toDef = tt.get(toType)
          if (fromDef?.kind === 'enum' && toDef?.kind === 'enum' && fromType === toType) return true
          if (fromType === 'integer' && toDef?.kind === 'enum') return true
          if (fromDef?.kind === 'enum' && toType === 'integer') return true
          return false
        },
        invoke: (dest: PascalValue, src: PascalValue): PascalValue => {
          return { typeId: dest.typeId, raw: src.raw as number }
        },
      },

      compare: {
        EQ: {
          can: (leftType: string, rightType: string, tt: TypeTable) => {
            const leftDef = tt.get(leftType)
            const rightDef = tt.get(rightType)
            if (leftDef?.kind === 'enum' && rightDef?.kind === 'enum' && leftType === rightType) return 'boolean'
            return null
          },
          invoke: (left: PascalValue, right: PascalValue, op: string): PascalValue => {
            const l = left.raw as number
            const r = right.raw as number
            let result = false
            switch (op) {
              case '=': result = l === r; break
              case '<>': result = l !== r; break
              case '<': result = l < r; break
              case '<=': result = l <= r; break
              case '>': result = l > r; break
              case '>=': result = l >= r; break
            }
            return { typeId: 'boolean', raw: result }
          },
        },
      },

      default: {
        can: (typeId: string, tt: TypeTable) => {
          const typeDef = tt.get(typeId)
          return typeDef?.kind === 'enum'
        },
        invoke: (typeId: string): PascalValue => {
          return { typeId, raw: 0 }
        },
      },

      copy: {
        can: (typeId: string, tt: TypeTable) => {
          const typeDef = tt.get(typeId)
          return typeDef?.kind === 'enum'
        },
        invoke: (value: PascalValue): PascalValue => {
          return { typeId: value.typeId, raw: value.raw as number }
        },
      },

      control: {
        can: (typeId: string, tt: TypeTable) => {
          const typeDef = tt.get(typeId)
          return typeDef?.kind === 'enum'
        },
        invoke: (value: PascalValue): boolean => {
          return (value.raw as number) !== 0
        },
      },
    },
  }
}
