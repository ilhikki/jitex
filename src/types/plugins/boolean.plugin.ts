import type { TypePlugin } from '../types'

export const booleanPlugin: TypePlugin = {
  name: 'boolean',
  version: '1.0.0',
  types: [
    { id: 'boolean', kind: 'boolean' }
  ]
}
