import type { TypePlugin } from '../types'

export const integerPlugin: TypePlugin = {
  name: 'integer',
  version: '1.0.0',
  types: [
    { id: 'integer', kind: 'integer', size: 32, signed: true }
  ]
}
