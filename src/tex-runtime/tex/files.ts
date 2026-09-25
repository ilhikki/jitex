import { createMemoryFileStore, encodeUtf8 } from '@jitex/runtime'
import type { PascalFileStore } from '@jitex/runtime'
import { ConsoleFile } from './console.ts'

/*
 * TeX 的文件名区约定。
 *
 * 区前缀是编译在 TeX 程序里的常量（tex.web 的 TEX_font_area / TEX_formats），
 * 使用者不该知道它们——所以这套约定由本包持有，使用方只给"名字 + 字节"。
 */
export const TEX_FONT_AREA = 'TeXfonts:'
export const TEX_FORMAT_AREA = 'TeXformats:'

/** 字体文件键：`cmr10` / `cmr10.tfm` → `TeXfonts:cmr10.tfm` */
export function texFontKey(name: string): string {
  return TEX_FONT_AREA + (name.toLowerCase().endsWith('.tfm') ? name : `${name}.tfm`)
}

/** 格式 / 池文件键：`TEX.POOL` → `TeXformats:TEX.POOL` */
export function texFormatKey(name: string): string {
  return TEX_FORMAT_AREA + name
}

/** 一次 TeX job 的输入 */
export interface TexJobInput {
  /** 待排版的源码，写入 `<jobName>.tex` */
  source: string
  /** 预建格式的字节（与 program 同源同批，见 engine.ts 的约束） */
  format: Uint8Array
  /**
   * 字符串池（TANGLE 产出的 TEX.POOL）字节。
   *
   * TeX 的启动初始化（get_strings_started）就会读它，**每次运行都需要**——不是只有
   * INITEX 才用；`&format` 载入时其字符串池虽来自 fmt，但初始化那一步已经先要过池文件。
   */
  pool: Uint8Array
  /** 格式名：TTY 引导串里的 `&<name>`，同时决定格式文件名 `<name>.fmt`（默认 plain） */
  formatName?: string
  /** 随发布一起提供的字体（键为字体名或 tfm 文件名） */
  fonts?: Record<string, Uint8Array>
  jobName?: string
  /** 覆盖 TTY 引导串；默认 `&<formatName> <jobName>` + 一行 `\bye` */
  inputLines?: string
  /** 额外的运行期文件（按 TeX 文件键，如 `foo.tex`） */
  extraFiles?: Record<string, string | Uint8Array>
}

/** 一次 TeX job 的文件装配结果 */
export interface TexJobFiles {
  jobName: string
  files: Map<string, PascalFileStore>
  console: ConsoleFile
  /** 产物键：TeX 按 jobname 写出的 DVI / transcript */
  dviKey: string
  logKey: string
}

/**
 * 装配一次 TeX job 的文件集。
 *
 * **每次调用都新建全部 store**：PascalFileStore 带游标与模式（seek / setMode），
 * 跨 job 复用会串状态。可复用的是传入的字节（createMemoryFileStore 会拷贝初始
 * 字节，故资产不会被某次运行污染）。
 */
export function createTexJobFiles(input: TexJobInput): TexJobFiles {
  const jobName = input.jobName ?? 'user'
  const formatName = input.formatName ?? 'plain'
  const console = new ConsoleFile(input.inputLines ?? `&${formatName} ${jobName} \n \\bye \n`)

  const files = new Map<string, PascalFileStore>()
  // 格式文件名（`&plain` → plain.fmt）不带区前缀，与 boot-tex 的既有装配一致
  files.set(`${formatName}.fmt`, createMemoryFileStore(input.format))
  // 字符串池在格式区（tex.web 的 pool_name = TeXformats:TEX.POOL）
  files.set(texFormatKey('TEX.POOL'), createMemoryFileStore(input.pool))
  for (const [name, bytes] of Object.entries(input.fonts ?? {})) {
    files.set(texFontKey(name), createMemoryFileStore(bytes))
  }
  files.set(`${jobName}.tex`, createMemoryFileStore(encodeUtf8(input.source)))
  for (const [key, data] of Object.entries(input.extraFiles ?? {})) {
    files.set(key, createMemoryFileStore(typeof data === 'string' ? encodeUtf8(data) : data))
  }
  files.set('TTY:', console)

  return {
    jobName,
    files,
    console,
    dviKey: `${jobName}.dvi`,
    logKey: `${jobName}.log`,
  }
}
