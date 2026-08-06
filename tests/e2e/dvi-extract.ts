/**
 * DVI 文件解析与可视化工具（完全重写版）。
 *
 * 设计目标：
 *   1. `parseDvi(data)` —— 严格按 Knuth「TeX: The Program」§567 DVI 规范解析，
 *      返回一棵结构化的 DviDocument JSON 树（不带任何视觉假设）。
 *   2. `dviToJsonString(doc)` —— 把 JSON 树序列化成字符串（用于 *.dvi.json 调试文件）。
 *   3. `dviToHtml(data)` —— 基于 JSON 树渲染视觉 HTML 预览（绝对定位）。
 *   4. `extractDviText(data)` —— 兼容旧调用方的纯文本提取。
 *
 * DVI 指令分类（与代码中的 opcode 常量对应）：
 *   - 字符：set_char_N(0..127) / set1..4(128..131) / put1..4(133..136)
 *   - 规则：set_rule(132) / put_rule(137)
 *   - 控制：nop(138) / bop(139) / eop(140) / push(141) / pop(142)
 *   - 水平移动：right1..4(143..146) / w0(147) / w1..4(148..151) / x0(152) / x1..4(153..156)
 *   - 垂直移动：down1..4(157..160) / y0(161) / y1..4(162..165) / z0(166) / z1..4(167..170)
 *   - 字体：fnt_num_0..63(171..234) / fnt1..4(235..238)
 *   - 特殊：xxx1..4(239..242)
 *   - 字体定义：fnt_def1..4(243..246)
 *   - 文件控制：pre(247) / post(248) / post_post(249)
 *
 * DVI 坐标系（§567）：
 *   - 1 sp = 1/65536 pt（约定，对应 num/den 默认值）
 *   - h: 水平位置，向右为正
 *   - v: 垂直位置，向下为正
 *   - (h, v) = 字符的左下角参考点
 *   - push/pop 保存 (h, v, w, x, y, z, font)
 */
'use strict'

// ============== opcode 常量 ==============
const SET_CHAR_MAX = 127
const SET1 = 128
const SET_RULE = 132
const PUT1 = 133
const PUT_RULE = 137
const NOP = 138
const BOP = 139
const EOP = 140
const PUSH = 141
const POP = 142
const RIGHT1 = 143
const W0 = 147
const X0 = 152
const DOWN1 = 157
const Y0 = 161
const Z0 = 166
const FNT_NUM_MIN = 171
const FNT_NUM_MAX = 234
const FNT1 = 235
const XXX1 = 239
const FNT_DEF1 = 243
const PRE = 247
const POST = 248
const POST_POST = 249

// ============== 类型定义 ==============
export interface FontDef {
  fontId: number
  checksum: number
  /** scaled size，单位 sp（除以 65536 得 pt） */
  scaledSize: number
  /** design size，单位 sp */
  designSize: number
  area: string
  name: string
}

/** 字符操作（set/put） */
export interface CharOp {
  type: 'set_char' | 'put_char'
  /** 字符代码（DVI 中的原始编码，可能 >127） */
  code: number
  /** 字符的可读文本（用于纯文本提取 / HTML 显示） */
  text: string
  /** 执行时的 h 坐标（sp） */
  h: number
  /** 执行时的 v 坐标（sp） */
  v: number
  /** 执行时的字体 ID */
  fontId: number
  /** 操作所在的字节偏移（用于调试） */
  pos: number
}

/** 规则操作（set_rule / put_rule） */
export interface RuleOp {
  type: 'set_rule' | 'put_rule'
  /** 高度 a（sp，向下为正） */
  a: number
  /** 宽度 b（sp，向右为正） */
  b: number
  h: number
  v: number
  pos: number
}

/** 特殊命令 xxx */
export interface SpecialOp {
  type: 'xxx'
  string: string
  pos: number
}

/** 页面里的所有操作（字符、规则、特殊按出现顺序） */
export type PageOp = CharOp | RuleOp | SpecialOp

