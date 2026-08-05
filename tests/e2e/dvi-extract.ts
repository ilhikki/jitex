/**
 * DVI 文件文字提取工具。
 *
 * DVI（Device-Independent File）是 Knuth TeX 的输出格式，包含一系列
 * 排版指令（set_char、push/pop、字体切换等）。本工具解析 DVI 字节流，
 * 提取每页排版的字符序列，输出为可读的 plain text。
 *
 * DVI 格式参考：Knuth, "TeX: The Program", §567
 *   - 0..127: set_char_N（设置字符 N，向右移动）
 *   - 128..131: set1..set4（设置单字符，1-4 字节参数）
 *   - 132: set_rule（设置规则）
 *   - 133..136: put1..put4（设置字符但不移动）
 *   - 137: put_rule（设置规则不移动）
 *   - 138: nop
 *   - 139: bop（页开始，后跟 c0..c9[40] + p[4] = 45 字节）
 *   - 140: eop（页结束）
 *   - 141: push（保存状态）
 *   - 142: pop（恢复状态）
 *   - 143..146: right1..right4（右移）
 *   - 147: w0；148..151: w1..w4
 *   - 152: x0；153..156: x1..x4
 *   - 157..160: down1..down4
 *   - 161: y0；162..165: y1..y4
 *   - 166: z0；167..170: z1..z4
 *   - 171..234: fnt_num_0..fnt_num_63（切换字体 0..63）
 *   - 235..238: fnt1..fnt4（切换字体，1-4 字节参数）
 *   - 239..242: xxx1..xxx4（特殊命令）
 *   - 243..246: fnt_def1..fnt_def4（字体定义）
 *   - 247: pre（前导）；248: post（后导）；249: post_post
 *
 * 字符编码：
 *   DVI 中的字符代码是字体内部的编码（由 TFM 文件定义）。
 *   对于标准 TeX 字体（Computer Modern），编码接近 ASCII。
 *   本工具按以下规则解码：
 *     - 32..126: ASCII 可打印字符
 *     - 其他: 显示为 [\NNN]（十进制）或 \xNN（十六进制）
 *
 * 用法：
 *   const text = extractDviText(uint8Array)
 *   // text = "Page 1: Hello, TeX!\n\nPage 2: ..."
 */
'use strict'

// DVI opcode 常量
const SET_CHAR_MIN = 0
const SET_CHAR_MAX = 127
const SET1 = 128
const SET2 = 129
const SET3 = 130
const SET4 = 131
const SET_RULE = 132
const PUT1 = 133
const PUT2 = 134
const PUT3 = 135
const PUT4 = 136
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

interface FontDef {
  fontId: number
  checksum: number
  scaledSize: number
  designSize: number
  area: string
  name: string
}

export interface DviExtractResult {
  /** 每页的字符序列（按页分隔） */
  pages: string[]
  /** 字体定义表（fontId → FontDef） */
  fonts: Map<number, FontDef>
  /** 解析错误列表（不致命，记录异常字节位置） */
  errors: string[]
  /** pre 命令中的注释（comment） */
  comment: string
  /** 整体文本（pages 用 \n--- Page N ---\n 分隔） */
  text: string
}

function readUByte(data: Uint8Array, pos: number): number {
  if (pos >= data.length) throw new Error(`unexpected EOF at ${pos} (readUByte)`)
  return data[pos]
}

function readU4(data: Uint8Array, pos: number): number {
  if (pos + 4 > data.length) throw new Error(`unexpected EOF at ${pos} (readU4)`)
  // DVI 用大端序
  return (
    (data[pos] * 0x1000000 +
      data[pos + 1] * 0x10000 +
      data[pos + 2] * 0x100 +
      data[pos + 3]) >>>
    0
  )
}

/** DVI 的有符号 4 字节整数（大端，二进制补码） */
function readS4(data: Uint8Array, pos: number): number {
  const u = readU4(data, pos)
  return u >= 0x80000000 ? u - 0x100000000 : u
}

/** 读取 1-4 字节无符号整数（按 opcode 后缀） */
function readUN(data: Uint8Array, pos: number, n: number): number {
  let v = 0
  for (let i = 0; i < n; i++) {
    if (pos + i >= data.length) throw new Error(`unexpected EOF at ${pos + i} (readUN n=${n})`)
    v = v * 256 + data[pos + i]
  }
  return v >>> 0
}

