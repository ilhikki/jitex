/**
 * TFM（TeX font metric）读取：只取字符宽度。
 *
 * 宽度只有一个用途--把 DVI 的 h 按规范推进：`set_char_i` 的语义是
 * "把字符放在 (h,v)，然后 h 加上该字符的宽度"。有了这个量，每个字形的 (h,v)
 * 就是规范意义上的**绝对位置**，渲染端不必再做任何位置补偿或猜测。
 *
 * 只读两张表：char_info 与 width。height/depth/italic/ligature 都不需要。
 */

/** 每个 32 位字的字节数 */
const WORD_BYTES = 4
/** fix_word 的定点基数：值 = n / 2^20 */
const FIX_WORD_SCALE = 2 ** 20

export interface Tfm {
  /** 字符宽度（sp）；字符不在字体内时返回 0 */
  charWidth(code: number, scaledSize: number): number
}

/** 解析 TFM 字节。数据损坏时不抛：读不到的位一律当 0，宽度退化为 0。 */
export function readTfm(bytes: Uint8Array): Tfm {
  const u16 = (at: number): number => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0)
  const i32 = (at: number): number =>
    ((bytes[at] ?? 0) << 24) | ((bytes[at + 1] ?? 0) << 16) | ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0)

  const lf = u16(0)
  const bc = u16(4)
  const ec = u16(6)
  const nw = u16(8)
  const charCount = ec + 1
  // char_info 之后依次是 width/height/depth/italic/lig-kern/kern/ext/param。
  // 这里用文件总长从后往前定 char_info 的起点，而不是用 lh：外层 header
  // （checksum、design size、编码方案…）的长度口径各家实现不一致，不去猜它。
  const tailWords = nw + u16(10) + u16(12) + u16(14) + u16(16) + u16(18) + u16(20) + u16(22)
  const charInfoAt = (lf - tailWords - charCount) * WORD_BYTES
  const widthAt = charInfoAt + charCount * WORD_BYTES

  return {
    charWidth(code, scaledSize) {
      if (code < bc || code > ec) {
        return 0
      }
      const widthIndex = bytes[charInfoAt + code * WORD_BYTES] ?? 0
      // width_index 直接索引宽度表；0 号项就是"无宽度"那一项，无需特判
      if (widthIndex >= nw) {
        return 0
      }
      const fix = i32(widthAt + widthIndex * WORD_BYTES)
      return Math.round((fix * scaledSize) / FIX_WORD_SCALE)
    },
  }
}

/** `cmr10` / `TeXfonts:cmr10` → `cmr10.tfm`（与 texFontKey 的命名一致） */
export function tfmFileName(dviFontName: string): string {
  const base = dviFontName.split('/').pop() ?? dviFontName
  return base.toLowerCase().endsWith('.tfm') ? base.toLowerCase() : `${base.toLowerCase()}.tfm`
}

/** 供 createPlainDviConfig 用：按 DVI 字体名取度量 */
export type TfmLookup = (dviFontName: string) => Tfm | undefined

/** 由「文件名 → 字节」表建一个带缓存的查表函数 */
export function createTfmLookup(fonts: Record<string, Uint8Array>): TfmLookup {
  const cache = new Map<string, Tfm | undefined>()
  return (dviFontName) => {
    if (!cache.has(dviFontName)) {
      const bytes = fonts[tfmFileName(dviFontName)]
      cache.set(dviFontName, bytes === undefined ? undefined : readTfm(bytes))
    }
    return cache.get(dviFontName)
  }
}
