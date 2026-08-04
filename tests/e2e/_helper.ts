import * as fs from 'fs'
import * as path from 'path'
import { run as runIL, transform } from '@/il/transform'
import { createRuntimeContext, dispatch, toRunState } from '@/il/runtime'

// ============================================================
// 资源文件常量
// ============================================================

export const TANGLE_PAS = 'tangle-official.pas'
export const TANGLE_WEB = 'tangle.web'
export const TEX_WEB = 'tex.web'
export const TRIP_TEX = 'trip.tex'
export const TRIP_TFM = 'trip.tfm'
export const TRIP_FOT = 'trip.fot'

// ============================================================
// 资源读取
// ============================================================

export function readResource(name: string): string {
  return fs.readFileSync(path.join(__dirname, 'resources', name), 'utf-8')
}

export function readResourceBytes(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(__dirname, 'resources', name)))
}

export function resourcePath(name: string): string {
  return path.join(__dirname, 'resources', name)
}

// ============================================================
// 日志辅助函数（用于 e2e 测试输出详细诊断信息）
// ============================================================

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function firstLine(text: string): string {
  const idx = text.indexOf('\n')
  return idx < 0 ? text : text.slice(0, idx)
}

export function previewLine(text: string, maxLen = 120): string {
  const line = firstLine(text)
  if (line.length <= maxLen) return line
  return line.slice(0, maxLen) + '...'
}

export function banner(text: string): string {
  // 从输出中提取 banner 行（通常第一行包含 "This is"）
  const line = firstLine(text)
  return line
}

export function extractModuleNumbers(output: string): string {
  // TANGLE 输出中的模块号序列，如 *1*11*19*29...
  const match = output.match(/(\*\d+)+/)
  return match ? match[0] : ''
}

export function countLines(text: string): number {
  if (!text) return 0
  return text.split('\n').length
}

// ============================================================
// TANGLE 运行辅助
// ============================================================

export interface TangleResult {
  state: any
  pascal: string
  pool: string
  output: string
  files: Map<string, Uint8Array>
}

export function runTangle(pasSource: string, webContent: string): TangleResult {
  const files = new Map<string, Uint8Array>()
  files.set('WEBFILE', new Uint8Array(Buffer.from(webContent, 'utf-8')))
  files.set('CHANGEFILE', new Uint8Array())
  files.set('PASCALFILE', new Uint8Array())
  files.set('POOL', new Uint8Array())

  const state = runIL(pasSource, {
    input: [],
    files,
    programFileUrls: {
      WEBFILE: 'WEBFILE',
      CHANGEFILE: 'CHANGEFILE',
      PASCALFILE: 'PASCALFILE',
      POOL: 'POOL',
    },
    maxSteps: 1e9,
    extensions: ['string'],
  })

  return {
    state,
    pascal: Buffer.from(files.get('PASCALFILE')!).toString('utf-8'),
    pool: Buffer.from(files.get('POOL')!).toString('utf-8'),
    output: state.outputBuffer.join(''),
    files,
  }
}

// ============================================================
// TeX 运行辅助
// ============================================================

export interface RunTeXOptions {
  /** 终端输入行（模拟用户在终端输入的内容） */
  input?: string[]
  /** 文件名 → 内容（string 为文本，Uint8Array 为二进制） */
  files?: Record<string, string | Uint8Array>
  /** 非标特性扩展 */
  extensions?: string[]
  /** 最大步数 */
  maxSteps?: number
}

export interface RunTeXResult {
  state: any
  /** 终端输出（term_out 的内容） */
  output: string
  /** 所有文件（输入 + 输出） */
  files: Map<string, Uint8Array>
}

/**
 * 编译 tex.pas → JS 代码字符串。
 * 编译结果可在多次 runTeXCompiled 调用中复用，避免重复编译。
 */
export function compileTeX(texPasSource: string): string {
  return transform(texPasSource, {
    extensions: ['string', 'fileEofBufferSpace'],
  })
}

/**
 * 运行已编译的 TeX JS 代码。
 *
 * 文件处理：
 *   - 'TTY:' 文件代表终端，其内容由 input 拼接而成
 *   - 其他文件从 options.files 中按名称查找
 *   - TeX 内部通过 reset(f, name) / rewrite(f, name) 绑定文件名
 *
 * 终端输入：
 *   - input 数组中的每个字符串代表一行终端输入
 *   - 拼接为 'TTY:' 文件的内容，TeX 通过 get(term_in) 逐字符读取
 */
export function runTeXCompiled(
  compiledJs: string,
  options: RunTeXOptions = {}
): RunTeXResult {
  const files = new Map<string, Uint8Array>()

  // 设置终端输入文件 'TTY:'
  const inputText = (options.input ?? []).join('\n') + '\n'
  files.set('TTY:', new Uint8Array(Buffer.from(inputText, 'utf-8')))

  // 设置其他输入文件
  if (options.files) {
    for (const [name, content] of Object.entries(options.files)) {
      const bytes =
        typeof content === 'string'
          ? new Uint8Array(Buffer.from(content, 'utf-8'))
          : content
      files.set(name, bytes)
    }
  }

  const ctx = createRuntimeContext({
    input: options.input,
    files,
    maxSteps: options.maxSteps ?? 2e9,
    extensions: options.extensions ?? ['string', 'fileEofBufferSpace'],
  })

  const __sys = (key: string, args: any[]): any => dispatch(ctx, key, args)

  let state: any
  try {
    const factory = new Function('__sys', compiledJs)
    const mainFn = factory(__sys)
    mainFn()
    state = toRunState(ctx, 'terminated')
  } catch (e: any) {
    state = toRunState(ctx, 'error', {
      message: e?.message || String(e),
      stackTrace: e?.stack ? String(e.stack).split('\n').slice(0, 10) : [],
    })
  }

  // 终端输出 = outputBuffer（term_out 写入 url='TTY:' 的内容已重定向到 outputBuffer）
  const output = ctx.outputBuffer.join('')

  return {
    state,
    output,
    files,
  }
}

/**
 * 便捷函数：编译并运行 TeX。
 * 如需多次运行，建议先用 compileTeX 编译一次，再用 runTeXCompiled 运行。
 */
export function runTeX(
  texPasSource: string,
  options: RunTeXOptions = {}
): RunTeXResult & { compiledJs: string } {
  const compiledJs = compileTeX(texPasSource)
  const result = runTeXCompiled(compiledJs, options)
  return { ...result, compiledJs }
}
