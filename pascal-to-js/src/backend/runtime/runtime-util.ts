// ============================================================
// 辅助函数：real 格式化

// ============================================================
export function formatReal(n: number): string {
  if (Number.isInteger(n)) {
    return `${n}.00000000000000E+000`
  }
  const s = n.toExponential(14)
  const eIdx = s.indexOf('e')
  if (eIdx < 0) {
    return s
  }
  const mantissa = s.slice(0, eIdx)
  const exp = s.slice(eIdx + 1)
  const sign = exp[0]
  const digits = exp.slice(1)
  const padded = digits.padStart(3, '0')
  return `${mantissa}E${sign}${padded}`
}

/**
 * 字段格式化：右对齐，左填充空格到 width。
 * Pascal 写参数语义：x:width 表示最小字段宽度，右对齐。
 */
export function formatField(text: string, width: number): string {
  if (!width || text.length >= width) {
    return text
  }
  return ' '.repeat(width - text.length) + text
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export function encodeUtf8(s: string): Uint8Array {
  return textEncoder.encode(s)
}
export function bytesToString(bytes: Uint8Array): string {
  return textDecoder.decode(bytes)
}
