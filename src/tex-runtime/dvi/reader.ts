/** DVI 字节流顺序读取；越界即抛。 */
export class DviReader {
  private pos = 0

  constructor(private readonly data: Uint8Array) {}

  /** 下一个待读字节的位置 */
  get offset(): number {
    return this.pos
  }

  get atEnd(): boolean {
    return this.pos >= this.data.length
  }

  /** 读 1..4 字节无符号整数 */
  readUnsigned(n: number): number {
    let value = 0
    for (let i = 0; i < n; i++) {
      value = value * 256 + this.readByte()
    }
    return value
  }

  /** 读 1..4 字节有符号整数 */
  readSigned(n: number): number {
    const value = this.readUnsigned(n)
    const limit = 2 ** (8 * n - 1)
    return value >= limit ? value - 2 * limit : value
  }

  readBytes(n: number): Uint8Array {
    if (n < 0 || this.pos + n > this.data.length) {
      throw new Error(`dvi: read ${n} bytes at ${this.pos} exceeds file size ${this.data.length}`)
    }
    const bytes = this.data.subarray(this.pos, this.pos + n)
    this.pos += n
    return bytes
  }

  private readByte(): number {
    const byte = this.data[this.pos]
    if (byte === undefined) {
      throw new Error(`dvi: unexpected end of file at ${this.pos}`)
    }
    this.pos++
    return byte
  }
}
