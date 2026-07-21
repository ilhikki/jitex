import type { TypePlugin, TypeTable } from '../types'
import { TEXT_TYPE } from './file.plugin'
import { createArrayPlugin } from './array.plugin'
import { createRecordPlugin } from './record.plugin'
import { createEnumPlugin } from './enum.plugin'
import { createSubrangePlugin } from './subrange.plugin'
import { createSetPlugin } from './set.plugin'
import { createFilePlugin } from './file.plugin'
import { integerPlugin } from './integer.plugin'
import { booleanPlugin } from './boolean.plugin'
import { charPlugin } from './char.plugin'
import { realPlugin } from './real.plugin'

export interface TanglePluginOptions {
  typeTable: TypeTable
}

export function createTanglePlugin(options: TanglePluginOptions): TypePlugin[] {
  const { typeTable } = options

  if (!typeTable.has('text')) {
    typeTable.register(TEXT_TYPE)
  }

  return [
    integerPlugin,
    booleanPlugin,
    charPlugin,
    realPlugin,
    createArrayPlugin(typeTable),
    createRecordPlugin(typeTable),
    createEnumPlugin(typeTable),
    createSubrangePlugin(typeTable),
    createSetPlugin(typeTable),
    createFilePlugin(typeTable),
  ]
}

export const tanglePlugins = createTanglePlugin