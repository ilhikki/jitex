import { bytesToString, encodeUtf8 } from '@jitex/runtime'
import type { PascalFileStore } from '@jitex/runtime'

/**
 * TeX 的终端（TTY）。
 *
 * 语义写死为"真实终端"：读输入的同时把读过的字符回显到输出，行结束符由
 * eoln 的实现在读到时就消费并回显（见 syscalls.ts 的 eoln 覆盖）；程序结束时
 * 若最后一行没有换行，补一个——真实终端会把光标移回行首。
 *
 * 因此 getOutput() 得到的是"终端上看到的一切"，包含输入的回显。这与 TeX 的
 * transcript（<jobname>.log）不是一回事，两者不要混用。
 */
export class ConsoleFile implements PascalFileStore {
  readonly input: { value: string; position: number }
  readonly output: string[] = []
  mode: 'inspection' | 'generation'
  /** 运行期 console 回调：每次往终端写字节/块（含输入回显）时触发；不设则不触发 */
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

  /** 当前行是否已有内容且以非 end-of-line 字符结尾（ISO 6.9.5 page 的隐式 writeln 判定） */
  currentLineHasContent(): boolean {
    const last = this.output[this.output.length - 1]
    if (last === undefined || last.length === 0) {
      return false
    }
    const ch = last[last.length - 1]
    return ch !== '\n' && ch !== '\r'
  }
}