export interface DviPage {
  /** 页序号（1-based） */
  pageNum: number
  /** bop 时记录的 10 个计数器 c0..c9 */
  counters: number[]
  /** bop 之后、eop 之前的所有操作（按出现顺序） */
  ops: PageOp[]
  /** 页面字符/规则的最大 h+v，用于估算页面尺寸（sp） */
  maxH: number
  maxV: number
}

export interface DviDocument {
  /** DVI 版本号（应为 2） */
  version: number
  /** num/den/mag：定义 sp ↔ 物理单位 */
  num: number
  den: number
  mag: number
  /** pre 命令中的 comment */
  comment: string
  /** 字体定义表（fontId → FontDef） */
  fonts: Map<number, FontDef>
  /** 所有页面 */
  pages: DviPage[]
  /** postamble 中的统计信息 */
  post: {
    maxH: number
    maxV: number
    maxS: number
    totalPages: number
  } | null
  /** 解析过程中遇到的非致命错误 */
  errors: string[]
}

// ============== 字节读取工具 ==============
function readUByte(data: Uint8Array, pos: number): number {
  if (pos >= data.length) throw new Error(`unexpected EOF at ${pos} (readUByte)`)
  return data[pos]
}

function readU4(data: Uint8Array, pos: number): number {
  if (pos + 4 > data.length) throw new Error(`unexpected EOF at ${pos} (readU4)`)
  return ((data[pos] * 0x1000000 + data[pos + 1] * 0x10000 + data[pos + 2] * 0x100 + data[pos + 3]) >>> 0)
}

function readS4(data: Uint8Array, pos: number): number {
  const u = readU4(data, pos)
  return u >= 0x80000000 ? u - 0x100000000 : u
}

/** 读取 1-4 字节无符号整数（按 opcode 后缀 n） */
function readUN(data: Uint8Array, pos: number, n: number): number {
  let v = 0
  for (let i = 0; i < n; i++) {
    if (pos + i >= data.length) throw new Error(`unexpected EOF at ${pos + i} (readUN n=${n})`)
    v = v * 256 + data[pos + i]
  }
  return v >>> 0
}

/** 读取 1-4 字节有符号整数（二进制补码，大端） */
function readSN(data: Uint8Array, pos: number, n: number): number {
  let v = 0
  for (let i = 0; i < n; i++) {
    if (pos + i >= data.length) throw new Error(`unexpected EOF at ${pos + i} (readSN n=${n})`)
    v = v * 256 + data[pos + i]
  }
  if (n > 0 && (data[pos] & 0x80) !== 0) {
    // 注意：JS 位运算符是 32 位有符号，1 << 32 会因截断变成 1。
    // 用 Math.pow / 指数运算符，得到 2^(n*8) 才是正确的负数补码偏移。
    v = v - 2 ** (n * 8)
  }
  return v
}

// ============== 字符解码 ==============
/**
 * 把 DVI 字符代码转换为可读文本。
 *
 * 标准 CM 字体的字符编码：
 *   - 32..126：ASCII 可打印字符
 *   - 0..31：控制字符（罕见，显示为 [\NNN]）
 *   - >126：扩展字符（cmmi 的数学符号等，显示为 [\NNN]）
 */
function charToText(code: number): string {
  if (code >= 32 && code <= 126) return String.fromCharCode(code)
  if (code === 9) return '\t'
  if (code === 10) return '\n'
  if (code === 13) return '\r'
  return `[\\${code}]`
}

// ============== 主解析函数 ==============
/**
 * 严格按 DVI 规范解析字节流，返回 DviDocument JSON 树。
 *
 * 算法：
 *   1. 读 pre（验证版本 + comment）
 *   2. 主循环：bop 开始新页，eop 结束当前页
 *      - 跟踪 (h, v, w, x, y, z, fontId) 状态
 *      - push/pop 用栈保存/恢复状态
 *      - set/put_char 记录 (code, h, v, fontId)
 *      - set/put_rule 记录 (a, b, h, v)
 *   3. postamble：读 post + post_post，记录统计信息
 *   4. 字体定义在 preamble 后、页中、postamble 中都可能出现
 *
 * @param data DVI 字节流
 */
