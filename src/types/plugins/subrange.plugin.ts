import type { TypePlugin, TypeTable } from '../types'

export function createSubrangePlugin(_typeTable: TypeTable): TypePlugin {
  return {
    name: 'subrange',
    version: '1.0.0',
    types: [],
  }
}