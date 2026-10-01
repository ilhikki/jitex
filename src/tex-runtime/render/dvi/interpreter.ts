import type { Color, Drawable, DviConfig, Page } from './types.ts'
import { DviReader } from './reader.ts'

const SP_PER_PT = 65536

const ASCENT = 0.75
const DESCENT = 0.25
const AVG_WIDTH = 0.5

const BLACK: Color = { model: 'gray', v: 0 }

const textDecoder = new TextDecoder()

interface FontEntry {
  dviName: string
  family: string

  size: number

  sizeSp: number
  weight?: string
  style?: string
}

interface StackEntry {
  h: number
  v: number
  w: number
  x: number
  y: number
  z: number
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface PendingPage {
  declaredWidth: number
  declaredHeight: number
  box: Box | undefined
  background: Color | undefined
  drawables: Drawable[]
}

export function parseDvi(data: Uint8Array, config: DviConfig): Page[] {
  return new Interpreter(data, config).run()
}

class Interpreter {
  private readonly reader: DviReader
  private readonly config: DviConfig
  private readonly pending: PendingPage[] = []
  private readonly fonts = new Map<number, FontEntry>()
  private readonly stack: StackEntry[] = []

  private colors: Color[] = [BLACK]
  private background: Color | undefined
  private drawables: Drawable[] = []
  private open = false
  private finished = false
  private preSeen = false
  private lastBopOffset = -1

  private pageWidth = 0
  private pageHeight = 0

  private postWidth = 0
  private postHeight = 0

  private h = 0
  private v = 0
  private w = 0
  private x = 0
  private y = 0
  private z = 0
  private font = -1

  private lastEndH: number | undefined
  private lastEndV: number | undefined

  constructor(data: Uint8Array, config: DviConfig) {
    this.reader = new DviReader(data)
    this.config = config
  }

  run(): Page[] {
    while (!this.reader.atEnd && !this.finished) {
      this.command(this.reader.readUnsigned(1))
    }
    if (this.open) {
      throw new Error('dvi: file ends inside a page (missing eop)')
    }
    if (!this.preSeen) {
      throw new Error('dvi: missing preamble (pre)')
    }
    return this.finalize()
  }

  private command(code: number): void {
    if (code < 128) {
      this.setChar(code)
      return
    }

    if (code >= 171 && code <= 234) {
      this.font = code - 171
      return
    }
    if (code >= 128 && code <= 131) {
      this.setChar(this.reader.readUnsigned(code - 127))
      return
    }
    if (code === 132) {
      this.setRule(this.reader.readSigned(4), this.reader.readSigned(4))
      return
    }
    if (code >= 133 && code <= 136) {
      this.putChar(this.reader.readUnsigned(code - 132))
      return
    }
    if (code === 137) {
      this.putRule(this.reader.readSigned(4), this.reader.readSigned(4))
      return
    }
    if (code === 138) {
      return
    }
    if (code === 139) {
      this.bop()
      return
    }
    if (code === 140) {
      this.eop()
      return
    }
    if (code === 141) {
      this.push()
      return
    }
    if (code === 142) {
      this.pop()
      return
    }
    if (code >= 143 && code <= 146) {
      this.h += this.reader.readSigned(code - 142)
      return
    }

    if (code === 147) {
      this.h += this.w
      return
    }
    if (code >= 148 && code <= 151) {
      this.w = this.reader.readSigned(code - 147)
      this.h += this.w
      return
    }
    if (code === 152) {
      this.h += this.x
      return
    }
    if (code >= 153 && code <= 156) {
      this.x = this.reader.readSigned(code - 152)
      this.h += this.x
      return
    }
    if (code >= 157 && code <= 160) {
      this.v += this.reader.readSigned(code - 156)
      return
    }
    if (code === 161) {
      this.v += this.y
      return
    }
    if (code >= 162 && code <= 165) {
      this.y = this.reader.readSigned(code - 161)
      this.v += this.y
      return
    }
    if (code === 166) {
      this.v += this.z
      return
    }
    if (code >= 167 && code <= 170) {
      this.z = this.reader.readSigned(code - 166)
      this.v += this.z
      return
    }
    if (code >= 235 && code <= 238) {
      this.font = this.reader.readUnsigned(code - 234)
      return
    }
    if (code >= 239 && code <= 242) {
      this.xxx(code - 238)
      return
    }
    if (code >= 243 && code <= 246) {
      this.fntDef(code - 242)
      return
    }
    if (code === 247) {
      this.pre()
      return
    }
    if (code === 248) {
      this.post()
      return
    }
    if (code === 249) {
      this.postPost()
      return
    }
    throw new Error(`dvi: undefined opcode ${code} at ${this.reader.offset - 1}`)
  }