export function parseDvi(data: Uint8Array): DviDocument {
  const fonts = new Map<number, FontDef>()
  const errors: string[] = []
  const pages: DviPage[] = []
  let pos = 0
  let version = 0
  let num = 0
  let den = 0
  let mag = 0
  let comment = ''
  let post: DviDocument['post'] = null

  // DVI 解释器状态
  let h = 0, v = 0                       // 当前位置
  let wReg = 0, xReg = 0                 // 水平增量寄存器
  let yReg = 0, zReg = 0                 // 垂直增量寄存器
  let curFontId = -1                     // 当前字体
  const stateStack: Array<{
    h: number; v: number; w: number; x: number; y: number; z: number; font: number
  }> = []
  // 当前页
  let inPage = false
  let curOps: PageOp[] = []
  let curCounters: number[] = []
  let curMaxH = 0
  let curMaxV = 0
  let pageNum = 0

  const beginPage = (c: number[]) => {
    inPage = true
    pageNum++
    curOps = []
    curCounters = c
    curMaxH = 0
    curMaxV = 0
    h = 0; v = 0
    wReg = 0; xReg = 0; yReg = 0; zReg = 0
    stateStack.length = 0
  }

  const endPage = () => {
    if (!inPage) return
    pages.push({
      pageNum,
      counters: curCounters,
      ops: curOps,
      maxH: curMaxH,
      maxV: curMaxV,
    })
    inPage = false
  }

  /** 记录一个字符操作，更新包围盒 */
  const emitChar = (type: 'set_char' | 'put_char', code: number, p: number) => {
    curOps.push({ type, code, text: charToText(code), h, v, fontId: curFontId, pos: p })
    // 包围盒：字符的右下角约为 (h + size, v + size)
    const fd = fonts.get(curFontId)
    const sizeSp = fd?.scaledSize ?? 655360
    if (curMaxH < h + sizeSp) curMaxH = h + sizeSp
    if (curMaxV < v + sizeSp) curMaxV = v + sizeSp
  }

  const emitRule = (type: 'set_rule' | 'put_rule', a: number, b: number, p: number) => {
    curOps.push({ type, a, b, h, v, pos: p })
    if (a > 0 && b > 0) {
      if (curMaxH < h + b) curMaxH = h + b
      if (curMaxV < v + a) curMaxV = v + a
    }
  }

  try {
    // ---- pre 命令 ----
    if (data.length === 0) {
      errors.push('empty DVI')
      return { version: 0, num: 0, den: 0, mag: 0, comment: '', fonts, pages: [], post: null, errors }
    }
    if (data[0] !== PRE) {
      errors.push(`expected pre (247) at byte 0, got ${data[0]}`)
      return { version: 0, num: 0, den: 0, mag: 0, comment: '', fonts, pages: [], post: null, errors }
    }
    pos = 1
    version = readUByte(data, pos); pos += 1
    if (version !== 2) errors.push(`unsupported DVI version ${version} (expected 2)`)
    num = readU4(data, pos); pos += 4
    den = readU4(data, pos); pos += 4
    mag = readU4(data, pos); pos += 4
    const k = readUByte(data, pos); pos += 1
    comment = Buffer.from(data.slice(pos, pos + k)).toString('utf-8')
    pos += k

    // ---- 主循环 ----
    while (pos < data.length) {
      const opStart = pos
      const op = data[pos]; pos += 1

      // set_char_N (0..127)
      if (op <= SET_CHAR_MAX) {
        if (!inPage) {
          errors.push(`set_char_${op} at byte ${opStart} outside of page`)
          continue
        }
        emitChar('set_char', op, opStart)
        // 字符宽度推进：保守用一个字符 size 估算（实际宽度需查 TFM）
        // 这里用 designSize 的 0.5 倍作为近似，避免引入字体度量依赖
        const fd = fonts.get(curFontId)
        const sizeSp = fd?.scaledSize ?? 655360
        h += Math.round(sizeSp * 0.5)
        continue
      }

      // fnt_num_0..63 (171..234)
      if (op >= FNT_NUM_MIN && op <= FNT_NUM_MAX) {
        curFontId = op - FNT_NUM_MIN
        continue
      }

      // set1..set4 (128..131)
      if (op >= SET1 && op <= SET1 + 3) {
        const n = op - SET1 + 1
        const code = readUN(data, pos, n); pos += n
        if (inPage) {
          emitChar('set_char', code, opStart)
          const fd = fonts.get(curFontId)
          const sizeSp = fd?.scaledSize ?? 655360
          h += Math.round(sizeSp * 0.5)
        }
        continue
      }

      // put1..put4 (133..136)：字符但不移动 h
      if (op >= PUT1 && op <= PUT1 + 3) {
        const n = op - PUT1 + 1
        const code = readUN(data, pos, n); pos += n
        if (inPage) emitChar('put_char', code, opStart)
        continue
      }

      // set_rule (132) / put_rule (137)
      if (op === SET_RULE || op === PUT_RULE) {
        const a = readS4(data, pos); pos += 4
        const b = readS4(data, pos); pos += 4
        if (inPage) {
          emitRule(op === SET_RULE ? 'set_rule' : 'put_rule', a, b, opStart)
          if (op === SET_RULE) h += b
        }
        continue
      }

      if (op === NOP) continue

      // bop (139)：c0..c9[40] + p[4]
      if (op === BOP) {
        if (inPage) {
          errors.push(`bop at byte ${opStart} while already in page`)
          endPage()
        }
        const counters: number[] = []
        for (let i = 0; i < 10; i++) {
          counters.push(readS4(data, pos)); pos += 4
        }
        pos += 4 // 跳过 p（上一页偏移，仅用于反向遍历，本工具不需要）
        beginPage(counters)
        continue
      }

      // eop (140)
      if (op === EOP) {
        if (!inPage) {
          errors.push(`eop at byte ${opStart} outside of page`)
          continue
        }
        endPage()
        continue
      }

      // push (141)
      if (op === PUSH) {
        stateStack.push({ h, v, w: wReg, x: xReg, y: yReg, z: zReg, font: curFontId })
        continue
      }

      // pop (142)
      if (op === POP) {
        if (stateStack.length === 0) {
          errors.push(`pop at byte ${opStart} with empty stack`)
          continue
        }
        const s = stateStack.pop()!
        h = s.h; v = s.v; wReg = s.w; xReg = s.x; yReg = s.y; zReg = s.z; curFontId = s.font
        continue
      }

      // right1..right4 (143..146)
      if (op >= RIGHT1 && op <= RIGHT1 + 3) {
        const n = op - RIGHT1 + 1
        const b = readSN(data, pos, n); pos += n
        h += b
        continue
      }

      // w0 (147)
      if (op === W0) { h += wReg; continue }
      // w1..w4 (148..151)
      if (op >= W0 + 1 && op <= W0 + 4) {
        const n = op - W0
        wReg = readSN(data, pos, n); pos += n
        h += wReg
        continue
      }

      // x0 (152)
      if (op === X0) { h += xReg; continue }
      // x1..x4 (153..156)
      if (op >= X0 + 1 && op <= X0 + 4) {
        const n = op - X0
        xReg = readSN(data, pos, n); pos += n
        h += xReg
        continue
      }

      // down1..down4 (157..160)
      if (op >= DOWN1 && op <= DOWN1 + 3) {
        const n = op - DOWN1 + 1
        const a = readSN(data, pos, n); pos += n
        v += a
        continue
      }

      // y0 (161)
      if (op === Y0) { v += yReg; continue }
      // y1..y4 (162..165)
      if (op >= Y0 + 1 && op <= Y0 + 4) {
        const n = op - Y0
        yReg = readSN(data, pos, n); pos += n
        v += yReg
        continue
      }

      // z0 (166)
      if (op === Z0) { v += zReg; continue }
      // z1..z4 (167..170)
      if (op >= Z0 + 1 && op <= Z0 + 4) {
        const n = op - Z0
        zReg = readSN(data, pos, n); pos += n
        v += zReg
        continue
      }

      // fnt1..fnt4 (235..238)
      if (op >= FNT1 && op <= FNT1 + 3) {
        const n = op - FNT1 + 1
        curFontId = n === 4 ? readSN(data, pos, n) : readUN(data, pos, n)
        pos += n
        continue
      }

      // xxx1..xxx4 (239..242)：special 命令
      if (op >= XXX1 && op <= XXX1 + 3) {
        const n = op - XXX1 + 1
        const len = readUN(data, pos, n); pos += n
        const str = Buffer.from(data.slice(pos, pos + len)).toString('latin1')
        pos += len
        if (inPage) curOps.push({ type: 'xxx', string: str, pos: opStart })
        continue
      }

      // fnt_def1..fnt_def4 (243..246)
      if (op >= FNT_DEF1 && op <= FNT_DEF1 + 3) {
        const n = op - FNT_DEF1 + 1
        const fontId = n === 4 ? readSN(data, pos, n) : readUN(data, pos, n)
        pos += n
        const checksum = readU4(data, pos); pos += 4
        const scaledSize = readU4(data, pos); pos += 4
        const designSize = readU4(data, pos); pos += 4
        const areaLen = readUByte(data, pos); pos += 1
        const nameLen = readUByte(data, pos); pos += 1
        const area = Buffer.from(data.slice(pos, pos + areaLen)).toString('ascii')
        pos += areaLen
        const name = Buffer.from(data.slice(pos, pos + nameLen)).toString('ascii')
        pos += nameLen
        fonts.set(fontId, { fontId, checksum, scaledSize, designSize, area, name })
        continue
      }

      // pre (247)：异常，postamble 后不应再出现
      if (op === PRE) {
        errors.push(`unexpected pre at byte ${opStart}`)
        continue
      }

      // post (248)：进入 postamble
      if (op === POST) {
        if (inPage) endPage()
        // post 参数：p[4] num[4] den[4] mag[4] l[4] u[4] s[2] t[2] = 28 字节
        pos += 4 // p（前一页 bop 偏移，本工具不使用）
        const pn = readU4(data, pos); pos += 4
        const pd = readU4(data, pos); pos += 4
        const pm = readU4(data, pos); pos += 4
        const maxH = readU4(data, pos); pos += 4
        const maxV = readU4(data, pos); pos += 4
        const maxS = readU2(data, pos); pos += 2
        const totalPages = readU2(data, pos); pos += 2
        // postamble 里仍是字体定义；继续循环读
        if (pn !== num || pd !== den || pm !== mag) {
          errors.push(`post num/den/mag mismatch: pre=(${num},${den},${mag}) post=(${pn},${pd},${pm})`)
        }
        post = { maxH, maxV, maxS, totalPages }
        continue
      }

      // post_post (249)：结束
      if (op === POST_POST) {
        // q[4] i[1]，后面是 4+ 个 223 填充
        pos += 4
        if (pos < data.length) {
          const iv = readUByte(data, pos); pos += 1
          if (iv !== 2) errors.push(`post_post identifier ${iv} (expected 2)`)
        }
        break
      }

      // 223 填充字节（postamble trailer）
      if (op >= 223) continue

      errors.push(`unknown opcode ${op} at byte ${opStart}`)
    }

    if (inPage) endPage()
  } catch (e: any) {
    errors.push(`parse error at byte ${pos}: ${e?.message || String(e)}`)
  }

  return { version, num, den, mag, comment, fonts, pages, post, errors }
}