/** 读取 1-4 字节有符号整数 */
function readSN(data: Uint8Array, pos: number, n: number): number {
  let v = 0
  for (let i = 0; i < n; i++) {
    if (pos + i >= data.length) throw new Error(`unexpected EOF at ${pos + i} (readSN n=${n})`)
    v = v * 256 + data[pos + i]
  }
  // 符号扩展
  if (n > 0 && (data[pos] & 0x80) !== 0) {
    // 负数：用二进制补码
    const bits = n * 8
    v = v - (1 << bits)
  }
  return v
}

/** 把字符代码转换为可读字符 */
function charToText(code: number): string {
  if (code >= 32 && code <= 126) {
    return String.fromCharCode(code)
  }
  if (code === 9) return '\t'
  if (code === 10) return '\n'
  if (code === 13) return '\r'
  // 其他字符显示为十进制代码（与 TeX 的 "Missing character" 风格一致）
  return `[\\${code}]`
}

/**
 * 解析 DVI 字节流，提取每页排版的字符序列。
 *
 * 算法：
 *   1. 读 pre 命令（验证版本、读注释）
 *   2. 扫描字体定义 fnt_def1-4，建立 fontId → 字体名表
 *   3. 遇到 bop 开始新页；遇到 eop 结束当前页
 *   4. 用 push/pop 栈保存/恢复当前字体
 *   5. 遇到 set_char_N / set1-4 / put1-4，将字符加入当前页文本
 *   6. 遇到 post 停止（postamble 中只有字体定义和统计，无字符）
 *
 * 字体变化时插入标记 [|font:NAME|]，便于诊断"是否真的切到了 nullfont"。
 */
