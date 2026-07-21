import type { PascalValue, TypePlugin, TypeTable } from '../types'

export function makeRecordValue(fields: Record<string, unknown>, typeId: string): PascalValue {
  return { typeId, raw: fields }
}

export function createRecordPlugin(_typeTable: TypeTable): TypePlugin {
  return {
    name: 'record',
    version: '1.0.0',
    types: [],
  }
}