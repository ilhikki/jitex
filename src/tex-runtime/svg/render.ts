import type { Color, Drawable, Page } from '../dvi/types.ts'

type Glyph = Extract<Drawable, { kind: 'glyph' }>

interface Run {
  x: number
  y: number
  text: string
  glyph: Glyph
}

/** 把一页渲染成 SVG 字符串。 */
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
  // 整页的文字放进同一个 <text>：run 之间只用 tspan 的 dx/dy，位置由 SVG 的字体度量接续。
  // 代价是 rule/special 与文字的层叠顺序不能交错（文字先画）。
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
 * 相邻的字符合并成一个 run（它们的 x/y 相同，字符间距交给 SVG 字体）；
 * run 之间的显式位移用 tspan 的 dx/dy 表达。
 */
function renderText(drawables: Drawable[]): string {
  const runs: Run[] = []
  let prevGlyph: Glyph | undefined
  for (const item of drawables) {
    if (item.kind !== 'glyph') {
      prevGlyph = undefined
      continue
    }
    const run = runs[runs.length - 1]
    if (
      run !== undefined && prevGlyph !== undefined && sameStyle(prevGlyph, item) &&
      prevGlyph.x === item.x && prevGlyph.y === item.y
    ) {
      run.text += item.text
    } else {
      runs.push({ x: item.x, y: item.y, text: item.text, glyph: item })
    }
    prevGlyph = item
  }

  const tspans: string[] = []
  let first: Run | undefined
  let prevRun: Run | undefined
  for (const run of runs) {
    const attrs: string[] = []
    if (prevRun !== undefined) {
      const dx = run.x - prevRun.x
      const dy = run.y - prevRun.y
      if (dx !== 0) {
        attrs.push(`dx="${num(dx)}"`)
      }
      if (dy !== 0) {
        attrs.push(`dy="${num(dy)}"`)
      }
    }
    const glyph = run.glyph
    attrs.push(
      `fill="${toHex(glyph.color)}"`,
      `font-family="${escapeXml(glyph.family)}"`,
      `font-size="${num(glyph.size)}"`,
    )
    if (glyph.weight !== undefined) {
      attrs.push(`font-weight="${escapeXml(glyph.weight)}"`)
    }
    if (glyph.style !== undefined) {
      attrs.push(`font-style="${escapeXml(glyph.style)}"`)
    }
    tspans.push(`<tspan ${attrs.join(' ')}>${escapeXml(run.text)}</tspan>`)
    first ??= run
    prevRun = run
  }
  if (first === undefined) {
    return ''
  }
  return `<text x="${num(first.x)}" y="${num(first.y)}" xml:space="preserve">${tspans.join('')}</text>`
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
