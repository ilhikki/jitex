import type { Color, Drawable, DviConfig, Page } from './types.ts'
import { DviReader } from './reader.ts'

/** 1 pt = 65536 sp */
const SP_PER_PT = 65536

// 「由内容推导页面尺寸」时对字形升部/降部/平均字宽的估算比例
const ASCENT = 0.75
const DESCENT = 0.25
const AVG_WIDTH = 0.5

const BLACK: Color = { model: 'gray', v: 0 }

const textDecoder = new TextDecoder()

interface FontEntry {
  /** DVI 里的字体名，用于查字符映射与度量 */
  dviName: string
  family: string
  /** 字号（pt），用于 SVG 的 font-size */
  size: number
  /** fnt_def 的 scaled size（sp，已含 scale）——字符宽度的基准 */
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

/** eop 暂存的一页：页面尺寸要等文件末尾的 post 才有权威值 */
interface PendingPage {
  /** bop 里的 c1 / c2+c3（sp），TeX82 通常写 0 */
  declaredWidth: number
  declaredHeight: number
  box: Box | undefined
  background: Color | undefined
  drawables: Drawable[]
}

/** 解析完整 DVI 字节流，逐页产出 Page。 */
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

  /** bop 声明的页面尺寸（sp），TeX82 通常写 0 */
  private pageWidth = 0
  private pageHeight = 0

  /** post 声明的页面尺寸（sp）：最高页面的高、最宽页面的宽。TeX82 一定写 */
  private postWidth = 0
  private postHeight = 0

  private h = 0
  private v = 0
  private w = 0
  private x = 0
  private y = 0
  private z = 0
  private font = -1
  /** 上一个字形结束时的 h、v（sp）；下一个字形的 h 与 v 都等于它们，才算"紧接" */
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
    // set_char_0..127
    if (code < 128) {
      this.setChar(code)
      return
    }
    // fnt_num_0..63
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
      return // nop
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
    // 寄存器类位移：w0/x0/y0/z0 是「按寄存器当前值移动」（不清零），
    // w1..4/x1..4/y1..4/z1..4 是「按参数移动并更新寄存器」
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

  // 页面

  private bop(): void {
    if (this.open) {
      throw new Error('dvi: bop before eop')
    }
    this.lastBopOffset = this.reader.offset - 1 // 已读过 bop 字节
    this.reader.readUnsigned(4) // c0 页码
    this.pageWidth = this.reader.readUnsigned(4) // c1
    this.pageHeight = this.reader.readUnsigned(4) + this.reader.readUnsigned(4) // c2 + c3
    for (let i = 0; i < 6; i++) {
      this.reader.readUnsigned(4) // c4..c9
    }
    this.reader.readUnsigned(4) // 上一页 bop 的位置
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
    // 页面尺寸的权威值在文件末尾的 post 里，此处只暂存
    this.pending.push({
      declaredWidth: this.pageWidth,
      declaredHeight: this.pageHeight,
      box: this.contentBox(),
      background: this.background,
      drawables: this.drawables,
    })
  }

