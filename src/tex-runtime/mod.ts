import type { DviConfig } from './dvi/types.ts'
import { parseDvi } from './dvi/interpreter.ts'
import { renderPage } from './svg/render.ts'

export type { Color, Drawable, DviConfig, FontInfo, Page } from './dvi/types.ts'
export { parseDvi } from './dvi/interpreter.ts'
export { renderPage } from './svg/render.ts'
export { createPlainDviConfig } from './plain/mod.ts'

/** 装配点：DVI 字节流 → 每页一个 SVG 字符串 */
export function dviToSvg(dvi: Uint8Array, config: DviConfig): string[] {
  return parseDvi(dvi, config).map(renderPage)
}
