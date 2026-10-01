const REAL_FRACTION_DIGITS = 7

export function formatReal(n: number): string {
  if (Number.isInteger(n)) {
    return `${n}.${'0'.repeat(REAL_FRACTION_DIGITS)}E+000`
  }
  const s = n.toExponential(REAL_FRACTION_DIGITS)
  const eIdx = s.indexOf('e')
  const mantissa = s.slice(0, eIdx)
  const exp = s.slice(eIdx + 1)
  const sign = exp[0]
  const digits = exp.slice(1)
  const padded = digits.padStart(3, '0')
  return `${mantissa}E${sign}${padded}`
}

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
