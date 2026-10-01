import { parseDvi } from './dvi/interpreter.ts'
import { createPlainDviConfig } from './plain/mod.ts'
import { renderPage } from './svg/render.ts'

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

export function dviToSvg(dvi: Uint8Array, fonts: Record<string, Uint8Array> = {}): string[] {
  return renderDvi(dvi, fonts)
}

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
