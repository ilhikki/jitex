import type {
  CharType,
  PascalValue,
  Ref,
  JsonInstruction,
  TypePlugin,
  CodeGenContext,
  RuntimeCtx,
} from './types'

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
      toCode: (dest: Ref, node: any, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'LITERAL',
          dest,
          typeId: 'char',
          value: node.value,
          sourcePos: ctx.sourcePos,
        }]
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
      toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'char',
          opName: 'assign',
          opKind: 'assign',
          dest,
          src: [src],
          sourcePos: ctx.sourcePos,
        }]
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
        toCode: (dest: Ref, left: Ref, right: Ref, op: string, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: 'char',
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

    default: {
      can: (typeId: string) => typeId === 'char',
      toCode: (dest: Ref, typeId: string, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'char',
          opName: 'default',
          opKind: 'default',
          dest,
          src: [],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: () => {
        return makeCharValue('\0')
      },
    },

    copy: {
      can: (typeId: string) => typeId === 'char',
      toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
        return [{
          op: 'TYPE_OP',
          typeId: 'char',
          opName: 'copy',
          opKind: 'copy',
          dest,
          src: [src],
          sourcePos: ctx.sourcePos,
        }]
      },
      invoke: (value: PascalValue) => {
        return makeCharValue(value.raw as string)
      },
    },
  },
}