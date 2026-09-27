import type { FontInfo } from '../dvi/types.ts'
import { FONT_TABLE, TABLES } from './encodings.ts'

/*
 * 字体族名 = DVI 字体名的大写（CMR10 / CMMI10 / CMTT10…），由页面通过 fonts.css 的
 * @font-face 提供（字体文件见 resources/fonts/，来源见 resources/README.md）。
 *
 * CM 的每个变体——设计尺寸（cmr7 与 cmr10）、粗体（cmbx10）、斜体（cmti10）、
 * 等宽（cmtt10）——都是**独立字体文件**，所以这里不写 weight / style：一旦写上，
 * 浏览器会去该族里找粗体／斜体变体，找不到就合成伪字形，反而破坏真 CM。
 *
 * 链尾是给"没装我们字体"的机器的兜底：`font-family` 逐字符回退，系统里有 CM 系
 * （LM / CMU）就先用它，最后落到通用族，缺字形时才不会掉到浏览器默认字体上。
 */
const TAIL = `'Latin Modern Roman', 'CMU Serif', serif`
const MONO_TAIL = `'Latin Modern Mono', 'CMU Typewriter Text', monospace`

/** 等宽族的族名（cmvtt10 是"变宽打字机"，不算） */
const MONO_TABLES = new Set(['ot1-tt', 'ot1-tt-italic', 'tex'])

/**
 * 是否有该字体的字符映射。
 *
 * 判据是"这张表里有没有它"，不是名字像不像 cm——见 encodings.ts 的 FONT_TABLE。
 * 其余字体名（manfnt、使用者自带的 tfm…）只能退化渲染，需由调用方显式回报——见
 * createPlainDviConfig 的 onUnmappedFont。
 */
export function isMappedFont(dviFontName: string): boolean {
  return FONT_TABLE[dviFontName.toLowerCase()] !== undefined
}

/** DVI 字体名 → 输出字体（字号 = fnt_def 的 scaled size × scale） */
export function resolveFont(dviFontName: string): FontInfo {
  const table = FONT_TABLE[dviFontName.toLowerCase()]
  const mono = table !== undefined && MONO_TABLES.has(table)
  return { family: `'${dviFontName.toUpperCase()}', ${mono ? MONO_TAIL : TAIL}`, scale: 1 }
}

/**
 * 字符码 → Unicode 码点。
 *
 * 每个字体用自己的编码，所以先按字体名选表（见 encodings.ts，共 10 种）；表项两种形态：
 *   - number：该码位字形的 Unicode 码点。少数字形在 Unicode 里没有身份（cmex10 的尺寸档
 *             与拼装件、OT1 的 suppress…），它们拿到的是**私用区 U+E000 起的保留位**——
 *             合法码点、不与任何真字符冲突，字体里也照着同一个位置放了那个字形。
 *   - null  ：该字体在这个码位上没有字形（TeX 本不该用），按原码直出。
 *
 * 认不出的字体名（不在 FONT_TABLE 里）没有表，同样按原码直出——这类字体本来就该由
 * createPlainDviConfig 的 onUnmappedFont 显式回报。
 */
export function resolveUnicode(dviFontName: string, charCode: number): string | number {
  const table = TABLES[FONT_TABLE[dviFontName.toLowerCase()] ?? '']
  return table?.[charCode] ?? charCode
}

/** 该字体在该码位上有没有字形（没有表、或表项为 null → 没有） */
export function hasGlyph(dviFontName: string, charCode: number): boolean {
  const glyph = TABLES[FONT_TABLE[dviFontName.toLowerCase()] ?? '']?.[charCode]
  return glyph !== null && glyph !== undefined
}