  /**
   * 定稿每页的尺寸。
   *
   * 优先用 bop 的 c1..c3（TeX82 通常写 0，即不声明）；否则用 post 的 u/l —— 那是 TeX
   * 自己记下的"最宽页面的宽、最高页面的高"，含字符推进，**不需要读 TFM 就是正确值**。
   * 两者都没有（文件被截断）才退化为内容包围盒的估算。
   *
   * 最后与包围盒取并集：估算的墨迹范围可能超出 TeX 声明的页面，viewBox 之下被裁掉。
   */
  private finalize(): Page[] {
    const declaredWidth = this.postWidth / SP_PER_PT
    const declaredHeight = this.postHeight / SP_PER_PT
    return this.pending.map((page) => {
      const width = page.declaredWidth > 0 ? page.declaredWidth / SP_PER_PT : declaredWidth
      const height = page.declaredHeight > 0 ? page.declaredHeight / SP_PER_PT : declaredHeight
      const box = page.box
      if (width <= 0 || height <= 0) {
        // 没有任何尺寸声明（bop 为 0 且没有 post）：只能由内容包围盒推导
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

  /**
   * 内容包围盒（pt）。
   *
   * 只在 bop 与 post 都没给页面尺寸时兜底。h 已按规范推进，故 x 是准的，
   * 估的只是"还要往右多宽、往上多高"（字形的升/降部与墨迹宽度）。
   */
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

  // 图元

  private setChar(code: number): void {
    this.glyph(code, true)
  }

  private putChar(code: number): void {
    // put 不推进 h：下一个字形仍落在同一位置，两者都不与它"紧接"
    this.glyph(code, false)
  }

  /**
   * 放一个字形。
   *
   * `set_char` 的语义是"放在 (h,v)，然后 h 加上字符宽度"；宽度来自字体度量。
   * 没有度量（宽度 0）时 h 停在原地——同一行的字形于是共用一个 x，渲染端会把
   * 它们并进同一个 text，字符间距交给字体度量承担。
   */
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
      // 竖直位置也算：\lower、\raise 的字 h 是接续的，但 y 不同，不能并进同一段
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
    // set_rule 使当前点右移 b（put_rule 不移动）
    this.h += b
  }

  private putRule(a: number, b: number): void {
    this.rule(a, b)
  }

  /** a 为高度（厚度）、b 为宽度；参考点在矩形左下角 */
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

  // 栈与寄存器

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
    // 出栈是本层盒的结束：不假设盒后第一个字形与盒内最后一个是同一条流
    this.lastEndH = undefined
    this.lastEndV = undefined
  }

  // 字体

  private fntDef(n: number): void {
    const number = this.reader.readUnsigned(n)
    this.reader.readUnsigned(4) // 校验和
    const scaledSize = this.reader.readUnsigned(4) // scaled size（sp）
    this.reader.readUnsigned(4) // design size
    const area = this.decode(this.reader.readBytes(this.reader.readUnsigned(1)))
    const name = this.decode(this.reader.readBytes(this.reader.readUnsigned(1)))
    const dviName = area === '' ? name : `${area}/${name}`
    // DVI 约定：后置信息里重定义同一字体号且 scaled size 为 0 时沿用先前定义
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

  // 前置/后置信息

  private pre(): void {
    const id = this.reader.readUnsigned(1)
    if (id !== 2) {
      throw new Error(`dvi: unsupported DVI format id ${id}`)
    }
    this.reader.readUnsigned(4) // num
    this.reader.readUnsigned(4) // den
    this.reader.readUnsigned(4) // mag：fnt_def 的 scaled size 已含 mag，不再乘
    this.reader.readBytes(this.reader.readUnsigned(1)) // 注释
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
    this.reader.readUnsigned(4) // num
    this.reader.readUnsigned(4) // den
    this.reader.readUnsigned(4) // mag
    this.postHeight = this.reader.readUnsigned(4) // l：最高页面的高 + 深
    this.postWidth = this.reader.readUnsigned(4) // u：最宽页面的宽
    this.reader.readUnsigned(2) // 最大栈深
    this.reader.readUnsigned(2) // 总页数
  }

  private postPost(): void {
    this.reader.readUnsigned(4) // post 的位置
    const id = this.reader.readUnsigned(1)
    if (id !== 2) {
      throw new Error(`dvi: unsupported trailer id ${id}`)
    }
    this.finished = true
  }

  // special

  private xxx(n: number): void {
    const content = this.decode(this.reader.readBytes(this.reader.readUnsigned(n)))
    this.handleSpecial(content)
  }

  /**
   * 按 xcolor 的 dvips 约定解析：color push / color pop / color / background。
   * 其余一律作为 special 图元原样透传。
   */
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
