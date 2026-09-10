import { PascalFile, SyscallHandler, TextFile } from '@jitex/pascal-to-js'

export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

export function readTextFile(path: string): Promise<string> {
  return Deno.readTextFile(path)
}

export function readFile(path: string) {
  return Deno.readFile(path)
}

/**
 * TeX 依赖的外部过程 / 函数实现。
 *
 * 只保留 `extra.*`：这几个对应 TeX 源码里声明为 external 的例程
 * （break / close / breakin / erstat）。
 *
 * 文件与 record 的语义（reset 打开失败时句柄保持未初始化、record 的字节
 * 布局、`file of byte` 的逐字节写出等）已由 pascal-to-js 的 `runtime.*`
 * 原语承担，这里不再覆盖。
 */
export const extraSyscalls: Record<string, SyscallHandler> = {
  'extra.break': () => {
  },
  'extra.close': (ctx) => {
    ctx.debugLog.push('extra.close')
  },
  'extra.breakIn': (ctx) => {
    ctx.debugLog.push('extra.breakIn')
  },
  'extra.erStat': (_ctx, [file]) => {
    const pascalFile = file as PascalFile
    return pascalFile.value !== undefined ? 0 : 1
  },
}

export class ConsoleFile implements TextFile {
  readonly input: { value: string; position: number }
  readonly output: string[] = []
  mode: 'inspection' | 'generation'
  getInput() {
    return this.input.value
  }

  getOutput() {
    const out = this.output.join('')
    // Simulate terminal auto-newline: real terminals return to the line
    // start when a program ends. TeX's close_files_and_terminate outputs
    // "Transcript written on trip.log." via print_nl + print_char(".")
    // without a trailing print_ln.
    if (out.length > 0 && out[out.length - 1] !== '\n') {
      return out + '\n'
    }
    return out
  }
  constructor(input: string) {
    this.input = {
      value: input,
      position: -1,
    }

    this.mode = 'inspection'
  }
  advance(): void {
    if (!this.hasMore()) {
      throw new Error('EOF')
    }
    if (this.input.position >= 0) {
      this.output.push(this.input.value[this.input.position])
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

  seek(): void {
    this.input.position = -1
  }

  setMode(mode: 'inspection' | 'generation'): void {
    this.mode = mode
  }

  writeByte(byte: number): void {
    this.output.push(String.fromCharCode(byte))
  }

  writeBytes(data: Uint8Array): void {
    const items = bytesToString(data)
    this.output.push(items)
  }
}

export function getTripChFile() {
  return `% tex.trip.ch — TRIP 测试专用 WEB change file（tripman.tex Appendix A step 2）
%
% 按 tripman.tex step 2 "Prepare a special version of INITEX" 要求：
%   1. init/tini 宏改为 null（启用 INITEX 模式的全部初始化代码）
%   2. stat/tats 宏改为 @t@>（启用统计代码：var_used/dyn_used 跟踪等）
%   3. mem_min/mem_bot: 0 → 1, mem_top/mem_max: 30000 → 3000
%   4. error_line: 72 → 64, half_error_line: 42 → 32, max_print_line: 79 → 72
%      （这些参数影响 show_context 截断/缩进、print 行宽、内存统计数字）
%
% @x 块按 tex.web 行号递增排列（TANGLE 单调扫描，不可逆序）。
% @x 后的旧行必须与 tex.web 中的行字节级匹配（不含行尾符）。

@x
@d stat==@{ {change this to \`$\\\\{stat}\\equiv\\null$' when gathering
  usage statistics}
@d tats==@t@>@} {change this to \`$\\\\{tats}\\equiv\\null$' when gathering
  usage statistics}
@y
@d stat==@t@>
@d tats==@t@>
@z

@x
@d init== {change this to \`$\\\\{init}\\equiv\\.{@@\\{}$' in the production version}
@d tini== {change this to \`$\\\\{tini}\\equiv\\.{@@\\}}$' in the production version}
@y
@d init==
@d tini==
@z

@x
@!mem_max=30000; {greatest index in \\TeX's internal |mem| array;
@y
@!mem_max=3000; {greatest index in \\TeX's internal |mem| array;
@z

@x
@!mem_min=0; {smallest index in \\TeX's internal |mem| array;
@y
@!mem_min=1; {smallest index in \\TeX's internal |mem| array;
@z

@x
@!error_line=72; {width of context lines on terminal error messages}
@y
@!error_line=64; {width of context lines on terminal error messages}
@z

@x
@!half_error_line=42; {width of first lines of contexts in terminal
  error messages; should be between 30 and |error_line-15|}
@y
@!half_error_line=32; {width of first lines of contexts in terminal
  error messages; should be between 30 and |error_line-15|}
@z

@x
@!max_print_line=79; {width of longest text lines output; should be at least 60}
@y
@!max_print_line=72; {width of longest text lines output; should be at least 60}
@z

@x
@d mem_bot=0 {smallest index in the |mem| array dumped by \\.{INITEX};
@y
@d mem_bot=1 {smallest index in the |mem| array dumped by \\.{INITEX};
@z

@x
@d mem_top==30000 {largest index in the |mem| array dumped by \\.{INITEX};
@y
@d mem_top==3000 {largest index in the |mem| array dumped by \\.{INITEX};
@z
`
}
