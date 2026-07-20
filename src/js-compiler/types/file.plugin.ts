// File TypePlugin（句柄模式：file 变量的 raw 是 PascalFile 句柄）

import type {
  FileType,
  PascalValue,
  TypePlugin,
  TypeTable,
  RuntimeCtx,
} from './types'
import { createEmptyFile } from '../file-model'

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
          // file 变量默认值：空 PascalFile 句柄
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
