import { bytesToString, createRunnerFromFactory, createRuntimeContext } from '@jitex/runtime'
import type { CompiledFactory, RunState, RuntimeContext } from '@jitex/runtime'
import { renderDvi } from '../render/mod.ts'
import type { TexJobFiles } from './files.ts'
import { createTexJobFiles } from './files.ts'
import { texRuntimeSyscalls } from './syscalls.ts'

/*
 * TeX 引擎：把「预建格式 + TeX82 程序 + 字体」装成可反复运行的 render。
 *
 * 边界（改这里之前先读）：
 *   - 引擎只持有**不可变资产**（工厂、字节）+ 无状态 handler 表；任何 per-job
 *     的状态都在 render 内新建，故同一引擎可重复调用、结果互不污染。
 *   - 程序与格式是**不可分单元**：fmt 是 TeX82 程序的内存镜像，两者不同源会以
 *     极难排查的方式崩掉。因此没有"单独替换 fmt"的入口。
 *   - 不引入任何宿主输入（时钟 / 随机 / 环境变量）：同一输入必须逐字节可复现。
 *   - render 不抛：装载期（createTexEngine）失败才抛。
 */

export interface TexEngineAssets {
  /** TeX82 编译产物的工厂（构建期产出，作为普通 ESM 模块装载） */
  program: CompiledFactory
  /** 预建格式的字节（同源同批产出） */
  format: Uint8Array
  /** 字符串池（TEX.POOL）字节；TeX 启动初始化就要读，每次运行都需要 */
  pool: Uint8Array
  /** 格式名（默认 plain），须与 format 的文件名一致 */
  formatName?: string
  /** 随发布提供的字体：键为字体名或 tfm 文件名 */
  fonts?: Record<string, Uint8Array>
}

export interface TexRenderOptions {
  /** 额外的运行期文件（按 TeX 文件键，如 `foo.tex`） */
  files?: Record<string, string | Uint8Array>
}

/**
 * TeX 启动成功、但文档里有 TeX 级错误（未定义控制序列、缺字体文件…）。
 *
 * TeX 自己不会抛异常：它把报错写进终端与 transcript 然后继续。所以这一类错误
 * 由引擎从 transcript 里读出来，就是一个 Error——`instanceof TexError` 即
 * "TeX 起来了，问题在文档"。
 */
export class TexError extends Error {
  readonly line?: number

  constructor(message: string, line?: number) {
    super(message)
    this.name = 'TexError'
    this.line = line
  }
}

export type TexRenderResult =
  | { ok: true; svgs: string[]; console: string }
  | { ok: false; error: Error; console?: string }

export interface TexEngine {
  render(tex: string, options?: TexRenderOptions): TexRenderResult
}

/** TeX 的报错行：`! <info>`，下一行（可能隔着上下文行）是 `l.<行号>` */
const ERROR_LINE = /^!\s*(.+)$/m
const ERROR_LINE_NO = /^l\.(\d+)/m

/** 从 transcript 里取第一条 TeX 报错；没有则返回 undefined */
function findTexError(job: TexJobFiles): TexError | undefined {
  const store = job.files.get(job.logKey)
  const text = store === undefined ? '' : bytesToString(store.getData())
  const match = ERROR_LINE.exec(text)
  if (match === null) {
    return undefined
  }
  const lineMatch = ERROR_LINE_NO.exec(text.slice(match.index + match[0].length))
  return new TexError(match[1].trim(), lineMatch === null ? undefined : Number(lineMatch[1]))
}

export function createTexEngine(assets: TexEngineAssets): TexEngine {
  const run = createRunnerFromFactory(assets.program, texRuntimeSyscalls())
  const fonts = assets.fonts ?? {}
  const formatName = assets.formatName ?? 'plain'

  return {
    render(tex: string, options: TexRenderOptions = {}): TexRenderResult {
      const job = createTexJobFiles({
        source: tex,
        format: assets.format,
        pool: assets.pool,
        formatName,
        fonts,
        extraFiles: options.files,
      })
      const ctx: RuntimeContext = createRuntimeContext({ files: job.files })
      const state: RunState = run(ctx)
      const consoleText = job.console.getOutput()
      const fail = (error: Error): TexRenderResult =>
        consoleText === '' ? { ok: false, error } : { ok: false, error, console: consoleText }

      // 引擎没跑起来：异常原样交出
      if (state.status === 'error' && state.error !== undefined) {
        return fail(state.error)
      }

      // TeX 自己报的错：不中断运行，只在 transcript 里留一条记录
      const texError = findTexError(job)
      if (texError !== undefined) {
        return fail(texError)
      }

      // TeX 正常结束但没写 DVI（例如文档没有产出）：不算失败，只是没有页
      const dvi = job.files.get(job.dviKey)?.getData() ?? new Uint8Array(0)
      if (dvi.length === 0) {
        return { ok: true, svgs: [], console: consoleText }
      }

      try {
        return { ok: true, svgs: renderDvi(dvi, fonts), console: consoleText }
      } catch (e) {
        return fail(e instanceof Error ? e : new Error(String(e)))
      }
    },
  }
}
