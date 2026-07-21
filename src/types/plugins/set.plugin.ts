import type {
  PascalValue,
  TypePlugin,
  TypeTable,
} from '../types'

function makeSetValue(elements: number[]): PascalValue {
  return { typeId: 'set', raw: new Set(elements) }
}

function normalizeSet(raw: unknown): Set<number> {
  if (raw instanceof Set) return raw as Set<number>
  if (Array.isArray(raw)) return new Set(raw as number[])
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
        invoke: (typeId: string): PascalValue => {
          return { typeId, raw: new Set<number>() }
        },
      },

      copy: {
        can: (typeId: string, tt: TypeTable) => {
          const td = tt.get(typeId)
          return td?.kind === 'set'
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
        invoke: (dest: PascalValue, src: PascalValue): PascalValue => {
          const srcSet = normalizeSet(src.raw)
          return { typeId: dest.typeId, raw: new Set(srcSet) }
        },
      },

      literal: {
        can: (node: any, tt: TypeTable) => {
          return null
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

      compare: {
        IN: {
          can: (leftType: string, rightType: string, tt: TypeTable) => {
            const rd = tt.get(rightType)
            if (rd?.kind === 'set') return 'boolean'
            return null
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