  private bop(): void {
    if (this.open) {
      throw new Error('dvi: bop before eop')
    }
    this.lastBopOffset = this.reader.offset - 1
    this.reader.readUnsigned(4)
    this.pageWidth = this.reader.readUnsigned(4)
    this.pageHeight = this.reader.readUnsigned(4) + this.reader.readUnsigned(4)
    for (let i = 0; i < 6; i++) {
      this.reader.readUnsigned(4)
    }
    this.reader.readUnsigned(4)
    this.h = 0
    this.v = 0
    this.w = 0
    this.x = 0
    this.y = 0
    this.z = 0
    this.font = -1
    this.lastEndH = undefined
    this.lastEndV = undefined
    this.stack.length = 0
    this.colors = [BLACK]
    this.background = undefined
    this.drawables = []
    this.open = true
  }

  private eop(): void {
    if (!this.open) {
      throw new Error('dvi: eop without bop')
    }
    this.open = false

    this.pending.push({
      declaredWidth: this.pageWidth,
      declaredHeight: this.pageHeight,
      box: this.contentBox(),
      background: this.background,
      drawables: this.drawables,
    })
  }

  private finalize(): Page[] {
    const declaredWidth = this.postWidth / SP_PER_PT
    const declaredHeight = this.postHeight / SP_PER_PT
    return this.pending.map((page) => {
      const width = page.declaredWidth > 0 ? page.declaredWidth / SP_PER_PT : declaredWidth
      const height = page.declaredHeight > 0 ? page.declaredHeight / SP_PER_PT : declaredHeight
      const box = page.box
      if (width <= 0 || height <= 0) {
        if (box === undefined) {
          return { x: 0, y: 0, width, height, background: page.background, drawables: page.drawables }
        }
        return {
          x: box.x0,
          y: box.y0,
          width: box.x1 - box.x0,
          height: box.y1 - box.y0,
          background: page.background,
          drawables: page.drawables,
        }
      }
      if (box === undefined) {
        return { x: 0, y: 0, width, height, background: page.background, drawables: page.drawables }
      }
      const x = Math.min(0, box.x0)
      const y = Math.min(0, box.y0)
      return {
        x,
        y,
        width: Math.max(width, box.x1) - x,
        height: Math.max(height, box.y1) - y,
        background: page.background,
        drawables: page.drawables,
      }
    })
  }

  private contentBox(): Box | undefined {
    let box: Box | undefined
    const extend = (x0: number, y0: number, x1: number, y1: number) => {
      if (box === undefined) {
        box = { x0, y0, x1, y1 }
        return
      }
      box.x0 = Math.min(box.x0, x0)
      box.y0 = Math.min(box.y0, y0)
      box.x1 = Math.max(box.x1, x1)
      box.y1 = Math.max(box.y1, y1)
    }
    for (const item of this.drawables) {
      if (item.kind === 'glyph') {
        extend(
          item.x,
          item.y - item.size * ASCENT,
          item.x + item.text.length * item.size * AVG_WIDTH,
          item.y + item.size * DESCENT,
        )
      } else if (item.kind === 'rule') {
        extend(item.x, item.y, item.x + item.w, item.y + item.h)
      }
    }
    return box
  }

  private setChar(code: number): void {
    this.glyph(code, true)
  }

  private putChar(code: number): void {
    this.glyph(code, false)
  }

  private glyph(code: number, advances: boolean): void {
    this.requirePage('character')
    const font = this.fonts.get(this.font)
    if (font === undefined) {
      throw new Error(`dvi: character ${code} uses undefined font ${this.font}`)
    }
    const unicode = this.config.resolveUnicode(font.dviName, code)
    const text = typeof unicode === 'number' ? String.fromCodePoint(unicode) : unicode
    const width = this.config.resolveWidth?.(font.dviName, code, font.sizeSp) ?? 0
    this.drawables.push({
      kind: 'glyph',
      x: this.h / SP_PER_PT,
      y: this.v / SP_PER_PT,

      continues: this.lastEndH === this.h && this.lastEndV === this.v,
      text,
      family: font.family,
      size: font.size,
      color: this.currentColor(),
      weight: font.weight,
      style: font.style,
    })
    this.lastEndH = this.h + width
    this.lastEndV = this.v
    if (advances) {
      this.h = this.lastEndH
    }
  }

  private setRule(a: number, b: number): void {
    this.rule(a, b)

    this.h += b
  }

  private putRule(a: number, b: number): void {
    this.rule(a, b)
  }

  private rule(a: number, b: number): void {
    this.requirePage('rule')
    if (a <= 0 || b <= 0) {
      return
    }
    this.drawables.push({
      kind: 'rule',
      x: this.h / SP_PER_PT,
      y: (this.v - a) / SP_PER_PT,
      w: b / SP_PER_PT,
      h: a / SP_PER_PT,
      color: this.currentColor(),
    })
  }

  private push(): void {
    this.stack.push({
      h: this.h,
      v: this.v,
      w: this.w,
      x: this.x,
      y: this.y,
      z: this.z,
    })
  }

