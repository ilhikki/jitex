import type { Color, Drawable, Page } from '../dvi/types.ts'

type Glyph = Extract<Drawable, { kind: 'glyph' }>

/**
 * 把一页渲染成 SVG 字符串。
 *
 * 位置模型：每个字形都带**绝对**坐标（DVI 的 h/v 按规范推进后的值），所以这里
 * 只做一件事——把"紧接在一起"的字形合并进同一个 text 元素，字符间距交给字体度量；
 * 其余情况各起一个 text。合并是省体积的关键：一行文字通常只落成一个标签。
 *
 * 这里只画 DVI 说的那点内容，**不替用户决定纸张**：白边多大、页面缩放到多宽、
 * 底色如何，都是展示层的事（见 src/web/styles.css 的 .page）。
 *
 * 代价是 rule / special 与文字的层叠顺序固定为"文字先画"。
 */
export function renderPage(page: Page): string {
  const lines: string[] = []
  const { x, y, width, height } = page
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(x)} ${num(y)} ${num(width)} ${num(height)}"` +
      ` width="${num(width)}pt" height="${num(height)}pt">`,
  )
  if (page.background !== undefined) {
    lines.push(
      `<rect x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}" fill="${
        toHex(page.background)
      }"/>`,
    )
  }
  const text = renderText(page.drawables)
  if (text !== '') {
    lines.push(text)
  }
  for (const item of page.drawables) {
    if (item.kind === 'rule') {
      lines.push(
        `<rect x="${num(item.x)}" y="${num(item.y)}" width="${num(item.w)}" height="${num(item.h)}" fill="${
          toHex(item.color)
        }"/>`,
      )
    } else if (item.kind === 'special') {
      lines.push(`<desc>${escapeXml(item.content)}</desc>`)
    }
  }
  lines.push('</svg>')
  return lines.join('\n')
}

/**
 * 全部文字放进一个 text，每段一个 tspan。
 *
 * 位置全是绝对值（DVI 的 h/v 按规范推进后的值），所以每个 tspan 各自带 x/y、
 * 彼此不接续。呈现属性只在 text 上写一份，与它不同的段才在 tspan 上覆盖——
 * 这一份属性乘以段数，正是 SVG 体积的主要来源。
 */
function renderText(drawables: Drawable[]): string {
  const runs = toRuns(drawables)
  const first = runs[0]
  if (first === undefined) {
    return ''
  }
  const base = first.glyph
  const attrs = [
    `fill="${toHex(base.color)}"`,
    `font-family="${escapeXml(base.family)}"`,
    `font-size="${num(base.size)}"`,
  ]
  if (base.weight !== undefined) {
    attrs.push(`font-weight="${escapeXml(base.weight)}"`)
  }
  if (base.style !== undefined) {
    attrs.push(`font-style="${escapeXml(base.style)}"`)
  }
  attrs.push('xml:space="preserve"')
  const children = runs.map((run) => {
    const own = [`x="${num(run.x)}"`, `y="${num(run.y)}"`, ...overrides(base, run.glyph)]
    return `<tspan ${own.join(' ')}>${escapeXml(run.text)}</tspan>`
  })
  return `<text ${attrs.join(' ')}>${children.join('')}</text>`
}

/** 一段紧接在一起的字形 */
interface Run {
  x: number
  y: number
  text: string
  glyph: Glyph
}

function toRuns(drawables: Drawable[]): Run[] {
  const runs: Run[] = []
  let current: Run | undefined
  for (const item of drawables) {
    if (item.kind !== 'glyph') {
      current = undefined
      continue
    }
    if (current !== undefined && item.continues && sameStyle(current.glyph, item)) {
      current.text += item.text
      continue
    }
    current = { x: item.x, y: item.y, text: item.text, glyph: item }
    runs.push(current)
  }
  return runs
}

/** 相对 text 上那份属性的差异——只补不同的项 */
function overrides(base: Glyph, glyph: Glyph): string[] {
  const attrs: string[] = []
  if (!sameColor(base.color, glyph.color)) {
    attrs.push(`fill="${toHex(glyph.color)}"`)
  }
  if (base.family !== glyph.family) {
    attrs.push(`font-family="${escapeXml(glyph.family)}"`)
  }
  if (base.size !== glyph.size) {
    attrs.push(`font-size="${num(glyph.size)}"`)
  }
  if (base.weight !== glyph.weight) {
    attrs.push(`font-weight="${escapeXml(glyph.weight ?? 'normal')}"`)
  }
  if (base.style !== glyph.style) {
    attrs.push(`font-style="${escapeXml(glyph.style ?? 'normal')}"`)
  }
  return attrs
}

function sameStyle(a: Glyph, b: Glyph): boolean {
  return a.family === b.family && a.size === b.size && a.weight === b.weight && a.style === b.style &&
    sameColor(a.color, b.color)
}

function sameColor(a: Color, b: Color): boolean {
  if (a.model !== b.model) {
    return false
  }
  if (a.model === 'rgb' && b.model === 'rgb') {
    return a.r === b.r && a.g === b.g && a.b === b.b
  }
  if (a.model === 'cmyk' && b.model === 'cmyk') {
    return a.c === b.c && a.m === b.m && a.y === b.y && a.k === b.k
  }
  if (a.model === 'gray' && b.model === 'gray') {
    return a.v === b.v
  }
  return false
}

/** cmyk 先按 (1-c)(1-k) 转 rgb，再统一转 #rrggbb */
function toHex(color: Color): string {
  let r: number
  let g: number
  let b: number
  if (color.model === 'rgb') {
    r = color.r
    g = color.g
    b = color.b
  } else if (color.model === 'gray') {
    r = color.v
    g = color.v
    b = color.v
  } else {
    r = (1 - color.c) * (1 - color.k)
    g = (1 - color.m) * (1 - color.k)
    b = (1 - color.y) * (1 - color.k)
  }
  const hex = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/** 保留 3 位小数（1/1000 pt 远小于 1 sp） */
function num(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}
