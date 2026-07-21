import type { TypePlugin } from '../types'

export const realPlugin: TypePlugin = {
  name: 'real',
  version: '1.0.0',
  types: [
    { id: 'real', kind: 'real', size: 64 }
  ]
}
