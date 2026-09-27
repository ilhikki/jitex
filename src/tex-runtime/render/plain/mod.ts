import type { DviConfig } from '../dvi/types.ts'
import { createTfmLookup } from '../tfm.ts'
import { hasGlyph, resolveFont, resolveUnicode } from './fonts.ts'

/**
 * 渲染器的回报口。
 *
 * 包内使用：不对公共面暴露对象图（公共面只有纯数据，见 tex-runtime/mod.ts）。
 */
export interface PlainDviHooks {
  /** 报告一个没有字符映射的字形（字体名 + 码位）；同一字形可能被回报多次 */
  onUnmappedGlyph?: (dviFontName: string, charCode: number) => void
}

/**
 * plain.tex 的字体映射：CM 字体名 + OT1/cmmi/cmsy/cmex 码位表 + TFM 字符宽度。
 *
 * `fonts` 是随发布提供的度量源（键为 `cmr10.tfm` 这类文件名）。缺了它同样能跑，
 * 只是 h 不推进——位置退化成"整段交给渲染端的字体度量"。
 */
export function createPlainDviConfig(
  fonts: Record<string, Uint8Array> = {},
  hooks: PlainDviHooks = {},
): DviConfig {
  const metrics = createTfmLookup(fonts)
  return {
    resolveFont,
    resolveUnicode: (name, code) => {
      if (!hasGlyph(name, code)) {
        hooks.onUnmappedGlyph?.(name, code)
      }
      return resolveUnicode(name, code)
    },
    resolveWidth: (name, code, size) => metrics(name)?.charWidth(code, size),
  }
}
