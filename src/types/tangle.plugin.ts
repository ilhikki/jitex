// TANGLE 插件包：包含 Knuth TANGLE 需要的非标特性
// 这些特性不是 Pascal82 标准，但 TANGLE 使用它们

import type { TypePlugin, TypeTable } from './index'
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

  // 注册 TEXT_TYPE（TANGLE 使用 TEXTFILE = PACKED FILE OF CHAR）
  if (!typeTable.has('text')) {
    typeTable.register(TEXT_TYPE)
  }

  // 返回完整的插件列表：基础类型 + 复合类型
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
