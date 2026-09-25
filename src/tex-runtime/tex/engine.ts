import { bytesToString, createRunnerFromFactory, createRuntimeContext } from '@jitex/runtime'
import type { CompiledFactory, PascalFileStore, RunState, RuntimeContext } from '@jitex/runtime'
import { renderDvi } from '../render/mod.ts'
import { createTexJobFiles } from './files.ts'
import { texRuntimeSyscalls } from './syscalls.ts'

/*
 * TeX 引擎：把「预建格式 + TeX82 程序 + 字体」装成可反复运行的 render。
 *
 * 与 runtime 的三段式对应：本函数做阶段 1（拿到工厂，由调用方传入）与阶段 2
 * （注入 syscall 表），每次 render 只做阶段 3（新建 ctx 跑一次）。
 *
 * 边界（改这里之前先读）：
 *   - 引擎只持有**不可变资产**（工厂、字节）+ 无状态 handler 表；任何 per-job
 *     的状态都在 render 内新建，故同一引擎可重复调用、结果互不污染。
 *   - 程序与格式是**不可分单元**：fmt 是 TeX82 程序的内存镜像，两者不同源会以
 *     极难排查的方式崩掉。因此没有"单独替换 fmt"的入口。
 *   - 不引入任何宿主输入（时钟 / 随机 / 环境变量）：TeX 的日期被钉成常量，
 *     同一输入必须逐字节可复现。
 *   - 装载期失败抛（调用方给错了资产）；运行期（TeX 的 errorstop、缺字、步数
 *     超限）一律走返回值的 status/error，不抛。
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
  /** 步数上限（防跑飞），默认 1e9 */
  maxSteps?: number
}

export interface TexRenderOptions {
  jobName?: string
  maxSteps?: number
  /** 额外的运行期文件（按 TeX 文件键） */
  files?: Record<string, string | Uint8Array>
  /** 覆盖 TTY 引导串 */
  inputLines?: string
}

export interface TexRenderResult {
  /** 每页一个 SVG 字符串 */
  svgs: string[]
  /** DVI 字节（TeX 未产出时为空数组） */
  dvi: Uint8Array
  /** 终端上看到的一切（**含输入回显**；与 log 不是一回事） */
  console: string
  /** TeX 的 transcript（`<jobName>.log`）；未产出时为 undefined */
  log: string | undefined
  status: RunState['status']
  steps: number
  error: RunState['error']
  /** 没有字符映射、已退化渲染的字体名 */
  missingFonts: string[]
}

export interface TexEngine {
  render(tex: string, options?: TexRenderOptions): TexRenderResult
}

const DEFAULT_MAX_STEPS = 1e9

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
        jobName: options.jobName,
        inputLines: options.inputLines,
        extraFiles: options.files,
      })
      const ctx: RuntimeContext = createRuntimeContext({
        files: job.files,
        maxSteps: options.maxSteps ?? assets.maxSteps ?? DEFAULT_MAX_STEPS,
      })
      const state: RunState = run(ctx)

      // TeX 中途 errorstop 时可能根本没写出 DVI：此时不解析，直接给空结果
      const dvi = job.files.get(job.dviKey)?.getData() ?? new Uint8Array(0)
      // 字体度量就是喂给 TeX 的那批 tfm：渲染端据此把 h 按规范推进
      const rendered = dvi.length === 0 ? { svgs: [], missingFonts: [] } : renderDvi(dvi, fonts)
      const logStore: PascalFileStore | undefined = job.files.get(job.logKey)
      return {
        svgs: rendered.svgs,
        dvi,
        console: job.console.getOutput(),
        log: logStore === undefined ? undefined : bytesToString(logStore.getData()),
        status: state.status,
        steps: state.steps,
        error: state.error,
        missingFonts: rendered.missingFonts,
      }
    },
  }
}