/** 读取 2 字节无符号整数（post 用） */
function readU2(data: Uint8Array, pos: number): number {
  if (pos + 2 > data.length) throw new Error(`unexpected EOF at ${pos} (readU2)`)
  return (data[pos] << 8) | data[pos + 1]
}

// ============== JSON 序列化（调试用） ==============
/**
 * 把 DviDocument 序列化为 JSON 字符串。
 *
 * Map（fonts）转为数组（便于 JSON 表示）；
 * 每页的 ops 完整保留，方便 diff 与调试。
 */
export function dviToJsonString(doc: DviDocument): string {
  const fontsArr = Array.from(doc.fonts.entries())
    .map(([id, fd]) => ({ fontId: id, ...fd }))
    .sort((a, b) => a.fontId - b.fontId)

  return JSON.stringify({
    version: doc.version,
    num: doc.num,
    den: doc.den,
    mag: doc.mag,
    comment: doc.comment,
    fonts: fontsArr,
    pages: doc.pages.map(p => ({
      pageNum: p.pageNum,
      counters: p.counters,
      maxH: p.maxH,
      maxV: p.maxV,
      ops: p.ops,
    })),
    post: doc.post,
    errors: doc.errors,
  }, null, 2)
}

// ============== HTML 转换（基于 JSON 树） ==============
/** HTML 转义：& < > " ' */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 1 pt = 65536 sp */
function spToPt(sp: number): number {
  return sp / 65536
}

