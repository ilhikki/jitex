import type { PascalFileStore } from '../runtime-type.ts'
import { bytesToString } from '../runtime-util.ts'
export function createMemoryFileStore(initialData: Uint8Array | undefined = undefined): PascalFileStore {
  return new MemoryFileStore(initialData)
}

class MemoryFileStore implements PascalFileStore {
  private buffer: Uint8Array
  private length: number
  private pos: number
  private mode: 'inspection' | 'generation'

  private static readonly INITIAL_CAPACITY = 16

  constructor(initialData: Uint8Array | undefined = undefined) {
    const cap = Math.max(MemoryFileStore.INITIAL_CAPACITY, initialData?.length ?? 0)
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

  currentLineHasContent(): boolean {
    if (this.pos === 0) {
      return false
    }
    const last = this.buffer[this.pos - 1]
    return last !== 10 && last !== 13
  }

  getData(): Uint8Array {
    return this.buffer.slice(0, this.length)
  }

  getContent(): string {
    return bytesToString(this.getData())
  }
}
