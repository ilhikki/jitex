import { parseDvi } from './dvi/interpreter.ts'
import { createPlainDviConfig } from './plain/mod.ts'
import { renderPage } from './svg/render.ts'

/**
 * 装配点：DVI 字节流 → 每页一个 SVG 字符串（plain 默认字体/编码映射）。
 *
 * `fonts` 是随发布提供的字体度量（键为 `cmr10.tfm` 这类文件名，值为 TFM 字节）。
 * 给了它，字形位置就按 DVI 规范推进（set_char 之后 h 加上字符宽度）；不给也能跑，
 * 只是位置退化成由渲染端的字体度量承担（见 dvi/types.ts 的 resolveWidth）。
 *
 * 两个参数都是纯数据：公共面不出现可被当成契约的对象图（见 ../mod.ts）。
 */
export function dviToSvg(dvi: Uint8Array, fonts: Record<string, Uint8Array> = {}): string[] {
  return renderDvi(dvi, fonts).svgs
}

/**
 * 包内用：渲染并回报没有字符映射的字体名。
 *
 * 错误在一侧产生就该在一侧报告：渲染层认不得某个字体名时，此处的 missingFonts
 * 把"退化渲染"这件事显式交出去，而不是让调用方看到空白/错字去猜。
 */
export function renderDvi(
  dvi: Uint8Array,
  fonts: Record<string, Uint8Array> = {},
): { svgs: string[]; missingFonts: string[] } {
  const missing = new Set<string>()
  const config = createPlainDviConfig(fonts, { onUnmappedFont: (name) => missing.add(name) })
  const svgs = parseDvi(dvi, config).map(renderPage)
  return { svgs, missingFonts: [...missing].sort() }
}
