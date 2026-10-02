import { emitLog, RunContext, setGlobalRunContext, setLogSink, StageContext } from './context.ts'
import type { Artifact, StageStatus } from './context.ts'
import type { Stage, Suite } from './dsl.ts'
import { writeReport } from './reporter.ts'
import type { ReportNode } from './reporter.ts'

export interface RunOptions {
  reportDir?: string
  runId?: string
  filter?: (stage: Stage<unknown>) => boolean
  noReport?: boolean
  args?: string[]
  config?: Record<string, string>
  log?: (msg: string) => void
}

export interface StageRecord {
  id: string
  name: string
  status: 'success' | 'failed' | 'skipped'
  duration: number
  deps: string[]
  skipReason: string | null
  stackTrace: string[]
  assertions: Array<{ name: string; passed: boolean; actual?: unknown; expected?: unknown }>
  artifacts: Array<{ name: string; size: number; lines?: number }>
  logPath: string
}

export interface RunReport {
  id: string
  timestamp: string
  success: boolean
  duration: number
  env: { runtime: string; platform: string; arch: string }
  args: string[]
  before: StageRecord | null
  stages: StageRecord[]
  after: StageRecord | null
}

function defaultRunId(): string {
  const now = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${
    pad(now.getMinutes())
  }-${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}`
  return ts
}

function artifactRecord(a: Artifact) {
  let lines: number | undefined
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(a.bytes)
    lines = text.split('\n').length
  } catch {
    lines = undefined
  }
  return { name: a.name, size: a.bytes.length, lines }
}

function computeActive(suite: Suite, filter?: (stage: Stage<unknown>) => boolean): Stage<unknown>[] {
  const suiteSet = new Set<Stage<unknown>>(suite.stages)
  const activeSet = new Set<Stage<unknown>>()
  const queue: Stage<unknown>[] = []
  const seeds = filter ? suite.stages.filter(filter) : suite.stages.slice()
  for (const s of seeds) {
    activeSet.add(s)
    queue.push(s)
  }
  while (queue.length) {
    const s = queue.pop()!
    for (const d of s.deps) {
      if (!suiteSet.has(d)) {
        throw new Error(`stage '${s.name}' depends on '${d.name}' which is not in suite '${suite.name}'`)
      }
      if (!activeSet.has(d)) {
        activeSet.add(d)
        queue.push(d)
      }
    }
  }
  return suite.stages.filter((s) => activeSet.has(s))
}

function topoSort(active: Stage<unknown>[]): Stage<unknown>[] {
  const byId = new Map<string, Stage<unknown>>()
  const indeg = new Map<string, number>()
  for (const s of active) {
    byId.set(s.id, s)
    indeg.set(s.id, 0)
  }
  for (const s of active) {
    for (const d of s.deps) {
      if (byId.has(d.id)) {
        indeg.set(s.id, (indeg.get(s.id) ?? 0) + 1)
      }
    }
  }
  const queue: Stage<unknown>[] = active.filter((s) => indeg.get(s.id) === 0)
  const order: Stage<unknown>[] = []
  while (queue.length) {
    const s = queue.shift()!
    order.push(s)
    for (const t of active) {
      if (t.deps.some((d) => d.id === s.id)) {
        const nd = (indeg.get(t.id) ?? 0) - 1
        indeg.set(t.id, nd)
        if (nd === 0) {
          queue.push(t)
        }
      }
    }
  }
  if (order.length !== active.length) {
    throw new Error('circular dependency detected among stages')
  }
  return order
}

function nodeLogPath(id: string): string {
  if (id === 'before') {
    return 'before/logs.txt'
  }
  if (id === 'after') {
    return 'after/logs.txt'
  }
  return `stages/${id}/logs.txt`
}

function toRecord(ctx: StageContext, deps: readonly Stage<unknown>[]): StageRecord {
  return {
    id: ctx.id,
    name: ctx.stageName,
    status: ctx.status,
    duration: ctx.durationMs,
    deps: deps.map((d) => d.name),
    skipReason: ctx.skipReason,
    stackTrace: ctx.stackTrace,
    assertions: ctx.assertions,
    artifacts: ctx.artifacts.map(artifactRecord),
    logPath: nodeLogPath(ctx.id),
  }
}

async function runHook(
  runCtx: RunContext,
  id: string,
  fn: () => void | Promise<void>,
): Promise<StageContext> {
  const ctx = new StageContext(id, id)
  runCtx.pushStage(ctx)
  const t0 = performance.now()
  try {
    const r = fn()
    if (r instanceof Promise) {
      await r
    }
    ctx.status = 'success'
  } catch (err) {
    ctx.failWith(err)
  } finally {
    ctx.durationMs = Math.max(0, Math.round(performance.now() - t0))
    runCtx.popStage()
  }
  return ctx
}

export async function run(suite: Suite, options: RunOptions = {}): Promise<RunReport> {
  const startedAt = Date.now()
  const runId = options.runId ?? defaultRunId()
  const reportDir = options.reportDir ?? './reports'
  const filter = options.filter
  const args = options.args ?? []
  const config = options.config ?? {}
  const noReport = options.noReport ?? false

  const runCtx = new RunContext(runId, suite.name, config)
  setGlobalRunContext(runCtx)
  setLogSink(options.log ?? ((msg: string) => console.log(msg)))

  try {
    const active = computeActive(suite, filter)
    const order = topoSort(active)
    const depMap = new Map(order.map((s) => [s.id, s] as const))

    const beforeCtx = suite.beforeFn ? await runHook(runCtx, 'before', suite.beforeFn) : null
    const beforeFailed = beforeCtx !== null && beforeCtx.status === 'failed'
    if (beforeFailed) {
      const count = order.length
      const suffix = count ? `; skipping ${count} stage${count === 1 ? '' : 's'}` : ''
      emitLog(`before failed: ${beforeCtx.stackTrace[0] ?? 'unknown error'}${suffix}`)
    }

    const resultOf = new Map<string, unknown>()
    const statusOf = new Map<string, StageStatus>()
    const stageCtxs: StageContext[] = []
    let step = 0

    for (const s of order) {
      step++
      const ctx = new StageContext(s.id, s.name)
      stageCtxs.push(ctx)
      runCtx.pushStage(ctx)
      try {
        if (beforeFailed) {
          ctx.skip('before failed')
          statusOf.set(s.id, 'skipped')
          emitLog(`[${s.name}] skipped: before failed`)
          continue
        }

        const failedDep = s.deps.find((d) => {
          const st = statusOf.get(d.id)
          return st === 'failed' || st === 'skipped'
        })
        if (failedDep) {
          ctx.skip(`dep '${failedDep.name}' failed`)
          statusOf.set(s.id, 'skipped')
          emitLog(`[${s.name}] skipped: dep '${failedDep.name}' failed`)
          continue
        }

        emitLog(`[${step}/${order.length}] running '${s.name}'...`)
        const depResults = s.deps.map((d) => resultOf.get(d.id))
        const t0 = performance.now()
        try {
          const ret = s.fn(depResults)
          const value = ret instanceof Promise ? await ret : ret
          ctx.durationMs = Math.max(0, Math.round(performance.now() - t0))
          ctx.status = 'success'
          ctx.results = value
          resultOf.set(s.id, value)
          statusOf.set(s.id, 'success')
        } catch (err) {
          ctx.durationMs = Math.max(0, Math.round(performance.now() - t0))
          ctx.failWith(err)
          statusOf.set(s.id, 'failed')
          emitLog(`[${s.name}] FAILED: ${ctx.stackTrace[0] ?? 'unknown error'}`)
        }
      } finally {
        runCtx.popStage()
      }
    }

    const afterCtx = suite.afterFn ? await runHook(runCtx, 'after', suite.afterFn) : null
    if (afterCtx !== null && afterCtx.status === 'failed') {
      emitLog(`after failed: ${afterCtx.stackTrace[0] ?? 'unknown error'}`)
    }

    const totalMs = Date.now() - startedAt
    const stagesRec = stageCtxs.map((c) => toRecord(c, depMap.get(c.id)?.deps ?? []))
    const beforeRec = beforeCtx ? toRecord(beforeCtx, []) : null
    const afterRec = afterCtx ? toRecord(afterCtx, []) : null

    const stagesOk = stageCtxs.every((c) => c.status === 'success')
    const beforeOk = beforeCtx === null || beforeCtx.status === 'success'
    const afterOk = afterCtx === null || afterCtx.status === 'success'
    const success = beforeOk && afterOk && stagesOk

    const env = {
      runtime: `deno ${Deno.version.deno}`,
      platform: Deno.build.os,
      arch: Deno.build.arch,
    }

    const report: RunReport = {
      id: runId,
      timestamp: new Date(startedAt).toISOString(),
      success,
      duration: totalMs,
      env,
      args,
      before: beforeRec,
      stages: stagesRec,
      after: afterRec,
    }

    if (!noReport) {
      const nodes: ReportNode[] = []
      if (beforeCtx && beforeRec) {
        nodes.push({ record: beforeRec, logs: beforeCtx.logs, artifacts: beforeCtx.artifacts, dir: 'before' })
      }
      stageCtxs.forEach((c, i) => {
        nodes.push({ record: stagesRec[i], logs: c.logs, artifacts: c.artifacts, dir: `stages/${c.id}` })
      })
      if (afterCtx && afterRec) {
        nodes.push({ record: afterRec, logs: afterCtx.logs, artifacts: afterCtx.artifacts, dir: 'after' })
      }
      await writeReport(reportDir, report, nodes)
    }

    return report
  } finally {
    setGlobalRunContext(undefined)
    setLogSink(undefined)
  }
}
