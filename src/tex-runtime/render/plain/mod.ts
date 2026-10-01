import type { DviConfig } from '../dvi/types.ts'
import { createTfmLookup } from '../tfm.ts'
import { hasGlyph, resolveFont, resolveUnicode } from './fonts.ts'

export interface PlainDviHooks {
  onUnmappedGlyph?: (dviFontName: string, charCode: number) => void
}

export function createPlainDviConfig(
  fonts: Record<string, Uint8Array> = {},
  hooks: PlainDviHooks = {},
): DviConfig {
  const metrics = createTfmLookup(fonts)
  return {
    resolveFont,
    resolveUnicode: (name, code) => {
      if (!hasGlyph(name, code)) {
        hooks.onUnmappedGlyph?.(name, code)
      }
      return resolveUnicode(name, code)
    },
    resolveWidth: (name, code, size) => metrics(name)?.charWidth(code, size),
  }
}