/**
 * 把 DVI 字节流转换为可读的 JSON 字符串。
 *
 * 用于在 e2e 报告里输出 `*.dvi.json` 文件，方便调试。
 */
export function dviToJson(data: Uint8Array): string {
  return dviToJsonString(parseDvi(data))
}

/**
 * 根据 CM 字体名推断 CSS font-family / weight / style。
 *
 * 只处理常见的 Computer Modern 字体族；未知字体回退到通用 serif。
 * 参考：Knuth, "The TeXbook", Appendix F
 */
function cssFontFor(name: string): { family: string; weight: string; style: string } {
  const n = name.toLowerCase()
  let family = '"Times New Roman", "Linux Libertine", serif'
  let weight = 'normal'
  let style = 'normal'

  // 注意：分支顺序很重要（更具体的前缀先判断）
  if (n.startsWith('cmbxti')) { family = '"Times New Roman", serif'; weight = 'bold'; style = 'italic' }
  else if (n.startsWith('cmbx') || n.startsWith('cmb')) { family = '"Times New Roman", serif'; weight = 'bold' }
  else if (n.startsWith('cmti')) { family = '"Times New Roman", serif'; style = 'italic' }
  else if (n.startsWith('cmsltt') || n.startsWith('cmtt') || n.startsWith('cmvtt')) { family = '"Courier New", monospace' }
  else if (n.startsWith('cmsl')) { family = '"Times New Roman", serif'; style = 'oblique' }
  else if (n.startsWith('cmssbx') || n.startsWith('cmssdc')) { family = 'Arial, "Helvetica", sans-serif'; weight = 'bold' }
  else if (n.startsWith('cmssi')) { family = 'Arial, "Helvetica", sans-serif'; style = 'italic' }
  else if (n.startsWith('cmss')) { family = 'Arial, "Helvetica", sans-serif' }
  else if (n.startsWith('cmmib')) { family = '"Cambria Math", "Times New Roman", serif'; weight = 'bold'; style = 'italic' }
  else if (n.startsWith('cmmi')) { family = '"Cambria Math", "Times New Roman", serif'; style = 'italic' }
  else if (n.startsWith('cmbsy')) { family = '"Cambria Math", "Times New Roman", serif'; weight = 'bold' }
  else if (n.startsWith('cmsy')) { family = '"Cambria Math", "Times New Roman", serif' }
  else if (n.startsWith('cmex')) { family = '"Cambria Math", serif' }
  else if (n.startsWith('cmfib') || n.startsWith('cmff') || n.startsWith('cmfi')) { family = '"Apple Chancery", cursive' }
  else if (n.startsWith('cmcsc')) { family = '"Times New Roman", serif'; style = 'small-caps' }
  else if (n.startsWith('cmtcsc') || n.startsWith('cmdunh') || n.startsWith('manfnt')) { family = 'serif' }
  else if (n.startsWith('cmu')) { family = '"Times New Roman", serif'; style = 'italic' }
  else if (n.startsWith('cmr')) { family = '"Times New Roman", "Linux Libertine", serif' }

  return { family, weight, style }
}

