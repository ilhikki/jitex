// Set TypePlugin

import type {
  SetType,
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

function makeSetValue(elements: number[]): PascalValue {
  return { typeId: 'set', raw: new Set(elements) }
}

// 将 raw 归一化为 Set<number>（兼容 number[] 和 Set<number>）
function normalizeSet(raw: unknown): Set<number> {
  if (raw instanceof Set) return raw as Set<number>
  if (Array.isArray(raw)) return new Set(raw as number[])
  // 其他情况，返回空集合
  return new Set<number>()
}

export function createSetPlugin(typeTable: TypeTable): TypePlugin {
  return {
    name: 'set',
    version: '1.0.0',
    types: [],
    ops: {
      default: {
        can: (typeId: string, tt: TypeTable) => {
          const td = tt.get(typeId)
          return td?.kind === 'set'
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
        invoke: (typeId: string): PascalValue => {
          return { typeId, raw: new Set<number>() }
        },
      },

      copy: {
        can: (typeId: string, tt: TypeTable) => {
          const td = tt.get(typeId)
          return td?.kind === 'set'
        },
        toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: ctx.typeId || 'set',
            opName: 'copy',
            opKind: 'copy',
            dest,
            src: [src],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (value: PascalValue): PascalValue => {
          const oldSet = normalizeSet(value.raw)
          return { typeId: value.typeId, raw: new Set(oldSet) }
        },
      },

      assign: {
        can: (fromType: string, toType: string, tt: TypeTable) => {
          const toDef = tt.get(toType)
          const fromDef = tt.get(fromType)
          return toDef?.kind === 'set' && fromDef?.kind === 'set'
        },
        toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: ctx.typeId || 'set',
            opName: 'assign',
            opKind: 'assign',
            dest,
            src: [src],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (dest: PascalValue, src: PascalValue): PascalValue => {
          const srcSet = normalizeSet(src.raw)
          return { typeId: dest.typeId, raw: new Set(srcSet) }
        },
      },

      // 集合构造 [1, 2, 3]
      literal: {
        can: (node: any, tt: TypeTable) => {
          // 集合构造表达式在静态分析器中处理，这里不处理
          return null
        },
        toCode: (dest: Ref, node: any, ctx: CodeGenContext): JsonInstruction[] => {
          return []
        },
        invoke: (value: unknown, typeId: string): PascalValue => {
          return { typeId, raw: new Set(value as number[]) }
        },
      },

      binary: {
        UNION: {
          can: (leftType: string, rightType: string, tt: TypeTable) => {
            const ld = tt.get(leftType)
            const rd = tt.get(rightType)
            if (ld?.kind === 'set' && rd?.kind === 'set') return leftType
            return null
          },
          toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
            return [{
              op: 'TYPE_OP',
              typeId: ctx.typeId || 'set',
              opName: 'UNION',
              opKind: 'binary',
              dest,
              src: [left, right],
              sourcePos: ctx.sourcePos,
            }]
          },
          invoke: (left: PascalValue, right: PascalValue): PascalValue => {
            const ls = normalizeSet(left.raw)
            const rs = normalizeSet(right.raw)
            const result = new Set<number>(ls)
            for (const e of rs) result.add(e)
            return { typeId: left.typeId, raw: result }
          },
        },
        INTERSECT: {
          can: (leftType: string, rightType: string, tt: TypeTable) => {
            const ld = tt.get(leftType)
            const rd = tt.get(rightType)
            if (ld?.kind === 'set' && rd?.kind === 'set') return leftType
            return null
          },
          toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
            return [{
              op: 'TYPE_OP',
              typeId: ctx.typeId || 'set',
              opName: 'INTERSECT',
              opKind: 'binary',
              dest,
              src: [left, right],
              sourcePos: ctx.sourcePos,
            }]
          },
          invoke: (left: PascalValue, right: PascalValue): PascalValue => {
            const ls = normalizeSet(left.raw)
            const rs = normalizeSet(right.raw)
            const result = new Set<number>()
            for (const e of ls) {
              if (rs.has(e)) result.add(e)
            }
            return { typeId: left.typeId, raw: result }
          },
        },
        DIFF: {
          can: (leftType: string, rightType: string, tt: TypeTable) => {
            const ld = tt.get(leftType)
            const rd = tt.get(rightType)
            if (ld?.kind === 'set' && rd?.kind === 'set') return leftType
            return null
          },
          toCode: (dest: Ref, left: Ref, right: Ref, ctx: CodeGenContext): JsonInstruction[] => {
            return [{
              op: 'TYPE_OP',
              typeId: ctx.typeId || 'set',
              opName: 'DIFF',
              opKind: 'binary',
              dest,
              src: [left, right],
              sourcePos: ctx.sourcePos,
            }]
          },
          invoke: (left: PascalValue, right: PascalValue): PascalValue => {
            const ls = normalizeSet(left.raw)
            const rs = normalizeSet(right.raw)
            const result = new Set<number>()
            for (const e of ls) {
              if (!rs.has(e)) result.add(e)
            }
            return { typeId: left.typeId, raw: result }
          },
        },
      },

      // IN 运算符
      compare: {
        IN: {
          can: (leftType: string, rightType: string, tt: TypeTable) => {
            const rd = tt.get(rightType)
            if (rd?.kind === 'set') return 'boolean'
            return null
          },
          toCode: (dest: Ref, left: Ref, right: Ref, op: string, ctx: CodeGenContext): JsonInstruction[] => {
            return [{
              op: 'TYPE_OP',
              typeId: ctx.typeId || 'set',
              opName: 'IN',
              opKind: 'compare',
              dest,
              src: [left, right],
              extra: { op },
              sourcePos: ctx.sourcePos,
            }]
          },
          invoke: (left: PascalValue, right: PascalValue, op: string): PascalValue => {
            const set = normalizeSet(right.raw)
            let elem: number
            if (typeof left.raw === 'string') {
              elem = left.raw.charCodeAt(0)
            } else if (typeof left.raw === 'boolean') {
              elem = left.raw ? 1 : 0
            } else {
              elem = left.raw as number
            }
            return { typeId: 'boolean', raw: set.has(elem) }
          },
        },
      },
    },
  }
}
