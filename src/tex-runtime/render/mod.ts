import { parseDvi } from './dvi/interpreter.ts'
import { createPlainDviConfig } from './plain/mod.ts'
import { renderPage } from './svg/render.ts'

/**
 * 缺字符映射：DVI 用到了渲染器没有编码表的字体。
 *
 * 这类字形画不出来（位置也无从按规范推进），所以不做退化渲染，直接失败——
 * `fonts` 里带齐所有出问题的字体名与码位，便于一次看清全部缺口。
 */
export class UnmappedFontError extends Error {
  readonly fonts: { name: string; charCodes: number[] }[]

  constructor(fonts: { name: string; charCodes: number[] }[]) {
    super(
      `unmapped font(s): ${fonts.map((f) => `${f.name} [${f.charCodes.join(',')}]`).join('; ')}`,
    )
    this.name = 'UnmappedFontError'
    this.fonts = fonts
  }
}

/** 装配点：DVI 字节流 → 每页一个 SVG 字符串（plain 默认字体/编码映射） */
export function dviToSvg(dvi: Uint8Array, fonts: Record<string, Uint8Array> = {}): string[] {
  return renderDvi(dvi, fonts)
}

/**
 * 渲染一个 DVI；缺字符映射就抛 `UnmappedFontError`。
 *
 * 收集发生在解释阶段、抛在解释之后——这样一次能报出所有缺口的字体与码位，
 * 而不是撞见第一个就中断。`fonts` 是随发布提供的度量源（键为 `cmr10.tfm` 这类文件名）。
 */
export function renderDvi(dvi: Uint8Array, fonts: Record<string, Uint8Array> = {}): string[] {
  const missing = new Map<string, Set<number>>()
  const config = createPlainDviConfig(fonts, {
    onUnmappedGlyph: (name, code) => {
      const codes = missing.get(name)
      if (codes === undefined) {
        missing.set(name, new Set([code]))
      } else {
        codes.add(code)
      }
    },
  })
  const pages = parseDvi(dvi, config)
  if (missing.size > 0) {
    throw new UnmappedFontError(
      [...missing].map(([name, codes]) => ({ name, charCodes: [...codes].sort((a, b) => a - b) })),
    )
  }
  return pages.map(renderPage)
}
