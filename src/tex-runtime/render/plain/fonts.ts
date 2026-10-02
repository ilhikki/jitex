import type { FontInfo } from '../dvi/types.ts'
import { FONT_TABLE, TABLES } from './encodings.ts'

export const FONT_PREFIX = 'jitex-'

const TAIL = `'Latin Modern Roman', 'CMU Serif', serif`
const MONO_TAIL = `'Latin Modern Mono', 'CMU Typewriter Text', monospace`

const MONO_TABLES = new Set(['ot1-tt', 'ot1-tt-italic', 'tex'])

export function isMappedFont(dviFontName: string): boolean {
  return FONT_TABLE[dviFontName.toLowerCase()] !== undefined
}

export function resolveFont(dviFontName: string): FontInfo {
  const table = FONT_TABLE[dviFontName.toLowerCase()]
  const mono = table !== undefined && MONO_TABLES.has(table)
  return { family: `'${(FONT_PREFIX + dviFontName).toUpperCase()}', ${mono ? MONO_TAIL : TAIL}`, scale: 1 }
}

export function resolveUnicode(dviFontName: string, charCode: number): string | number {
  const table = TABLES[FONT_TABLE[dviFontName.toLowerCase()] ?? '']
  return table?.[charCode] ?? charCode
}

export function hasGlyph(dviFontName: string, charCode: number): boolean {
  const glyph = TABLES[FONT_TABLE[dviFontName.toLowerCase()] ?? '']?.[charCode]
  return glyph !== null && glyph !== undefined
}
