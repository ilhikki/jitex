import type { TypePlugin, TypeTable } from '../types'

export function createSetPlugin(_typeTable: TypeTable): TypePlugin {
  return {
    name: 'set',
    version: '1.0.0',
    types: [],
  }
}