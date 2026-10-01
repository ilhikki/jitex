export type Color =
  | { model: 'rgb'; r: number; g: number; b: number }
  | { model: 'cmyk'; c: number; m: number; y: number; k: number }
  | { model: 'gray'; v: number }

export interface FontInfo {
  family: string

  scale: number

  weight?: string

  style?: string
}

export interface DviConfig {
  resolveFont(dviFontName: string): FontInfo

  resolveUnicode(dviFontName: string, charCode: number): string | number

  resolveWidth?(dviFontName: string, charCode: number, size: number): number | undefined
}

export type Drawable =
  | {
    kind: 'glyph'

    x: number
    y: number

    continues: boolean
    text: string
    family: string
    size: number
    color: Color
    weight?: string
    style?: string
  }
  | {
    kind: 'rule'

    x: number
    y: number
    w: number
    h: number
    color: Color
  }
  | { kind: 'special'; x: number; y: number; content: string }

export interface Page {
  x: number
  y: number
  width: number
  height: number
  background?: Color
  drawables: Drawable[]
}
