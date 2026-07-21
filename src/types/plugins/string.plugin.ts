import type {
  StringType,
  PascalValue,
  TypePlugin,
} from '../types'

export const STRING_TYPE: StringType = {
  id: 'string',
  kind: 'string',
}

export function makeStringValue(s: string): PascalValue {
  return { typeId: 'string', raw: s }
}

export const stringPlugin: TypePlugin = {
  name: 'string',
  version: '1.0.0',
  types: [STRING_TYPE],
  ops: {
    literal: {
      can: (node: any) => {
        if (node?.kind === 'StringLiteral') return 'string'
        return null
      },
      invoke: (value: unknown) => {
        return makeStringValue(String(value))
      },
    },

    assign: {
      can: (fromType: string, toType: string) => {
        if (fromType === 'string' && toType === 'string') return true
        return false
      },
      invoke: (dest: PascalValue, src: PascalValue) => {
        return makeStringValue(src.raw as string)
      },
    },

    compare: {
      EQ: {
        can: (leftType: string, rightType: string) => {
          if (leftType === 'string' && rightType === 'string') return 'boolean'
          return null
        },
        invoke: (left: PascalValue, right: PascalValue, op: string) => {
          const l = left.raw as string
          const r = right.raw as string
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

    binary: {
      CONCAT: {
        can: (leftType: string, rightType: string) => {
          if (leftType === 'string' && rightType === 'string') return 'string'
          return null
        },
        invoke: (left: PascalValue, right: PascalValue) => {
          return makeStringValue((left.raw as string) + (right.raw as string))
        },
      },
    },

    default: {
      can: (typeId: string) => typeId === 'string',
      invoke: () => {
        return makeStringValue('')
      },
    },

    copy: {
      can: (typeId: string) => typeId === 'string',
      invoke: (value: PascalValue) => {
        return makeStringValue(value.raw as string)
      },
    },
  },
}