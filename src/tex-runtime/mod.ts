import type { DviConfig } from './dvi/types.ts'
import { parseDvi } from './dvi/interpreter.ts'
import { renderPage } from './svg/render.ts'

// 对外导出 = 跨包消费面：只有被其它项目（boot-tex）实际引用的名字才在此导出。
// parseDvi / renderPage / DviConfig 等是 dviToSvg 的内部件，留在各自模块里，
// 等真有跨包使用方时再导出。

export { createPlainDviConfig } from './plain/mod.ts'

/** 装配点：DVI 字节流 → 每页一个 SVG 字符串 */
export function dviToSvg(dvi: Uint8Array, config: DviConfig): string[] {
  return parseDvi(dvi, config).map(renderPage)
}
