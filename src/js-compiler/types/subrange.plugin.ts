import type {
  SubrangeType,
  PascalValue,
  Ref,
  JsonInstruction,
  TypePlugin,
  TypeTable,
  CodeGenContext,
  RuntimeCtx,
} from './types'

export function createSubrangePlugin(typeTable: TypeTable): TypePlugin {
  return {
    name: 'subrange',
    version: '1.0.0',
    types: [],
    ops: {
      default: {
        can: (typeId: string, tt: TypeTable) => {
          const td = tt.get(typeId)
          return td?.kind === 'subrange'
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
        invoke: (typeId: string, runtime: RuntimeCtx): PascalValue => {
          const td = runtime.typeTable.get(typeId)
          if (!td || td.kind !== 'subrange') {
            throw new Error(`Type ${typeId} is not a subrange`)
          }
          const st = td as SubrangeType
          return { typeId, raw: st.min }
        },
      },

      copy: {
        can: (typeId: string, tt: TypeTable) => {
          const td = tt.get(typeId)
          return td?.kind === 'subrange'
        },
        toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: ctx.typeId || 'subrange',
            opName: 'copy',
            opKind: 'copy',
            dest,
            src: [src],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (value: PascalValue): PascalValue => {
          return { typeId: value.typeId, raw: value.raw }
        },
      },

      assign: {
        can: (fromType: string, toType: string, tt: TypeTable) => {
          const toDef = tt.get(toType)
          if (!toDef || toDef.kind !== 'subrange') return false
          const fromDef = tt.get(fromType)
          if (!fromDef) return false
          if (fromDef.kind === 'integer' || fromDef.kind === 'subrange' ||
              fromDef.kind === 'char' || fromDef.kind === 'boolean' ||
              fromDef.kind === 'enum') {
            return true
          }
          return false
        },
        toCode: (dest: Ref, src: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: ctx.typeId || 'subrange',
            opName: 'assign',
            opKind: 'assign',
            dest,
            src: [src],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (dest: PascalValue, src: PascalValue, runtime: RuntimeCtx): PascalValue => {
          const destType = runtime.typeTable.get(dest.typeId)
          if (!destType || destType.kind !== 'subrange') {
            throw new Error(`Destination type ${dest.typeId} is not a subrange`)
          }
          const st = destType as SubrangeType
          let val: number
          if (st.baseTypeId === 'char') {
            val = typeof src.raw === 'string' ? src.raw.charCodeAt(0) : src.raw as number
          } else if (st.baseTypeId === 'boolean') {
            val = typeof src.raw === 'boolean' ? (src.raw ? 1 : 0) : src.raw as number
          } else {
            val = src.raw as number
          }
          if (val < st.min || val > st.max) {
            throw new Error(`Value ${val} out of range ${st.min}..${st.max}`)
          }
          return { typeId: dest.typeId, raw: val }
        },
      },

      control: {
        can: (typeId: string, tt: TypeTable) => {
          const td = tt.get(typeId)
          return td?.kind === 'subrange'
        },
        toCode: (cond: Ref, ctx: CodeGenContext): JsonInstruction[] => {
          return [{
            op: 'TYPE_OP',
            typeId: ctx.typeId || 'subrange',
            opName: 'control',
            opKind: 'control',
            dest: cond,
            src: [cond],
            sourcePos: ctx.sourcePos,
          }]
        },
        invoke: (value: PascalValue): boolean => {
          return !!value.raw
        },
      },
    },
  }
}