export function extractDviText(data: Uint8Array): DviExtractResult {
  const pages: string[] = []
  const fonts = new Map<number, FontDef>()
  const errors: string[] = []
  let comment = ''
  let pos = 0
  let curFontId = -1
  // push/pop 保存的字体栈
  const fontStack: number[] = []
  let curPageText = ''
  let inPage = false
  let lastFontMark = '' // 已输出的字体标记，避免重复

  const ensureFontMark = () => {
    const fd = fonts.get(curFontId)
    const name = fd ? fd.name : `<unknown#${curFontId}>`
    const mark = `|font:${name}|`
    if (mark !== lastFontMark) {
      curPageText += mark
      lastFontMark = mark
    }
  }

  try {
    // ---- pre 命令 ----
    if (data.length === 0) {
      errors.push('empty DVI')
      return { pages, fonts, errors, comment, text: '' }
    }
    if (data[0] !== PRE) {
      errors.push(`expected pre (247) at byte 0, got ${data[0]}`)
      return { pages, fonts, errors, comment, text: '' }
    }
    pos = 1
    const version = readUByte(data, pos); pos += 1
    if (version !== 2) {
      errors.push(`unsupported DVI version ${version} (expected 2)`)
    }
    // num[4] den[4] mag[4]
    pos += 12
    const k = readUByte(data, pos); pos += 1
    comment = Buffer.from(data.slice(pos, pos + k)).toString('utf-8')
    pos += k

    // ---- 主循环：扫描所有页 ----
    while (pos < data.length) {
      const op = data[pos]
      pos += 1

      if (op <= SET_CHAR_MAX) {
        // set_char_N (0..127)
        if (!inPage) {
          errors.push(`set_char_${op} at byte ${pos - 1} outside of page`)
          continue
        }
        ensureFontMark()
        curPageText += charToText(op)
        continue
      }

      if (op >= FNT_NUM_MIN && op <= FNT_NUM_MAX) {
        // fnt_num_0..63
        curFontId = op - FNT_NUM_MIN
        lastFontMark = '' // 重置标记，下次 ensureFontMark 会重新输出
        continue
      }

      // set1..set4 (128..131)
      if (op >= SET1 && op <= SET4) {
        const n = op - SET1 + 1
        const code = readUN(data, pos, n); pos += n
        if (inPage) {
          ensureFontMark()
          curPageText += charToText(code)
        }
        continue
      }
      // put1..put4 (133..136)
      if (op >= PUT1 && op <= PUT4) {
        const n = op - PUT1 + 1
        const code = readUN(data, pos, n); pos += n
        if (inPage) {
          ensureFontMark()
          curPageText += charToText(code)
        }
        continue
      }
      // set_rule (132) / put_rule (137)
      if (op === SET_RULE || op === PUT_RULE) {
        pos += 8
        continue
      }
      if (op === NOP) continue

      if (op === BOP) {
        if (inPage) {
          errors.push(`bop at byte ${pos - 1} while already in page`)
        }
        pos += 44
        inPage = true
        curPageText = ''
        lastFontMark = ''
        continue
      }
      if (op === EOP) {
        if (!inPage) {
          errors.push(`eop at byte ${pos - 1} outside of page`)
          continue
        }
        pages.push(curPageText)
        curPageText = ''
        inPage = false
        continue
      }
      if (op === PUSH) {
        fontStack.push(curFontId)
        continue
      }
      if (op === POP) {
        if (fontStack.length > 0) {
          curFontId = fontStack.pop()!
          lastFontMark = ''
        }
        continue
      }
      // right1..right4 (143..146)
      if (op >= RIGHT1 && op <= RIGHT1 + 3) {
        pos += op - RIGHT1 + 1
        continue
      }
      // w0 (147)
      if (op === W0) continue
      // w1..w4 (148..151)
      if (op >= W0 + 1 && op <= W0 + 4) {
        pos += op - W0
        continue
      }
      // x0 (152)
      if (op === X0) continue
      // x1..x4 (153..156)
      if (op >= X0 + 1 && op <= X0 + 4) {
        pos += op - X0
        continue
      }
      // down1..down4 (157..160)
      if (op >= DOWN1 && op <= DOWN1 + 3) {
        pos += op - DOWN1 + 1
        continue
      }
      // y0 (161)
      if (op === Y0) continue
      // y1..y4 (162..165)
      if (op >= Y0 + 1 && op <= Y0 + 4) {
        pos += op - Y0
        continue
      }
      // z0 (166)
      if (op === Z0) continue
      // z1..z4 (167..170)
      if (op >= Z0 + 1 && op <= Z0 + 4) {
        pos += op - Z0
        continue
      }
      // fnt1..fnt4 (235..238)
      if (op >= FNT1 && op <= FNT1 + 3) {
        const n = op - FNT1 + 1
        // fnt1 的范围是 0..255，fnt4 可以是负数（用有符号）
        curFontId = n === 4 ? readSN(data, pos, n) : readUN(data, pos, n)
        pos += n
        lastFontMark = ''
        continue
      }
      // xxx1..xxx4 (239..242)
      if (op >= XXX1 && op <= XXX1 + 3) {
        const n = op - XXX1 + 1
        const len = readUN(data, pos, n); pos += n
        pos += len
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

      if (op === PRE) {
        errors.push(`unexpected pre at byte ${pos - 1}`)
        continue
      }
      if (op === POST) {
        // 进入 postamble，停止扫描字符（postamble 里只有 fnt_def）
        // 但我们继续扫描以收集所有字体定义
        // 跳过 post 的 28 字节参数：p[4] num[4] den[4] mag[4] l[4] u[4] s[2] t[2]
        pos += 28
        continue
      }
      if (op === POST_POST) {
        // post_post：q[4] i[1] + 4+ 个 223
        // 已经到末尾，退出
        pos = data.length
        continue
      }
      if (op >= 223) {
        // postamble trailer (223 重复)
        continue
      }
      errors.push(`unknown opcode ${op} at byte ${pos - 1}`)
    }
  } catch (e: any) {
    errors.push(`parse error at byte ${pos}: ${e?.message || String(e)}`)
  }

  // 如果解析结束时还在页内（异常终止），把当前页也保存
  if (inPage && curPageText.length > 0) {
    pages.push(curPageText)
  }

  // 构造整体文本
  let text = ''
  if (comment) {
    text += `DVI comment: ${JSON.stringify(comment)}\n`
  }
  if (fonts.size > 0) {
    text += `Fonts (${fonts.size}):\n`
    for (const [id, fd] of fonts) {
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
  if (errors.length > 0) {
    text += `Parse errors (${errors.length}):\n`
    for (const err of errors) {
      text += `  ${err}\n`
    }
  }

  return { pages, fonts, errors, comment, text }
}