  private pop(): void {
    const entry = this.stack.pop()
    if (entry === undefined) {
      throw new Error('dvi: pop without push')
    }
    this.h = entry.h
    this.v = entry.v
    this.w = entry.w
    this.x = entry.x
    this.y = entry.y
    this.z = entry.z

    this.lastEndH = undefined
    this.lastEndV = undefined
  }

  private fntDef(n: number): void {
    const number = this.reader.readUnsigned(n)
    this.reader.readUnsigned(4)
    const scaledSize = this.reader.readUnsigned(4)
    this.reader.readUnsigned(4)
    const area = this.decode(this.reader.readBytes(this.reader.readUnsigned(1)))
    const name = this.decode(this.reader.readBytes(this.reader.readUnsigned(1)))
    const dviName = area === '' ? name : `${area}/${name}`

    if (scaledSize === 0 && this.fonts.has(number)) {
      return
    }
    const info = this.config.resolveFont(dviName)
    const sizeSp = scaledSize * info.scale
    this.fonts.set(number, {
      dviName,
      family: info.family,
      size: sizeSp / SP_PER_PT,
      sizeSp,
      weight: info.weight,
      style: info.style,
    })
  }

  private pre(): void {
    const id = this.reader.readUnsigned(1)
    if (id !== 2) {
      throw new Error(`dvi: unsupported DVI format id ${id}`)
    }
    this.reader.readUnsigned(4)
    this.reader.readUnsigned(4)
    this.reader.readUnsigned(4)
    this.reader.readBytes(this.reader.readUnsigned(1))
    this.preSeen = true
  }

  private post(): void {
    if (this.open) {
      throw new Error('dvi: post before eop')
    }
    const lastBop = this.reader.readUnsigned(4)
    if (lastBop !== this.lastBopOffset) {
      throw new Error(`dvi: post points to ${lastBop} but the last bop is at ${this.lastBopOffset}`)
    }
    this.reader.readUnsigned(4)
    this.reader.readUnsigned(4)
    this.reader.readUnsigned(4)
    this.postHeight = this.reader.readUnsigned(4)
    this.postWidth = this.reader.readUnsigned(4)
    this.reader.readUnsigned(2)
    this.reader.readUnsigned(2)
  }

  private postPost(): void {
    this.reader.readUnsigned(4)
    const id = this.reader.readUnsigned(1)
    if (id !== 2) {
      throw new Error(`dvi: unsupported trailer id ${id}`)
    }
    this.finished = true
  }

  private xxx(n: number): void {
    const content = this.decode(this.reader.readBytes(this.reader.readUnsigned(n)))
    this.handleSpecial(content)
  }

  private handleSpecial(content: string): void {
    const parts = content.trim().split(/\s+/)
    const head = parts[0]
    if (head === 'color') {
      if (parts[1] === 'push') {
        this.colors.push(parseColor(parts[2], parts.slice(3)))
      } else if (parts[1] === 'pop') {
        if (this.colors.length <= 1) {
          throw new Error('dvi: color pop without push')
        }
        this.colors.pop()
      } else {
        this.colors[this.colors.length - 1] = parseColor(parts[1], parts.slice(2))
      }
      return
    }
    if (head === 'background') {
      this.background = parseColor(parts[1], parts.slice(2))
      return
    }
    this.requirePage('special')
    this.drawables.push({ kind: 'special', x: this.h / SP_PER_PT, y: this.v / SP_PER_PT, content })
  }

  private currentColor(): Color {
    const color = this.colors[this.colors.length - 1]
    if (color === undefined) {
      throw new Error('dvi: empty color stack')
    }
    return color
  }

  private requirePage(what: string): void {
    if (!this.open) {
      throw new Error(`dvi: ${what} outside a page`)
    }
  }

  private decode(bytes: Uint8Array): string {
    return textDecoder.decode(bytes)
  }
}

function parseColor(model: string | undefined, args: string[]): Color {
  const values = args.map(clamp01)
  switch (model) {
    case 'rgb': {
      const [r, g, b] = values
      if (r === undefined || g === undefined || b === undefined) {
        throw new Error(`dvi: bad rgb color '${args.join(' ')}'`)
      }
      return { model: 'rgb', r, g, b }
    }
    case 'cmyk': {
      const [c, m, y, k] = values
      if (c === undefined || m === undefined || y === undefined || k === undefined) {
        throw new Error(`dvi: bad cmyk color '${args.join(' ')}'`)
      }
      return { model: 'cmyk', c, m, y, k }
    }
    case 'gray': {
      const [v] = values
      if (v === undefined) {
        throw new Error(`dvi: bad gray color '${args.join(' ')}'`)
      }
      return { model: 'gray', v }
    }
    case 'named':
      throw new Error('dvi: color model named is not supported')
    default:
      throw new Error(`dvi: unknown color model '${model ?? ''}'`)
  }
}

function clamp01(value: string): number {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`dvi: invalid color value '${value}'`)
  }
  return Math.min(1, Math.max(0, n))
}
