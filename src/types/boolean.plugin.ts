// Boolean TypePlugin

import type {
  BooleanType,
  PascalValue,
  Ref,
  JsonInstruction,
} from '../vm/jsoncode'
import type {
  TypePlugin,
  CodeGenContext,
  RuntimeCtx,
} from './index'

// ============================================================================
// 类型定义
// ============================================================================

export const BOOLEAN_TYPE: BooleanType = {
  id: 'boolean',
  kind: 'boolean',
}

export function makeBooleanValue(b: boolean): PascalValue {
  return { typeId: 'boolean', raw: b }
}

// ============================================================================
// 插件实现
// ============================================================================

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
      toCode: (dest: Ref, node: any, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'LITERAL',
          dest,
          typeId: 'boolean',
          value: node.value,
          sourcePos: ctx.sourcePos,
        }]
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
      toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'boolean',
          opName: 'assign',
          opKind: 'assign',
          dest,
          src: [src],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: (dest: PascalValue, src: PascalValue) => {
        return makeBooleanValue(src.raw as boolean)
      },
    },

    unary: {
      NOT: {
        can: (operandType: string) => operandType === 'boolean' ? 'boolean' : null,
        toCode: (dest: Ref, operand: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'boolean',
            opName: 'NOT',
            opKind: 'unary',
            dest,
            src: [operand],
            sourcePos: ctx.sourcePos,
          }]
        },
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
        toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'boolean',
            opName: 'AND',
            opKind: 'binary',
            dest,
            src: [left, right],
            sourcePos: ctx.sourcePos,
          }]
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
        toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'boolean',
            opName: 'OR',
            opKind: 'binary',
            dest,
            src: [left, right],
            sourcePos: ctx.sourcePos,
          }]
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
        toCode: (dest: Ref, left: Ref, right: Ref, op: string, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'boolean',
            opName: 'EQ',
            opKind: 'compare',
            dest,
            src: [left, right],
            extra: { op },
            sourcePos: ctx.sourcePos,
          }]
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
      toCode: (cond: Ref, ctx: CodeGenContext): JsonInstruction[] => {
        // boolean 直接作为控制条件，无需转换
        return []
      },
      invoke: (value: PascalValue) => {
        return value.raw as boolean
      },
    },

    default: {
      can: (typeId: string) => typeId === 'boolean',
      toCode: (dest: Ref, typeId: string, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'boolean',
          opName: 'default',
          opKind: 'default',
          dest,
          src: [],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: () => {
        return makeBooleanValue(false)
      },
    },

    copy: {
      can: (typeId: string) => typeId === 'boolean',
      toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'boolean',
          opName: 'copy',
          opKind: 'copy',
          dest,
          src: [src],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: (value: PascalValue) => {
        return makeBooleanValue(value.raw as boolean)
      },
    },
  },
}
