import type {
  StringType,
  PascalValue,
  Ref,
  JsonInstruction,
} from '../vm/jsoncode'
import type {
  TypePlugin,
  CodeGenContext,
  RuntimeCtx,
} from './index'

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
      toCode: (dest: Ref, node: any, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'LITERAL',
          dest,
          typeId: 'string',
          value: node.value,
          sourcePos: ctx.sourcePos,
        }]
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
      toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'string',
          opName: 'assign',
          opKind: 'assign',
          dest,
          src: [src],
          sourcePos: ctx.sourcePos,
        }]
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
        toCode: (dest: Ref, left: Ref, right: Ref, op: string, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'string',
            opName: 'EQ',
            opKind: 'compare',
            dest,
            src: [left, right],
            extra: { op },
            sourcePos: ctx.sourcePos,
          }]
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
        toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'string',
            opName: 'CONCAT',
            opKind: 'binary',
            dest,
            src: [left, right],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (left: PascalValue, right: PascalValue) => {
          return makeStringValue((left.raw as string) + (right.raw as string))
        },
      },
    },

    default: {
      can: (typeId: string) => typeId === 'string',
      toCode: (dest: Ref, typeId: string, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'string',
          opName: 'default',
          opKind: 'default',
          dest,
          src: [],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: () => {
        return makeStringValue('')
      },
    },

    copy: {
      can: (typeId: string) => typeId === 'string',
      toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'string',
          opName: 'copy',
          opKind: 'copy',
          dest,
          src: [src],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: (value: PascalValue) => {
        return makeStringValue(value.raw as string)
      },
    },
  },
}