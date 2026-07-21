import type {
  FileType,
  PascalValue,
  TypePlugin,
  TypeTable,
  RuntimeCtx,
} from '../types'
import { createEmptyFile } from '../../runtime/file-model'

export const TEXT_TYPE: FileType = {
  id: 'text',
  kind: 'file',
}

export function createFilePlugin(typeTable: TypeTable): TypePlugin {
  return {
    name: 'file',
    version: '1.0.0',
    types: [TEXT_TYPE],
    ops: {
      default: {
        can: (typeId: string, tt: TypeTable) => {
          const td = tt.get(typeId)
          return td?.kind === 'file'
        },
        invoke: (typeId: string, ctx: RuntimeCtx): PascalValue => {
          return { typeId, raw: createEmptyFile() }
        },
      },

      copy: {
        can: (typeId: string, tt: TypeTable) => {
          const td = tt.get(typeId)
          return td?.kind === 'file'
        },
        invoke: (value: PascalValue): PascalValue => {
          return { typeId: value.typeId, raw: value.raw }
        },
      },

      assign: {
        can: (fromType: string, toType: string, tt: TypeTable) => {
          const toDef = tt.get(toType)
          const fromDef = tt.get(fromType)
          return toDef?.kind === 'file' && fromDef?.kind === 'file'
        },
        invoke: (dest: PascalValue, src: PascalValue): PascalValue => {
          return { typeId: dest.typeId, raw: src.raw }
        },
      },
    },
  }
}