// Runner：拓扑排序 + 调度 + 失败策略 + 缓存集成。
//
// 入口：run(suite, options) → Promise<RunReport>
//
// 执行顺序：before → stages(拓扑序, 含缓存判定) → after

import { RunContext, setGlobalRunContext, setLogSink, StageContext } from './context.ts'
import type { CacheableRecord, Stage, Suite } from './dsl.ts'
import type { DepChecksum } from './cache.ts'
import { purgeCacheDir, tryRecoverCache, writeCache } from './cache.ts'
import { buildArtifactMap, writeReport } from './reporter.ts'

export interface RunOptions {
  reportDir?: string // 默认 ./reports
  runId?: string
  filter?: (stage: Stage<unknown>) => boolean
  failFast?: boolean
  cacheDir?: string // 默认 {reportDir}/.cache
  withCache?: boolean // CLI --with-cache：严格模式，无 cache 则报错；默认 false（刷新）
  purge?: boolean // 启动前清空 cacheDir
  noReport?: boolean // 只跑不落盘报告
  args?: string[] // 记录到报告
  env?: Record<string, string>
  log?: (msg: string) => void // 日志 sink；默认 console.log
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

// ------------------------------------------------------------
// runId 生成
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// 拓扑排序（Kahn）
//
// universe = 全 suite 的 stages（用于 dep 归属校验）
// active   = 用户 filter 后要真正执行/展示的 stages（图仅由 active 构成）
//
// 如果 active 中某 stage 的 dep 不在 active 但在 universe 中 → 允许（该 dep 将通过"预恢复"从缓存拿结果）
// 如果 active 中某 stage 的 dep 也不在 universe → 抛错（不属于这个 suite，非法）
// ------------------------------------------------------------

function topoSort(
  active: Stage<unknown>[],
  universe: Stage<unknown>[],
  _suiteName: string,
): Stage<unknown>[] {
  const universeByName = new Map<string, Stage<unknown>>()
  for (const s of universe) universeByName.set(s.name, s)

  const byId = new Map<string, Stage<unknown>>()
  const indeg = new Map<string, number>()
  for (const s of active) {
    byId.set(s.id, s)
    indeg.set(s.id, 0)
  }
  for (const s of active) {
    for (const dep of s.deps) {
      // dep 不在 universe → 非法
      if (!universeByName.has(dep.name)) {
        throw new Error(
          `stage '${s.name}' depends on '${dep.name}' which is not in suite '${/* name available outside */ '?'}'`,
        )
      }
      // dep 不在 active（被 filter 排除）→ 依赖通过缓存满足（不算图中边）
      if (!byId.has(dep.id)) continue
      indeg.set(s.id, (indeg.get(s.id) ?? 0) + 1)
    }
  }
  // 循环检测
  const queue: string[] = []
  for (const [id, d] of indeg) if (d === 0) queue.push(id)
  const order: Stage<unknown>[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(byId.get(id)!)
    for (const s of active) {
      if (s.deps.some((d) => d.id === id)) {
        const nd = (indeg.get(s.id) ?? 0) - 1
        indeg.set(s.id, nd)
        if (nd === 0) queue.push(s.id)
      }
    }
  }
  if (order.length !== active.length) {
    throw new Error('circular dependency detected among stages')
  }
  return order
}

// 对"不在 active（被 filter 排除）但被某个 active stage 依赖"的 stages，
// 按需递归地尝试从缓存恢复其结果/checksum，塞到 stageResultById / checksumByName 里。
// 如果 withCache=true 且恢复失败 → 抛错。
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
    if (ctx.activeStageNames.has(dep.name)) continue // active：主循环中会处理
    if (ctx.recovering.has(dep.name)) continue
    ctx.recovering.add(dep.name)

    // 先递归处理 dep 的 deps
    await preRecoverFilteredDeps(dep, ctx)

    if (!dep.cacheable) {
      if (ctx.withCache) {
        throw new Error(
          `--with-cache: stage '${target.name}' needs '${dep.name}' (filtered out), but '${dep.name}' is not cache() marked`,
        )
      }
      // 非 strict：不给结果，下游 map 里取不到 → 传 undefined
      continue
    }