/** 渲染单页：纸张容器 + 绝对定位的字符和规则 */
function renderPageHtml(page: DviPage, doc: DviDocument): string {
  const fonts = doc.fonts
  const body: string[] = []

  // 规则（黑矩形）：渲染在底层
  for (const op of page.ops) {
    if (op.type !== 'set_rule' && op.type !== 'put_rule') continue
    if (op.a <= 0 || op.b <= 0) continue
    body.push(
      `<div style="position:absolute;left:${spToPt(op.h).toFixed(2)}pt;top:${spToPt(op.v).toFixed(2)}pt;` +
      `width:${spToPt(op.b).toFixed(2)}pt;height:${spToPt(op.a).toFixed(2)}pt;background:#000;"></div>`
    )
  }

  // 字符：渲染在上层
  for (const op of page.ops) {
    if (op.type !== 'set_char' && op.type !== 'put_char') continue
    const fd = fonts.get(op.fontId)
    const sizePt = spToPt(fd?.scaledSize ?? 655360)
    const css = cssFontFor(fd?.name ?? 'unknown')

    // 跳过纯空白（除空格外），它们视觉上不可见
    const t = op.text
    if (t.trim() === '' && t !== ' ') continue

    const htmlChar = t === ' ' ? '&nbsp;' : escapeHtml(t)
    body.push(
      `<span style="position:absolute;left:${spToPt(op.h).toFixed(2)}pt;top:${spToPt(op.v).toFixed(2)}pt;` +
      `font-family:${css.family};font-size:${sizePt.toFixed(2)}pt;` +
      `font-weight:${css.weight};font-style:${css.style};` +
      `white-space:nowrap;line-height:1;">${htmlChar}</span>`
    )
  }

  // 页面尺寸：用 Letter × mag/1000 作为基础尺寸（612×792 pt @ mag=1000），
  // 这是 TeX 默认页面大小。如果 post 报告了更大的 maxH/maxV（如 trip 设置 \vsize 接近无穷），
  // 则取较大值，但限制 ≤ 5000pt 防止极端情况让页面爆炸长。
  // 不直接用单页 ops 的 maxV——因为 TeX 测试时常用 downN 把字符推到页外，
  // 这会让单页 maxV 暴涨到几万 pt，但这不是真实页面尺寸。
  const mag = doc.mag || 1000
  const letterW = 612 * mag / 1000
  const letterH = 792 * mag / 1000
  const postW = doc.post ? spToPt(doc.post.maxH) : 0
  const postH = doc.post ? spToPt(doc.post.maxV) : 0
  // 取 max(Letter, post)，但限制 ≤ 5000pt
  const width = Math.min(Math.max(letterW, postW), 5000)
  const height = Math.min(Math.max(letterH, postH), 5000)

  return `
<div style="margin:24px auto;">
  <div style="font-family:sans-serif;margin:8px 0 8px 4px;color:#555;">
    Page ${page.pageNum} · ${page.ops.length} ops · ${width.toFixed(0)}pt × ${height.toFixed(0)}pt
  </div>
  <div style="position:relative;background:#fff;border:1px solid #aaa;box-shadow:0 2px 8px rgba(0,0,0,0.15);` +
    `width:${width.toFixed(2)}pt;height:${height.toFixed(2)}pt;overflow:hidden;">
${body.join('\n')}
  </div>
</div>`
}

