// Runner: topological sort + scheduling + failure policy + cache integration.
//
// Entry: run(suite, options) -> Promise<RunReport>
//
// Execution order: before -> stages (topological order, with cache decision) -> after

import { RunContext, setGlobalRunContext, setLogSink, StageContext } from './context.ts'
import { _drainDeclLogs } from './dsl.ts'
import type { CacheableRecord, Stage, Suite } from './dsl.ts'
import type { DepChecksum } from './cache.ts'
import { purgeCacheDir, tryRecoverCache, writeCache } from './cache.ts'
import { buildArtifactMap, writeReport } from './reporter.ts'

export interface RunOptions {
  reportDir?: string
  runId?: string
  filter?: (stage: Stage<unknown>) => boolean
  failFast?: boolean
  cacheDir?: string
  withCache?: boolean
  purge?: boolean
  noReport?: boolean
  args?: string[]
  env?: Record<string, string>
  log?: (msg: string) => void
}

export interface StageRecord {
  id: string
  title: string
  status: 'success' | 'failed' | 'skipped'
  duration: number
  cached: boolean
  artifacts: Array<{ name: string; size: number; lines?: number }>
  logs: string[]
  consoleLogs: string[]
  debugLogs: string[]
  stackTrace: string[]
  assertions: Array<{ name: string; passed: boolean; actual?: unknown; expected?: unknown }>
}

export interface RunReport {
  id: string
  timestamp: string
  success: boolean
  duration: number
  env: { runtime: string; platform: string; arch: string }
  args: string[]
  stages: StageRecord[]
  runLogs: string[]
}

