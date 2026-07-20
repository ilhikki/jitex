// Integer TypePlugin

import type {
  IntegerType,
  PascalValue,
  Ref,
  JsonInstruction,
  TypePlugin,
  TypeTable,
  CodeGenContext,
  RuntimeCtx,
} from './types'

// ============================================================================
// 类型定义
// ============================================================================

export const INTEGER_TYPE: IntegerType = {
  id: 'integer',
  kind: 'integer',
  size: 32,
  signed: true,
}

// 将 number 截断为 32 位有符号整数（模拟 Pascal integer 溢出）
function toInt32(n: number): number {
  return n | 0
}

export function makeIntegerValue(n: number): PascalValue {
  return { typeId: 'integer', raw: toInt32(n) }
}

// ============================================================================
// 插件实现
// ============================================================================

export const integerPlugin: TypePlugin = {
  name: 'integer',
  version: '1.0.0',
  types: [INTEGER_TYPE],
  ops: {
    literal: {
      can: (node: any) => {
        if (node?.kind === 'IntegerLiteral') return 'integer'
        return null
      },
      toCode: (dest: Ref, node: any, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'LITERAL',
          dest,
          typeId: 'integer',
          value: node.value,
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: (value: unknown) => {
        return makeIntegerValue(typeof value === 'number' ? value : Number(value))
      },
    },

    assign: {
      can: (fromType: string, toType: string) => {
        // integer → integer
        if (fromType === 'integer' && toType === 'integer') return true
        // integer → subrange (范围检查由 subrange 插件处理，这里先允许)
        if (fromType === 'integer' && toType !== 'real') return true
        return false
      },
      toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'integer',
          opName: 'assign',
          opKind: 'assign',
          dest,
          src: [src],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: (dest: PascalValue, src: PascalValue) => {
        return makeIntegerValue(src.raw as number)
      },
    },

    unary: {
      NEG: {
        can: (operandType: string) => operandType === 'integer' ? 'integer' : null,
        toCode: (dest: Ref, operand: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'integer',
            opName: 'NEG',
            opKind: 'unary',
            dest,
            src: [operand],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (operand: PascalValue) => {
          return makeIntegerValue(-(operand.raw as number))
        },
      },
      POS: {
        can: (operandType: string) => operandType === 'integer' ? 'integer' : null,
        toCode: (dest: Ref, operand: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'integer',
            opName: 'POS',
            opKind: 'unary',
            dest,
            src: [operand],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (operand: PascalValue) => {
          return makeIntegerValue(operand.raw as number)
        },
      },
    },

    binary: {
      ADD: {
        can: (leftType: string, rightType: string) => {
          if (leftType === 'integer' && rightType === 'integer') return 'integer'
          return null
        },
        toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'integer',
            opName: 'ADD',
            opKind: 'binary',
            dest,
            src: [left, right],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (left: PascalValue, right: PascalValue) => {
          return makeIntegerValue((left.raw as number) + (right.raw as number))
        },
      },
      SUB: {
        can: (leftType: string, rightType: string) => {
          if (leftType === 'integer' && rightType === 'integer') return 'integer'
          return null
        },
        toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'integer',
            opName: 'SUB',
            opKind: 'binary',
            dest,
            src: [left, right],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (left: PascalValue, right: PascalValue) => {
          return makeIntegerValue((left.raw as number) - (right.raw as number))
        },
      },
      MUL: {
        can: (leftType: string, rightType: string) => {
          if (leftType === 'integer' && rightType === 'integer') return 'integer'
          return null
        },
        toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'integer',
            opName: 'MUL',
            opKind: 'binary',
            dest,
            src: [left, right],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (left: PascalValue, right: PascalValue) => {
          return makeIntegerValue((left.raw as number) * (right.raw as number))
        },
      },
      DIV: {
        can: (leftType: string, rightType: string) => {
          if (leftType === 'integer' && rightType === 'integer') return 'integer'
          return null
        },
        toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'integer',
            opName: 'DIV',
            opKind: 'binary',
            dest,
            src: [left, right],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (left: PascalValue, right: PascalValue) => {
          const r = right.raw as number
          if (r === 0) throw new Error('Division by zero')
          return makeIntegerValue(Math.trunc((left.raw as number) / r))
        },
      },
      MOD: {
        can: (leftType: string, rightType: string) => {
          if (leftType === 'integer' && rightType === 'integer') return 'integer'
          return null
        },
        toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'integer',
            opName: 'MOD',
            opKind: 'binary',
            dest,
            src: [left, right],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (left: PascalValue, right: PascalValue) => {
          const r = right.raw as number
          if (r === 0) throw new Error('Division by zero')
          return makeIntegerValue((left.raw as number) - Math.trunc((left.raw as number) / r) * r)
        },
      },
    },

    compare: {
      EQ: {
        can: (leftType: string, rightType: string) => {
          if (leftType === 'integer' && rightType === 'integer') return 'boolean'
          return null
        },
        toCode: (dest: Ref, left: Ref, right: Ref, op: string, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'integer',
            opName: 'EQ',
            opKind: 'compare',
            dest,
            src: [left, right],
            extra: { op },
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (left: PascalValue, right: PascalValue, op: string) => {
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

    control: {
      can: (typeId: string) => typeId === 'integer',
      toCode: (cond: Ref, ctx: CodeGenContext): JsonInstruction[] => {
        // integer 作为控制条件：非 0 为 true
        return [{
          op: 'TYPE_OP',
          typeId: 'integer',
          opName: 'control',
          opKind: 'control',
          dest: cond,
          src: [],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: (value: PascalValue) => {
        return (value.raw as number) !== 0
      },
    },

    default: {
      can: (typeId: string) => typeId === 'integer',
      toCode: (dest: Ref, typeId: string, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'integer',
          opName: 'default',
          opKind: 'default',
          dest,
          src: [],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: () => {
        return makeIntegerValue(0)
      },
    },

    copy: {
      can: (typeId: string) => typeId === 'integer',
      toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'integer',
          opName: 'copy',
          opKind: 'copy',
          dest,
          src: [src],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: (value: PascalValue) => {
        return makeIntegerValue(value.raw as number)
      },
    },
  },
}
