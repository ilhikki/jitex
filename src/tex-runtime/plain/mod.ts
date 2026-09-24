import type { DviConfig } from '../dvi/types.ts'
import { resolveFont, resolveUnicode } from './fonts.ts'

/** plain.tex 的字体/编码映射：CM 字体名 + OT1/cmmi/cmsy/cmex 码位表 */
export function createPlainDviConfig(): DviConfig {
  return { resolveFont, resolveUnicode }
}
