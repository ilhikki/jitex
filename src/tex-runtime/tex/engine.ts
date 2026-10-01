import { createRunnerFromFactory, createRuntimeContext } from '@jitex/runtime'
import type { CompiledFactory, RunState, RuntimeContext } from '@jitex/runtime'
import { renderDvi } from '../render/mod.ts'
import { createTexJobFiles } from './files.ts'
import { texRuntimeSyscalls } from './syscalls.ts'

export interface TexEngineAssets {
  program: CompiledFactory

  format: Uint8Array

  pool: Uint8Array

  formatName?: string

  fonts?: Record<string, Uint8Array>
}

export interface TexRenderOptions {
  files?: Record<string, string | Uint8Array>

  onConsole?: (chunk: string) => void
}

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
      if (options.onConsole) {
        job.console.onOutput = options.onConsole
      }
      const ctx: RuntimeContext = createRuntimeContext({ files: job.files })
      const state: RunState = run(ctx)

      if (state.status === 'error' && state.error !== undefined) {
        return { status: 'interrupted', error: state.error }
      }

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