    // 组装依赖 checksums（可能是递归恢复过的，也可能是 dep 的依赖也被 filter 掉了）
    const depChecksums = new Map<string, string>()
    for (const dd of dep.deps) {
      const c = ctx.checksumByName.get(dd.name)
      if (c) depChecksums.set(dd.name, c)
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

// ------------------------------------------------------------
// run 主流程
// ------------------------------------------------------------

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

  if (purge) await purgeCacheDir(cacheDir)

  const runCtx = new RunContext(runId, suite.name)
  setGlobalRunContext(runCtx)
  setLogSink(options.log ?? ((msg: string) => console.log(msg)))

  let suiteSuccess = true

  try {
    // --- 开始时：列出本次要跑的 stage ---
    const filtered = filter ? suite.stages.filter(filter) : suite.stages.slice()
    runCtx.log(`suite '${suite.name}' (${filtered.length} stage${filtered.length === 1 ? '' : 's'})`)
    for (const s of filtered) {
      const depsText = s.deps.length ? ` (deps: ${s.deps.map((d) => d.name).join(', ')})` : ''
      const cacheText = s.cacheable ? ' [cacheable]' : ''
      runCtx.log(`  [${s.id}] ${s.name}${depsText}${cacheText}`)
    }

    // --- before hook ---
    if (suite.beforeFn) {
      try {
        const r = suite.beforeFn()
        if (r instanceof Promise) await r
      } catch (_err) {
        suiteSuccess = false
        // before 失败 → 所有 stage skipped
        for (const s of suite.stages) {
          if (filter && !filter(s)) continue
          const sc = new StageContext(s.id, s.name)
          sc.status = 'skipped'
          sc.addLog('skipped: suite before hook failed')
          runCtx.stages.push(sc)
        }
      }
    }

    if (suiteSuccess) {
      // --- filter ---
      const activeStageNames = new Set(filtered.map((s) => s.name))

      // --- 拓扑 ---
      const order = topoSort(filtered, suite.stages, suite.name)

      // results 缓存：stageId -> 返回值（执行或恢复得到）
      const stageResultById = new Map<string, unknown>()
      // stageName -> checksum（仅 cacheable 且成功/cached 有值）
      const checksumByName = new Map<string, string>()
      // 已失败 stage（后继跳过）
      const failedIds = new Set<string>()

      const recovering = new Set<string>()
      let step = 0

      for (const s of order) {
        // 对被 filter 排除的依赖（在 active 之外）先预恢复（递归）
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

        // 依赖检查：任一 dep failedIds → skip
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
              // dep 没结果：要么是（1）非 strict 且非 cacheable 且被 filter 排除，
              // 要么是（2）严格 cache 没命中（已经在上面抛错了）。
              // 传 undefined，下游 fn 自己决定。
              return undefined
            }
            return stageResultById.get(d.id)
          })

          // --- 尝试缓存恢复 ---
          // 默认（withCache=false）：不恢复，每次刷新重跑（保持 CLI 注释约定）。
          // 仅 --with-cache 严格模式下才走 tryRecoverCache。
          if (s.cacheable && withCache) {
            const depChecksums = new Map<string, string>()
            for (const d of s.deps) {
              const c = checksumByName.get(d.name)
              if (c) depChecksums.set(d.name, c)
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

          // --- 执行 fn ---
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

            // 写缓存（仅 cacheable 标记 + 成功）
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
            if (failFast) break
          }
        } finally {
          runCtx.popStage()
        }
      }
    }

    // --- after hook ---
    if (suite.afterFn) {
      try {
        const r = suite.afterFn()
        if (r instanceof Promise) await r
      } catch (_err) {
        suiteSuccess = false
        // after 失败不影响已完成 stage 状态
      }
    }
  } finally {
    setGlobalRunContext(null)
    setLogSink(null)
  }

  // --- 构建报告 ---
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

  // --- 写盘报告 ---
  const noReport = options.noReport ?? false
  if (!noReport) {
    const artifacts = buildArtifactMap(runCtx.stages)
    await writeReport(reportDir, report, artifacts)
  }

  return report
}
