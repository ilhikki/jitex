import type { TypePlugin, TypeTable } from '../types'

export function createEnumPlugin(_typeTable: TypeTable): TypePlugin {
  return {
    name: 'enum',
    version: '1.0.0',
    types: [],
  }
}