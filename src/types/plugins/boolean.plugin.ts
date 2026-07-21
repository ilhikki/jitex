import type {
  BooleanType,
  PascalValue,
  TypePlugin,
} from '../types'

export const BOOLEAN_TYPE: BooleanType = {
  id: 'boolean',
  kind: 'boolean',
}

export function makeBooleanValue(b: boolean): PascalValue {
  return { typeId: 'boolean', raw: b }
}

export const booleanPlugin: TypePlugin = {
  name: 'boolean',
  version: '1.0.0',
  types: [BOOLEAN_TYPE],
  ops: {
    literal: {
      can: (node: any) => {
        if (node?.kind === 'BooleanLiteral') return 'boolean'
        return null
      },
      invoke: (value: unknown) => {
        return makeBooleanValue(Boolean(value))
      },
    },

    assign: {
      can: (fromType: string, toType: string) => {
        if (fromType === 'boolean' && toType === 'boolean') return true
        return false
      },
      invoke: (dest: PascalValue, src: PascalValue) => {
        return makeBooleanValue(src.raw as boolean)
      },
    },

    unary: {
      NOT: {
        can: (operandType: string) => operandType === 'boolean' ? 'boolean' : null,
        invoke: (operand: PascalValue) => {
          return makeBooleanValue(!(operand.raw as boolean))
        },
      },
    },

    binary: {
      AND: {
        can: (leftType: string, rightType: string) => {
          if (leftType === 'boolean' && rightType === 'boolean') return 'boolean'
          return null
        },
        invoke: (left: PascalValue, right: PascalValue) => {
          return makeBooleanValue((left.raw as boolean) && (right.raw as boolean))
        },
      },
      OR: {
        can: (leftType: string, rightType: string) => {
          if (leftType === 'boolean' && rightType === 'boolean') return 'boolean'
          return null
        },
        invoke: (left: PascalValue, right: PascalValue) => {
          return makeBooleanValue((left.raw as boolean) || (right.raw as boolean))
        },
      },
    },

    compare: {
      EQ: {
        can: (leftType: string, rightType: string) => {
          if (leftType === 'boolean' && rightType === 'boolean') return 'boolean'
          return null
        },
        invoke: (left: PascalValue, right: PascalValue, op: string) => {
          const l = left.raw as boolean
          const r = right.raw as boolean
          let result = false
          switch (op) {
            case '=': result = l === r; break
            case '<>': result = l !== r; break
            case '<': result = !l && r; break
            case '<=': result = !l || r; break
            case '>': result = l && !r; break
            case '>=': result = l || !r; break
          }
          return makeBooleanValue(result)
        },
      },
    },

    control: {
      can: (typeId: string) => typeId === 'boolean',
      invoke: (value: PascalValue) => {
        return value.raw as boolean
      },
    },

    default: {
      can: (typeId: string) => typeId === 'boolean',
      invoke: () => {
        return makeBooleanValue(false)
      },
    },

    copy: {
      can: (typeId: string) => typeId === 'boolean',
      invoke: (value: PascalValue) => {
        return makeBooleanValue(value.raw as boolean)
      },
    },
  },
}