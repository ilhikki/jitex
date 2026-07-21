import type { PascalValue, TypePlugin, TypeTable } from '../types'

export function makeArrayValue(values: unknown[]): PascalValue {
  return { typeId: 'array', raw: values }
}

export function createArrayPlugin(_typeTable: TypeTable): TypePlugin {
  return {
    name: 'array',
    version: '1.0.0',
    types: [],
  }
}