function defaultRunId(): string {
  const now = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${
    pad(now.getMinutes())
  }-${pad(now.getSeconds())}`
  return `${ts}_001`
}

function artifactRecord(a: { name: string; bytes: Uint8Array }) {
  let lines: number | undefined
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(a.bytes)
    lines = text.split('\n').length
  } catch {
    lines = undefined
  }
  return { name: a.name, size: a.bytes.length, lines }
}

// Topological sort (Kahn)
//
// universe = all stages in the suite (used for dep ownership validation)
// active   = stages to actually execute/display after user filter (the graph is built only from active)
//
// If a stage's dep is not in active but in universe -> allowed (the dep will be fetched from cache via "pre-recovery")
// If a stage's dep is not in universe either -> throw (not part of this suite, illegal)

function topoSort(
  active: Stage<unknown>[],
  universe: Stage<unknown>[],
  _suiteName: string,
): Stage<unknown>[] {
  const universeByName = new Map<string, Stage<unknown>>()
  for (const s of universe) {
    universeByName.set(s.name, s)
  }

  const byId = new Map<string, Stage<unknown>>()
  const indeg = new Map<string, number>()
  for (const s of active) {
    byId.set(s.id, s)
    indeg.set(s.id, 0)
  }
  for (const s of active) {
    for (const dep of s.deps) {
      if (!universeByName.has(dep.name)) {
        throw new Error(
          `stage '${s.name}' depends on '${dep.name}' which is not in suite '${/* name available outside */ '?'}'`,
        )
      }
      if (!byId.has(dep.id)) {
        continue
      }
      indeg.set(s.id, (indeg.get(s.id) ?? 0) + 1)
    }
  }
  const queue: string[] = []
  for (const [id, d] of indeg) {
    if (d === 0) {
      queue.push(id)
    }
  }
  const order: Stage<unknown>[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(byId.get(id)!)
    for (const s of active) {
      if (s.deps.some((d) => d.id === id)) {
        const nd = (indeg.get(s.id) ?? 0) - 1
        indeg.set(s.id, nd)
        if (nd === 0) {
          queue.push(s.id)
        }
      }
    }
  }
  if (order.length !== active.length) {
    throw new Error('circular dependency detected among stages')
  }
  return order
}

// For stages "not in active (filtered out) but depended on by some active stage",
// recursively attempt to recover their results/checksum from cache on demand,
// and store them into stageResultById / checksumByName.
// If withCache=true and recovery fails -> throw.
async function preRecoverFilteredDeps(
  target: Stage<unknown>,
  ctx: {
    suiteName: string
    cacheDir: string
    withCache: boolean
    allStages: Stage<unknown>[]
    activeStageNames: Set<string>
    recovering: Set<string>
    stageResultById: Map<string, unknown>
    checksumByName: Map<string, string>
  },
): Promise<void> {
  for (const dep of target.deps) {
    if (ctx.activeStageNames.has(dep.name)) {
      continue
    }
    if (ctx.recovering.has(dep.name)) {
      continue
    }
    ctx.recovering.add(dep.name)

    await preRecoverFilteredDeps(dep, ctx)

    if (!dep.cacheable) {
      if (ctx.withCache) {
        throw new Error(
          `--with-cache: stage '${target.name}' needs '${dep.name}' (filtered out), but '${dep.name}' is not cache() marked`,
        )
      }
      continue
    }

    const depChecksums = new Map<string, string>()
    for (const dd of dep.deps) {
      const c = ctx.checksumByName.get(dd.name)
      if (c) {
        depChecksums.set(dd.name, c)
      }
    }

    const recovered = await tryRecoverCache(
      ctx.cacheDir,
      ctx.suiteName,
      dep,
      depChecksums,
      ctx.withCache,
    )
    if (recovered) {
      ctx.stageResultById.set(dep.id, recovered.results)
      ctx.checksumByName.set(dep.name, recovered.checksum)
    }
  }
}

export async function run(suite: Suite, options: RunOptions = {}): Promise<RunReport> {
  const startedAt = Date.now()
  const runId = options.runId ?? defaultRunId()
  const reportDir = options.reportDir ?? './reports'
  const cacheDir = options.cacheDir ?? `${reportDir}/.cache`
  const failFast = options.failFast ?? false
  const withCache = options.withCache ?? false
  const filter = options.filter
  const args = options.args ?? []
  const purge = options.purge ?? false

  if (purge) {
    await purgeCacheDir(cacheDir)
  }

  const runCtx = new RunContext(runId, suite.name)
  setGlobalRunContext(runCtx)
  setLogSink(options.log ?? ((msg: string) => console.log(msg)))

  for (const msg of _drainDeclLogs()) {
    runCtx.log(msg)
  }

  let suiteSuccess = true

  try {
    const filtered = filter ? suite.stages.filter(filter) : suite.stages.slice()
    runCtx.log(`suite '${suite.name}' (${filtered.length} stage${filtered.length === 1 ? '' : 's'})`)
    for (const s of filtered) {
      const depsText = s.deps.length ? ` (deps: ${s.deps.map((d) => d.name).join(', ')})` : ''
      const cacheText = s.cacheable ? ' [cacheable]' : ''
      runCtx.log(`  [${s.id}] ${s.name}${depsText}${cacheText}`)
    }

    if (suite.beforeFn) {
      try {
        const r = suite.beforeFn()
        if (r instanceof Promise) {
          await r
        }
      } catch (_err) {
        suiteSuccess = false
        for (const s of suite.stages) {
          if (filter && !filter(s)) {
            continue
          }
          const sc = new StageContext(s.id, s.name)
          sc.status = 'skipped'
          sc.addLog('skipped: suite before hook failed')
          runCtx.stages.push(sc)
        }
      }
    }

    if (suiteSuccess) {
      const activeStageNames = new Set(filtered.map((s) => s.name))

      const order = topoSort(filtered, suite.stages, suite.name)

      const stageResultById = new Map<string, unknown>()
      const checksumByName = new Map<string, string>()
      const failedIds = new Set<string>()

      const recovering = new Set<string>()
      let step = 0

      for (const s of order) {
        await preRecoverFilteredDeps(s, {
          suiteName: suite.name,
          cacheDir,
          withCache,
          allStages: suite.stages,
          activeStageNames,
          recovering,
          stageResultById,
          checksumByName,
        })

        const depFailed = s.deps.some((d) => failedIds.has(d.id))

        const sc = new StageContext(s.id, s.name)
        runCtx.pushStage(sc)
        step++
        runCtx.log(`[${step}/${order.length}] running '${s.name}'...`)
        try {
          if (depFailed) {
            sc.status = 'skipped'
            sc.addLog(`skipped: dep failed`)
            runCtx.log(`[${s.id}] skipped (dep failed)`)
            continue
          }

          const depResults: unknown[] = s.deps.map((d) => {
            if (!stageResultById.has(d.id)) {
              return undefined
            }
            return stageResultById.get(d.id)
          })

          if (s.cacheable && withCache) {
            const depChecksums = new Map<string, string>()
            for (const d of s.deps) {
              const c = checksumByName.get(d.name)
              if (c) {
                depChecksums.set(d.name, c)
              }
            }
            const recovered = await tryRecoverCache(
              cacheDir,
              suite.name,
              s,
              depChecksums,
              withCache,
            )
            if (recovered) {
              sc.results = recovered.results
              sc.artifacts = recovered.artifacts
              sc.assertions = recovered.assertions
              sc.logs = recovered.logs
              sc.cached = true
              sc.status = 'success'
              sc.durationMs = 0
              stageResultById.set(s.id, recovered.results)
              checksumByName.set(s.name, recovered.checksum)
              runCtx.log(
                `[${s.id}] cached (${sc.artifacts.length} artifact${
                  sc.artifacts.length === 1 ? '' : 's'
                }, ${sc.logs.length} log line${sc.logs.length === 1 ? '' : 's'})`,
              )
              continue
            }
          }

          const t0 = performance.now()
          try {
            const ret = s.fn(depResults)
            const value = ret instanceof Promise ? await ret : ret
            const t1 = performance.now()
            sc.durationMs = Math.max(0, Math.round(t1 - t0))
            sc.results = value
            sc.status = 'success'
            stageResultById.set(s.id, value)
            runCtx.log(`[${s.id}] done (${sc.durationMs}ms)`)

            if (s.cacheable) {
              const asRecord = value as CacheableRecord
              const depsChecksums: DepChecksum[] = s.deps
                .filter((d) => checksumByName.has(d.name))
                .map((d) => ({ stageName: d.name, checksum: checksumByName.get(d.name)! }))
              const cs = await writeCache(
                cacheDir,
                suite.name,
                s.name,
                asRecord,
                sc.artifacts,
                sc.assertions,
                sc.logs,
                depsChecksums,
              )
              checksumByName.set(s.name, cs)
            }
          } catch (err) {
            const t1 = performance.now()
            sc.durationMs = Math.max(0, Math.round(t1 - t0))
            sc.failWith(err)
            failedIds.add(s.id)
            runCtx.log(`[${s.id}] FAILED: ${err instanceof Error ? err.message : String(err)}`)
            if (failFast) {
              break
            }
          }
        } finally {
          runCtx.popStage()
        }
      }
    }

    if (suite.afterFn) {
      try {
        const r = suite.afterFn()
        if (r instanceof Promise) {
          await r
        }
      } catch (_err) {
        suiteSuccess = false
      }
    }
  } finally {
    setGlobalRunContext(undefined)
    setLogSink(undefined)
  }

  const totalMs = Date.now() - startedAt
  const stagesRec: StageRecord[] = runCtx.stages.map((s) => ({
    id: s.id,
    title: s.stageName,
    status: s.status,
    duration: s.durationMs,
    cached: s.cached,
    artifacts: s.artifacts.map(artifactRecord),
    logs: s.logs,
    consoleLogs: s.logs,
    debugLogs: s.logs,
    stackTrace: s.stackTrace,
    assertions: s.assertions,
  }))

  const allSuccess = suiteSuccess && stagesRec.every((s) => s.status === 'success')

  const env = {
    runtime: `deno ${Deno.version.deno}`,
    platform: Deno.build.os,
    arch: Deno.build.arch,
  }

  const report: RunReport = {
    id: runId,
    timestamp: new Date(startedAt).toISOString(),
    success: allSuccess,
    duration: totalMs,
    env,
    args,
    stages: stagesRec,
    runLogs: runCtx.runLogs,
  }

  const noReport = options.noReport ?? false
  if (!noReport) {
    const artifacts = buildArtifactMap(runCtx.stages)
    await writeReport(reportDir, report, artifacts)
  }

  return report
}