/**
 * 把 DVI 字节流转换为可视觉预览的 HTML 文档。
 *
 * 实现：
 *   1. 先 parseDvi 得到 JSON 树
 *   2. 每页用一个绝对定位的 div 模拟纸张
 *   3. 字符用 <span> 绝对定位到 (h, v)，CSS font-family 按 CM 字体名映射
 *   4. 规则用 <div> 黑块渲染
 *
 * 字符宽度推进只是估算（0.5 × scaledSize），所以相邻字符的间距可能
 * 不完全准确；但整体页面布局、行距、段落结构接近 PDF。
 */
export function dviToHtml(data: Uint8Array): string {
  const doc = parseDvi(data)
  const { fonts, pages, errors, comment } = doc

  const header: string[] = []
  header.push(`<h1 style="font-family:sans-serif;margin:16px 0;">DVI Preview</h1>`)
  header.push(
    `<p style="font-family:sans-serif;">` +
    `Pages: <b>${pages.length}</b> · Fonts: <b>${fonts.size}</b> · Errors: <b>${errors.length}</b>` +
    `</p>`
  )
  if (comment) {
    header.push(`<p style="font-family:sans-serif;">Comment: <code>${escapeHtml(comment)}</code></p>`)
  }

  // 字体列表
  if (fonts.size > 0) {
    const items: string[] = []
    for (const [id, fd] of fonts) {
      const css = cssFontFor(fd.name)
      const sizePt = spToPt(fd.scaledSize)
      const sample =
        ` <span style="font-family:${css.family};font-weight:${css.weight};font-style:${css.style};` +
        `font-size:${sizePt.toFixed(2)}pt;">Hello TeX 0123456789</span>`
      items.push(
        `<li style="font-family:sans-serif;">#${id}: <code>${escapeHtml(fd.area)}${escapeHtml(fd.name)}</code> ` +
        `${sizePt.toFixed(2)}pt${sample}</li>`
      )
    }
    header.push(
      `<h2 style="font-family:sans-serif;">Fonts (${fonts.size})</h2>` +
      `<ul style="list-style:disc;padding-left:24px;">${items.join('')}</ul>`
    )
  }

  if (errors.length > 0) {
    header.push(`<h2 style="font-family:sans-serif;color:#c00;">Errors (${errors.length})</h2>`)
    header.push(
      `<pre style="background:#fff3f3;padding:12px;border:1px solid #f99;">` +
      `${escapeHtml(errors.join('\n'))}</pre>`
    )
  }

  const pagesHtml = pages.length > 0
    ? pages.map(p => renderPageHtml(p, doc)).join('\n')
    : '<p style="font-family:sans-serif;color:#888;">(no pages)</p>'

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>DVI Preview</title>
</head>
<body style="background:#e8eaed;margin:0;padding:24px;">
${header.join('\n')}
<h2 style="font-family:sans-serif;">Pages</h2>
${pagesHtml}
</body>
</html>`
}

// ============== 兼容：纯文本提取（保留旧调用方） ==============
export interface DviExtractResult {
  pages: string[]
  fonts: Map<number, FontDef>
  errors: string[]
  comment: string
  text: string
}

/**
 * 把 DVI 解析为纯文本（用于 `plain-dvi.txt` 输出）。
 *
 * 字符按出现顺序拼接；字体切换时插入 `|font:NAME|` 标记，便于诊断。
 * 实现已切换为基于 parseDvi JSON 树，行为与旧版兼容。
 */
export function extractDviText(data: Uint8Array): DviExtractResult {
  const doc = parseDvi(data)
  const pages: string[] = []
  let lastFontId = -2

  for (const page of doc.pages) {
    let text = ''
    lastFontId = -2 // 每页重置标记
    for (const op of page.ops) {
      if (op.type !== 'set_char' && op.type !== 'put_char') continue
      if (op.fontId !== lastFontId) {
        const fd = doc.fonts.get(op.fontId)
        const name = fd ? fd.name : `<unknown#${op.fontId}>`
        text += `|font:${name}|`
        lastFontId = op.fontId
      }
      text += op.text
    }
    pages.push(text)
  }

  // 整体文本（带页分隔）
  let text = ''
  if (doc.comment) {
    text += `DVI comment: ${JSON.stringify(doc.comment)}\n`
  }
  if (doc.fonts.size > 0) {
    text += `Fonts (${doc.fonts.size}):\n`
    for (const [id, fd] of doc.fonts) {
      text += `  #${id}: ${fd.area}${fd.name} (scaled=${fd.scaledSize}, design=${fd.designSize})\n`
    }
  }
  text += `\n`
  if (pages.length === 0) {
    text += `(no pages)\n`
  } else {
    pages.forEach((p, i) => {
      text += `--- Page ${i + 1} ---\n`
      text += p.length > 0 ? p : `(empty page - no character operations)\n`
      text += `\n`
    })
  }
  if (doc.errors.length > 0) {
    text += `Parse errors (${doc.errors.length}):\n`
    for (const err of doc.errors) text += `  ${err}\n`
  }

  return { pages, fonts: doc.fonts, errors: doc.errors, comment: doc.comment, text }
}
