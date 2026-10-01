const WORD_BYTES = 4

const FIX_WORD_SCALE = 2 ** 20

export interface Tfm {
  charWidth(code: number, scaledSize: number): number
}

export function readTfm(bytes: Uint8Array): Tfm {
  const u16 = (at: number): number => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0)
  const i32 = (at: number): number =>
    ((bytes[at] ?? 0) << 24) | ((bytes[at + 1] ?? 0) << 16) | ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0)

  const lf = u16(0)
  const bc = u16(4)
  const ec = u16(6)
  const nw = u16(8)
  const charCount = ec + 1

  const tailWords = nw + u16(10) + u16(12) + u16(14) + u16(16) + u16(18) + u16(20) + u16(22)
  const charInfoAt = (lf - tailWords - charCount) * WORD_BYTES
  const widthAt = charInfoAt + charCount * WORD_BYTES

  return {
    charWidth(code, scaledSize) {
      if (code < bc || code > ec) {
        return 0
      }
      const widthIndex = bytes[charInfoAt + code * WORD_BYTES] ?? 0

      if (widthIndex >= nw) {
        return 0
      }
      const fix = i32(widthAt + widthIndex * WORD_BYTES)
      return Math.round((fix * scaledSize) / FIX_WORD_SCALE)
    },
  }
}

export function tfmFileName(dviFontName: string): string {
  const base = dviFontName.split('/').pop() ?? dviFontName
  return base.toLowerCase().endsWith('.tfm') ? base.toLowerCase() : `${base.toLowerCase()}.tfm`
}

export type TfmLookup = (dviFontName: string) => Tfm | undefined

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
