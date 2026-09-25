import type { DviConfig } from '../dvi/types.ts'
import { isMappedFont, resolveFont, resolveUnicode } from './fonts.ts'

/**
 * 渲染器的回报口。
 *
 * 包内使用：不对公共面暴露对象图（公共面只有纯数据，见 tex-runtime/mod.ts）。
 */
export interface PlainDviHooks {
  /** 遇到没有字符映射的字体名（会退化渲染）；同一字体可能被回报多次 */
  onUnmappedFont?: (dviFontName: string) => void
}

/** plain.tex 的字体/编码映射：CM 字体名 + OT1/cmmi/cmsy/cmex 码位表 */
export function createPlainDviConfig(hooks: PlainDviHooks = {}): DviConfig {
  return {
    resolveFont: (name) => {
      if (!isMappedFont(name)) {
        hooks.onUnmappedFont?.(name)
      }
      return resolveFont(name)
    },
    resolveUnicode,
  }
}
