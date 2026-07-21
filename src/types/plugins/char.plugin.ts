import type {
  CharType,
  PascalValue,
  TypePlugin,
} from '../types'

export const CHAR_TYPE: CharType = {
  id: 'char',
  kind: 'char',
}

export function makeCharValue(c: string): PascalValue {
  return { typeId: 'char', raw: c }
}

export const charPlugin: TypePlugin = {
  name: 'char',
  version: '1.0.0',
  types: [CHAR_TYPE],
  ops: {
    literal: {
      can: (node: any) => {
        if (node?.kind === 'CharLiteral') return 'char'
        return null
      },
      invoke: (value: unknown) => {
        return makeCharValue(String(value).charAt(0))
      },
    },

    assign: {
      can: (fromType: string, toType: string) => {
        if (fromType === 'char' && toType === 'char') return true
        return false
      },
      invoke: (dest: PascalValue, src: PascalValue) => {
        return makeCharValue(src.raw as string)
      },
    },

    compare: {
      EQ: {
        can: (leftType: string, rightType: string) => {
          if (leftType === 'char' && rightType === 'char') return 'boolean'
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

    default: {
      can: (typeId: string) => typeId === 'char',
      invoke: () => {
        return makeCharValue('\0')
      },
    },

    copy: {
      can: (typeId: string) => typeId === 'char',
      invoke: (value: PascalValue) => {
        return makeCharValue(value.raw as string)
      },
    },
  },
}