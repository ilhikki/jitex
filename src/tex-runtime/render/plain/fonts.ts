import type { FontInfo } from '../dvi/types.ts'
import { cmexToUnicode, cmmiToUnicode, cmsyToUnicode } from './math.ts'
import { ot1ToUnicode } from './ot1.ts'

// 第一版用浏览器自带的字体族；装上 CM 字体后换掉这里即可
const SERIF = 'serif'
const SANS = 'sans-serif'
const MONO = 'monospace'

/**
 * 是否有该字体的字符映射。
 *
 * CM 家族走本目录的 OT1 / 数学表；其余字体名（manfnt、使用者自带的 tfm…）只能退化渲染，
 * 需由调用方显式回报——见 createPlainDviConfig 的 onUnmappedFont。
 */
export function isMappedFont(dviFontName: string): boolean {
  return /^cm/.test(dviFontName.toLowerCase())
}

/** DVI 字体名 → 输出字体（字号由 fnt_def 的 scaled size 决定，scale 恒为 1） */
export function resolveFont(dviFontName: string): FontInfo {
  const name = dviFontName.toLowerCase()
  const family = /^cmtt|^cmsltt|^cmvtt|^cmtex/.test(name) ? MONO : /^cmss/.test(name) ? SANS : SERIF
  const info: FontInfo = { family, scale: 1 }
  if (/bx|bsy|^cmb\d|cmmib|bold/.test(name)) {
    info.weight = 'bold'
  }
  if (/sl|ti|itt|^cmu\d|ssi\d/.test(name)) {
    info.style = 'italic'
  }
  return info
}

/** 字符码 → Unicode 码点；未覆盖的码位按原码返回 */
export function resolveUnicode(dviFontName: string, charCode: number): string | number {
  const name = dviFontName.toLowerCase()
  const point = /^cmmi/.test(name)
    ? cmmiToUnicode(charCode)
    : /^cmsy/.test(name)
    ? cmsyToUnicode(charCode)
    : /^cmex/.test(name)
    ? cmexToUnicode(charCode)
    : ot1ToUnicode(charCode)
  return point ?? charCode
}
