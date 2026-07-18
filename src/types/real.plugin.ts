// Real TypePlugin

import type {
  RealType,
  PascalValue,
  Ref,
  JsonInstruction,
} from '../vm/jsoncode'
import type {
  TypePlugin,
  CodeGenContext,
} from './index'

export const REAL_TYPE: RealType = {
  id: 'real',
  kind: 'real',
  size: 64,
}

export function makeRealValue(n: number): PascalValue {
  return { typeId: 'real', raw: n }
}

export const realPlugin: TypePlugin = {
  name: 'real',
  version: '1.0.0',
  types: [REAL_TYPE],
  ops: {
    assign: {
      can: (fromType: string, toType: string) => {
        // real → real
        if (fromType === 'real' && toType === 'real') return true
        // integer → real（隐式转换）
        if (fromType === 'integer' && toType === 'real') return true
        return false
      },
      toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'real',
          opName: 'assign',
          opKind: 'assign',
          dest,
          src: [src],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: (dest: PascalValue, src: PascalValue) => {
        return makeRealValue(Number(src.raw))
      },
    },

    unary: {
      NEG: {
        can: (operandType: string) => operandType === 'real' ? 'real' : null,
        toCode: (dest: Ref, operand: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'real',
            opName: 'NEG',
            opKind: 'unary',
            dest,
            src: [operand],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (operand: PascalValue) => {
          return makeRealValue(-(operand.raw as number))
        },
      },
    },

    binary: {
      ADD: {
        can: (leftType: string, rightType: string) => {
          if ((leftType === 'real' || leftType === 'integer') &&
              (rightType === 'real' || rightType === 'integer')) return 'real'
          return null
        },
        toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'real',
            opName: 'ADD',
            opKind: 'binary',
            dest,
            src: [left, right],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (left: PascalValue, right: PascalValue) => {
          return makeRealValue(Number(left.raw) + Number(right.raw))
        },
      },
      SUB: {
        can: (leftType: string, rightType: string) => {
          if ((leftType === 'real' || leftType === 'integer') &&
              (rightType === 'real' || rightType === 'integer')) return 'real'
          return null
        },
        toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'real',
            opName: 'SUB',
            opKind: 'binary',
            dest,
            src: [left, right],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (left: PascalValue, right: PascalValue) => {
          return makeRealValue(Number(left.raw) - Number(right.raw))
        },
      },
      MUL: {
        can: (leftType: string, rightType: string) => {
          if ((leftType === 'real' || leftType === 'integer') &&
              (rightType === 'real' || rightType === 'integer')) return 'real'
          return null
        },
        toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'real',
            opName: 'MUL',
            opKind: 'binary',
            dest,
            src: [left, right],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (left: PascalValue, right: PascalValue) => {
          return makeRealValue(Number(left.raw) * Number(right.raw))
        },
      },
      DIV: {
        can: (leftType: string, rightType: string) => {
          if ((leftType === 'real' || leftType === 'integer') &&
              (rightType === 'real' || rightType === 'integer')) return 'real'
          return null
        },
        toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'real',
            opName: 'DIV',
            opKind: 'binary',
            dest,
            src: [left, right],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (left: PascalValue, right: PascalValue) => {
          const r = Number(right.raw)
          if (r === 0) throw new Error('Division by zero')
          return makeRealValue(Number(left.raw) / r)
        },
      },
    },

    compare: {
      EQ: {
        can: (leftType: string, rightType: string) => {
          if ((leftType === 'real' || leftType === 'integer') &&
              (rightType === 'real' || rightType === 'integer')) return 'boolean'
          return null
        },
        toCode: (dest: Ref, left: Ref, right: Ref, op: string, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'real',
            opName: 'EQ',
            opKind: 'compare',
            dest,
            src: [left, right],
            extra: { op },
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (left: PascalValue, right: PascalValue, op: string) => {
          const l = Number(left.raw)
          const r = Number(right.raw)
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
      can: (typeId: string) => typeId === 'real',
      toCode: (dest: Ref, typeId: string, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'real',
          opName: 'default',
          opKind: 'default',
          dest,
          src: [],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: () => {
        return makeRealValue(0)
      },
    },

    copy: {
      can: (typeId: string) => typeId === 'real',
      toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'real',
          opName: 'copy',
          opKind: 'copy',
          dest,
          src: [src],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: (value: PascalValue) => {
        return makeRealValue(Number(value.raw))
      },
    },
  },
}
