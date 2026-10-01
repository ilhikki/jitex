import { bytesToString, encodeUtf8 } from '@jitex/runtime'
import type { PascalFileStore } from '@jitex/runtime'

export class ConsoleFile implements PascalFileStore {
  readonly input: { value: string; position: number }
  readonly output: string[] = []
  mode: 'inspection' | 'generation'
  onOutput?: (chunk: string) => void

  constructor(input: string) {
    this.input = {
      value: input,
      position: -1,
    }
    this.mode = 'inspection'
  }

  getInput() {
    return this.input.value
  }

  getOutput() {
    const out = this.output.join('')
    if (out.length > 0 && out[out.length - 1] !== '\n') {
      return out + '\n'
    }
    return out
  }

  advance(): void {
    if (!this.hasMore()) {
      throw new Error('EOF')
    }
    if (this.input.position >= 0) {
      const ch = this.input.value[this.input.position]
      this.output.push(ch)
      this.onOutput?.(ch)
    }
    this.input.position++
  }

  clear(): void {
    if (this.getMode() === 'inspection') {
      this.input.position = -1
    }
  }

  getMode(): 'inspection' | 'generation' {
    return this.mode
  }

  hasMore(): boolean {
    return this.input.position < this.input.value.length
  }

  peekByte(): number | undefined {
    if (!this.hasMore()) {
      throw new Error('EOF')
    }
    return this.input.value[this.input.position]?.charCodeAt(0)
  }

  peekBytes(_size: number): Uint8Array | undefined {
    throw new Error('peekBytes not supported on ConsoleFile')
  }

  advanceBy(_n: number): void {
    throw new Error('advanceBy not supported on ConsoleFile')
  }

  getData(): Uint8Array {
    return encodeUtf8(this.getOutput())
  }

  seek(): void {
    this.input.position = -1
  }

  setMode(mode: 'inspection' | 'generation'): void {
    this.mode = mode
  }

  writeByte(byte: number): void {
    const ch = String.fromCharCode(byte)
    this.output.push(ch)
    this.onOutput?.(ch)
  }

  writeBytes(data: Uint8Array): void {
    const chunk = bytesToString(data)
    this.output.push(chunk)
    this.onOutput?.(chunk)
  }

  currentLineHasContent(): boolean {
    const last = this.output[this.output.length - 1]
    if (last === undefined || last.length === 0) {
      return false
    }
    const ch = last[last.length - 1]
    return ch !== '\n' && ch !== '\r'
  }
}
