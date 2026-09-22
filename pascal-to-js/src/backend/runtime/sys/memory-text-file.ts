import type { TextFile } from '../runtime-type.ts'
import { bytesToString } from '../runtime-util.ts'

/**
 * 纯内存文本文件实现。
 * 内部使用动态扩容的 Uint8Array（双倍扩容策略），支持在任意位置读写。
 * 状态维护：容量、已用长度、当前位置、模式。
 */
export class MemoryTextFile implements TextFile {
  private buffer: Uint8Array
  private length: number
  private pos: number
  private mode: 'inspection' | 'generation'

  private static readonly INITIAL_CAPACITY = 16

  constructor(initialData: Uint8Array | undefined = undefined) {
    const cap = Math.max(MemoryTextFile.INITIAL_CAPACITY, initialData?.length ?? 0)
    this.buffer = new Uint8Array(cap)
    this.mode = 'inspection'
    this.pos = 0
    if (initialData !== undefined) {
      this.length = initialData.length
      this.buffer.set(initialData)
    } else {
      this.length = 0
    }
  }

  /**
   * 确保缓冲区至少能容纳 minCapacity 个字节。
   * 若当前容量不足，则反复翻倍直到满足需求。
   */
  private ensureCapacity(minCapacity: number): void {
    if (minCapacity <= this.buffer.length) {
      return
    }
    let newCap = this.buffer.length
    while (newCap < minCapacity) {
      if (newCap === 0) {
        newCap = 1
      } else newCap *= 2
    }
    const newBuffer = new Uint8Array(newCap)
    newBuffer.set(this.buffer.slice(0, this.length))
    this.buffer = newBuffer
  }

  seek(pos: number): void {
    if (pos < 0) {
      throw new Error('seek position must be >= 0')
    }
    this.pos = pos
  }

  peekByte(): number | undefined {
    if (this.pos >= this.length) {
      return undefined
    }
    return this.buffer[this.pos]
  }

  /** 从 pos 取 size 字节视图（不推进）；不足 size 返回 undefined */
  peekBytes(size: number): Uint8Array | undefined {
    if (this.pos + size > this.length) {
      return undefined
    }
    return this.buffer.subarray(this.pos, this.pos + size)
  }

  advance(): void {
    if (this.pos >= this.length) {
      throw new Error('advance beyond EOF')
    }
    this.pos++
  }

  advanceBy(n: number): void {
    if (this.pos + n > this.length) {
      throw new Error('advance beyond EOF')
    }
    this.pos += n
  }

  writeByte(byte: number): void {
    if (this.mode !== 'generation') {
      throw new Error('writeByte requires generation mode')
    }
    const newLength = Math.max(this.length, this.pos + 1)
    this.ensureCapacity(newLength)
    this.buffer[this.pos] = byte
    this.length = newLength
    this.pos++
  }

  writeBytes(data: Uint8Array): void {
    if (this.mode !== 'generation') {
      throw new Error('writeBytes requires generation mode')
    }
    if (data.length === 0) {
      return
    }
    const newLength = Math.max(this.length, this.pos + data.length)
    this.ensureCapacity(newLength)
    this.buffer.set(data, this.pos)
    this.length = newLength
    this.pos += data.length
  }

  clear(): void {
    this.buffer = new Uint8Array(0)
    this.length = 0
    this.pos = 0
  }

  setMode(mode: 'inspection' | 'generation'): void {
    this.mode = mode
  }

  getMode(): 'inspection' | 'generation' {
    return this.mode
  }

  hasMore(): boolean {
    return this.pos < this.length
  }

  /** 当前行是否已有内容且以非 end-of-line 字符结尾（ISO 6.9.5 page 的隐式 writeln 判定） */
  currentLineHasContent(): boolean {
    if (this.pos === 0) {
      return false
    }
    const last = this.buffer[this.pos - 1]
    return last !== 10 && last !== 13
  }

  /** 获取全部内容（方便调试） */
  getData(): Uint8Array {
    return this.buffer.slice(0, this.length)
  }

  /** 获取内容字符串（方便调试） */
  getContent(): string {
    return bytesToString(this.getData())
  }
}
