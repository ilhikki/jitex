import { createRunnerFromFactory, createRuntimeContext } from '@jitex/runtime'
import type { CompiledFactory, RunState, RuntimeContext } from '@jitex/runtime'
import { renderDvi } from '../render/mod.ts'
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
  /** 运行期 console 输出回调：每次往终端写字节/块时触发，宿主可实时收进度 */
  onConsole?: (chunk: string) => void
}

/**
 * render 的结果。
 *
 *   - completed：引擎跑完了（不一定成功——TeX 自己的报错留在 console 里由回调流出，
 *     不在这里判；DVI 为空就 svgs: []）。
 *   - interrupted：运行中断（引擎没跑起来，或 DVI→SVG 渲染抛了异常），error 给原因。
 *
 * console 输出不再进结果：运行期经 options.onConsole 回调流出，见 TexRenderOptions。
 */
export type TexRenderResult =
  | { status: 'completed'; svgs: string[] }
  | { status: 'interrupted'; error: Error }

export interface TexEngine {
  render(tex: string, options?: TexRenderOptions): TexRenderResult
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
      // 运行期 console 流式回调：必须在 run 之前接上，TeX 一读/写就触发
      if (options.onConsole) {
        job.console.onOutput = options.onConsole
      }
      const ctx: RuntimeContext = createRuntimeContext({ files: job.files })
      const state: RunState = run(ctx)

      // 引擎没跑起来：运行中断
      if (state.status === 'error' && state.error !== undefined) {
        return { status: 'interrupted', error: state.error }
      }

      // 跑完了，不一定成功；TeX 自己的报错留在 console 里由回调流出，不在这里判
      const dvi = job.files.get(job.dviKey)?.getData() ?? new Uint8Array(0)
      if (dvi.length === 0) {
        return { status: 'completed', svgs: [] }
      }

      try {
        return { status: 'completed', svgs: renderDvi(dvi, fonts) }
      } catch (e) {
        return { status: 'interrupted', error: e instanceof Error ? e : new Error(String(e)) }
      }
    },
  }
}
