/**
 * DVI 解析的跨模块契约：Interpreter 只产出 Page，Renderer 只消费 Page。
 */

/** 一个颜色，各分量均为 0..1 */
export type Color =
  | { model: 'rgb'; r: number; g: number; b: number }
  | { model: 'cmyk'; c: number; m: number; y: number; k: number }
  | { model: 'gray'; v: number }

/** 字体映射结果 */
export interface FontInfo {
  /** CSS font-family 列表：可以是一条回退链，渲染端原样写进 SVG */
  family: string
  /** 字号乘数：最终字号 = fnt_def 的 scaled size（pt）× scale */
  scale: number
  /** 可选字重，如 'bold' */
  weight?: string
  /** 可选字形，如 'italic' */
  style?: string
}

/** 只被 Interpreter 使用的三个映射函数 */
export interface DviConfig {
  resolveFont(dviFontName: string): FontInfo
  /** 字符码（0..255）→ Unicode；返回 number 视为码点 */
  resolveUnicode(dviFontName: string, charCode: number): string | number
  /**
   * 字符宽度（sp）；`size` 是该字体在本次作业里的实际尺寸（sp）。
   *
   * 返回 undefined 表示该字体没有度量来源：此时字形不推进 h，位置退化成
   * "整段交给渲染端的字体度量"--同一行的字形会落成同一个 x，于是被合并进
   * 同一个 text 元素。有度量时 h 按规范推进，(h,v) 即绝对位置。
   */
  resolveWidth?(dviFontName: string, charCode: number, size: number): number | undefined
}

export type Drawable =
  | {
    kind: 'glyph'
    /** 参考点的绝对坐标（pt）：即 DVI 的 h / v（按规范推进后的值） */
    x: number
    y: number
    /**
     * 是否紧接上一个字形--其间没有任何位移。
     * 渲染端可据此把相邻字符合并进同一个 text 元素，字符间距交给字体度量。
     */
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
    /** 左上角：DVI 的参考点在矩形左下角，已在 Interpreter 内换算 */
    x: number
    y: number
    w: number
    h: number
    color: Color
  }
  /** 未被识别的 special，原样透传（Renderer 不渲染，只保留内容） */
  | { kind: 'special'; x: number; y: number; content: string }

export interface Page {
  /** viewBox 原点（尺寸由内容推导时不一定为 0） */
  x: number
  y: number
  width: number
  height: number
  background?: Color
  drawables: Drawable[]
}
