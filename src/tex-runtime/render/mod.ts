import { parseDvi } from './dvi/interpreter.ts'
import { createPlainDviConfig } from './plain/mod.ts'
import { renderPage } from './svg/render.ts'

/**
 * 装配点：DVI 字节流 → 每页一个 SVG 字符串（plain 默认字体/编码映射）。
 *
 * 单参、无配置对象：字体/编码映射是内部件，公共面只出现纯数据（见 ../mod.ts）。
 */
export function dviToSvg(dvi: Uint8Array): string[] {
  return renderDvi(dvi).svgs
}

/**
 * 包内用：渲染并回报没有字符映射的字体名。
 *
 * 错误在一侧产生就该在一侧报告：渲染层认不得某个字体名时，此处的 missingFonts
 * 把"退化渲染"这件事显式交出去，而不是让调用方看到空白/错字去猜。
 */
export function renderDvi(dvi: Uint8Array): { svgs: string[]; missingFonts: string[] } {
  const missing = new Set<string>()
  const config = createPlainDviConfig({ onUnmappedFont: (name) => missing.add(name) })
  const svgs = parseDvi(dvi, config).map(renderPage)
  return { svgs, missingFonts: [...missing].sort() }
}
