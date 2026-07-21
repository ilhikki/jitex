import type { TypePlugin } from '../types'

export const stringPlugin: TypePlugin = {
  name: 'string',
  version: '1.0.0',
  types: [
    { id: 'string', kind: 'string' }
  ]
}
