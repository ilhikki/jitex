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
  /** CSS font-family，默认实现用浏览器自带的字体族 */
  family: string
  /** 字号乘数：最终字号 = fnt_def 的 scaled size（pt）× scale */
  scale: number
  /** 可选字重，如 'bold' */
  weight?: string
  /** 可选字形，如 'italic' */
  style?: string
}

/** 只被 Interpreter 使用的两个映射函数 */
export interface DviConfig {
  resolveFont(dviFontName: string): FontInfo
  /** 字符码（0..255）→ Unicode；返回 number 视为码点 */
  resolveUnicode(dviFontName: string, charCode: number): string | number
}

export type Drawable =
  | {
    kind: 'glyph'
    /**
     * 位移累计坐标：DVI 里字符不携带宽度，字符间距交给输出字体的度量，
     * 因此这里的 x 只累计显式位移（right/w/x），"连续的字符 x 相同"。
     */
    x: number
    y: number
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
