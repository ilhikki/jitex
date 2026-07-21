import type { FileType, TypePlugin, TypeTable } from '../types'

export const TEXT_TYPE: FileType = {
  id: 'text',
  kind: 'file',
}

export function createFilePlugin(_typeTable: TypeTable): TypePlugin {
  return {
    name: 'file',
    version: '1.0.0',
    types: [TEXT_TYPE],
  }
}