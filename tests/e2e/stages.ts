/**
 * E2E 测试阶段定义与流水线执行器。
 *
 * 阶段列表：
 *   TANGLE 流水线：
 *     1. parse tangle-official.pas
 *     2. compile tangle to JS
 *     3. run tangle on tangle.web → tangle.pas (v1)
 *     4. parse tangle.pas (v1)
 *     5. bootstrap: run v1 on tangle.web → v2
 *     6. bootstrap: run v2 on tangle.web → v3
 *     7. verify v2 === v3 (自举稳定性)
 *   TEX82 流水线：
 *     8. run tangle on tex.web → tex.pas
 *     9. parse tex.pas
 *    10. compile tex.pas → tex.js
 *    11. run TeX on hello.tex (简单测试)
 *    12. run TeX on trip.tex (TRIP 测试，含输出检查)
 *    13. verify trip banner (基本验证)
 *    14. compare trip output vs trip.fot (详细比对)
 *
 * 设计：
 *   - 流水线模式：阶段顺序执行，复用上一阶段结果，失败则后续跳过
 *   --fresh 模式：每阶段独立运行（用于调试单阶段）
 */
import * as os from 'os'
import { parse } from '@/index'
import { transform } from '@/il/transform'
import { pascalHPlugin } from '@/il/plugins/pascal-h.plugin'
import {
  readResource,
  readResourceBytes,
  runTangle,
  compileTeX,
  runTeXCompiled,
  formatBytes,
  firstLine,
  tailLines,
  previewLine,
  extractModuleNumbers,
  countLines,
  TANGLE_PAS,
  TANGLE_WEB,
  TEX_WEB,
  TRIP_TEX,
  TRIP_TFM,
  TRIP_FOT,
} from './_helper'
import {
  TestReport,
  StageReport,
  StageArtifact,
  writeReport,
  createReport,
  REPORT_DIR,
} from './reporter'
import * as path from 'path'
import * as fs from 'fs'

// ============================================================
// 命令行参数
// ============================================================

export interface CliOptions {
  stages?: number[]
  list: boolean
  report: boolean
  noCache: boolean
}

export function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = { list: false, report: false, noCache: false }
  for (const arg of args) {
    if (arg === '--list') {
      opts.list = true
    } else if (arg === '--report') {
      opts.report = true
    } else if (arg === '--fresh') {
      opts.noCache = true
    } else if (arg.startsWith('--stage=')) {
      const v = arg.slice('--stage='.length)
      const nums = v.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
      opts.stages = [...(opts.stages ?? []), ...nums]
    }
  }
  return opts
}

// ============================================================
// 阶段定义
// ============================================================

interface StageDef {
  id: number
  title: string
  run: (ctx: PipelineContext) => Promise<StageReport> | StageReport
}

// ============================================================
// 流水线上下文
// ============================================================

interface RunResult {
  pascal: string
  pool: string
  output: string
  status: string
  error?: string
}

interface PipelineContext {
  tanglePas: string
  tangleWeb: string
  texWeb: string
  helloTex: string
  tripTex: string
  tripTfm: Uint8Array
  tripFot: string

  compiledJs: string
  v1: RunResult | null
  v1ParseOk: boolean
  v2: RunResult | null
  v3: RunResult | null

  tex: RunResult | null
  texParseOk: boolean
  texCompiledJs: string
  texCompileOk: boolean
  texCompileError: string
  hello: { output: string; status: string; error?: string; steps: number } | null
  trip: { output: string; status: string; error?: string; steps: number } | null

  failedAt: string
}

function createContext(): PipelineContext {
  return {
    tanglePas: '', tangleWeb: '', texWeb: '', helloTex: '', tripTex: '',
    tripTfm: new Uint8Array(0), tripFot: '',
    compiledJs: '', v1: null, v1ParseOk: false, v2: null, v3: null,
    tex: null, texParseOk: false, texCompiledJs: '', texCompileOk: false,
    texCompileError: '', hello: null, trip: null, failedAt: '',
  }
}

// ============================================================
// 辅助函数
// ============================================================

function now(): number { return Date.now() }
function timestamp(): string { return new Date().toISOString() }

/** 构造产物（含完整内容，用于保存到报告文件夹） */
function artifact(name: string, content: string): StageArtifact {
  return {
    name,
    content,
    size: Buffer.byteLength(content, 'utf-8'),
    lines: countLines(content),
  }
}

function successStage(
  id: string, title: string, duration: number,
  opts: {
    metrics?: Record<string, string | number | boolean>
    artifacts?: StageArtifact[]
    logs?: string[]
    consoleLogs?: string[]
    debugLogs?: string[]
    stackTrace?: string[]
    assertions?: StageReport['assertions']
  } = {}
): StageReport {
  return {
    id, title, status: 'success', duration,
    metrics: opts.metrics ?? {},
    artifacts: opts.artifacts ?? [],
    logs: opts.logs ?? [],
    consoleLogs: opts.consoleLogs ?? [],
    debugLogs: opts.debugLogs ?? [],
    stackTrace: opts.stackTrace ?? [],
    assertions: opts.assertions ?? [],
  }
}

function failedStage(
  id: string, title: string, duration: number, error: string,
  opts: {
    metrics?: Record<string, string | number | boolean>
    artifacts?: StageArtifact[]
    logs?: string[]
    consoleLogs?: string[]
    debugLogs?: string[]
    stackTrace?: string[]
    assertions?: StageReport['assertions']
  } = {}
): StageReport {
  return {
    id, title, status: 'failed', duration, error,
    metrics: opts.metrics ?? {},
    artifacts: opts.artifacts ?? [],
    logs: opts.logs ?? [],
    consoleLogs: opts.consoleLogs ?? [],
    debugLogs: opts.debugLogs ?? [],
    stackTrace: opts.stackTrace ?? [],
    assertions: opts.assertions ?? [],
  }
}

function skippedStage(id: string, title: string, reason: string): StageReport {
  return {
    id, title, status: 'skipped', duration: 0,
    metrics: { reason },
    artifacts: [], logs: [], consoleLogs: [], debugLogs: [], stackTrace: [],
    assertions: [],
  }
}

function assert(
  name: string, cond: boolean, actual?: string, expected?: string
): { name: string; passed: boolean; actual?: string; expected?: string } {
  return { name, passed: cond, actual, expected }
}

// ============================================================
// 阶段定义
// ============================================================

const stages: StageDef[] = [
  // ============================================================
  // TANGLE 流水线
  // ============================================================

  {
    id: 1,
    title: 'parse tangle-official.pas',
    run: (ctx) => {
      const t0 = now()
      ctx.tanglePas = readResource(TANGLE_PAS)
      ctx.tangleWeb = readResource(TANGLE_WEB)
      ctx.texWeb = readResource(TEX_WEB)
      ctx.helloTex = readResource('hello.tex')
      ctx.tripTex = readResource(TRIP_TEX)
      ctx.tripTfm = readResourceBytes(TRIP_TFM)
      ctx.tripFot = readResource(TRIP_FOT)

      let ok = false
      let error: string | undefined
      let stackTrace: string[] = []
      try {
        const result = parse(ctx.tanglePas)
        ok = result.success
        if (!result.success) error = `parse failed: ${result.error ?? 'unknown'}`
      } catch (e: any) {
        error = e?.message || String(e)
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }

      const duration = now() - t0
      const metrics = { inputSize: formatBytes(ctx.tanglePas.length), lineCount: countLines(ctx.tanglePas) }
      const artifacts = [artifact('tangle-official.pas', ctx.tanglePas)]

      if (!ok) {
        ctx.failedAt = '1'
        return failedStage('1', 'parse tangle-official.pas', duration, error!, {
          metrics, artifacts, stackTrace,
          assertions: [assert('parse ok', false, 'fail', 'ok')],
        })
      }
      return successStage('1', 'parse tangle-official.pas', duration, {
        metrics, artifacts,
        logs: [`first: ${previewLine(ctx.tanglePas)}`],
        assertions: [assert('parse ok', true)],
      })
    },
  },

  {
    id: 2,
    title: 'compile tangle to JS',
    run: (ctx) => {
      const t0 = now()
      let ok = false
      let error: string | undefined
      let stackTrace: string[] = []
      try {
        ctx.compiledJs = transform(ctx.tanglePas, {
          extensions: ['string'],
          programFileUrls: { WEBFILE: 'WEBFILE', CHANGEFILE: 'CHANGEFILE', PASCALFILE: 'PASCALFILE', POOL: 'POOL' },
          plugins: [pascalHPlugin],
        })
        ok = ctx.compiledJs.length > 0
      } catch (e: any) {
        error = e?.message || String(e)
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }

      const duration = now() - t0
      const metrics = { jsSize: formatBytes(ctx.compiledJs.length), jsLines: countLines(ctx.compiledJs) }
      const assertions = [
        assert('compile ok', ok, ok ? 'ok' : 'fail', 'ok'),
        assert('jsSize > 10KB', ctx.compiledJs.length > 10000, formatBytes(ctx.compiledJs.length), '> 10 KB'),
      ]

      if (!ok) {
        ctx.failedAt = '2'
        return failedStage('2', 'compile tangle to JS', duration, error!, { metrics, assertions, stackTrace })
      }
      return successStage('2', 'compile tangle to JS', duration, {
        metrics,
        artifacts: [artifact('tangle.js', ctx.compiledJs)],
        assertions,
      })
    },
  },

  {
    id: 3,
    title: 'run tangle on tangle.web → tangle.pas (v1)',
    run: (ctx) => {
      const t0 = now()
      let debugLog: string[] = []
      let stackTrace: string[] = []
      try {
        const r = runTangle(ctx.tanglePas, ctx.tangleWeb)
        debugLog = r.debugLog ?? []
        ctx.v1 = { pascal: r.pascal, pool: r.pool, output: r.output, status: r.state.status, error: r.state.error?.message }
        if (r.state.error?.stackTrace) stackTrace = r.state.error.stackTrace
        if (r.state.status !== 'terminated') ctx.failedAt = '3'
      } catch (e: any) {
        ctx.v1 = { pascal: '', pool: '', output: '', status: 'error', error: e?.message }
        ctx.failedAt = '3'
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }

      const duration = now() - t0
      const ok = ctx.v1?.status === 'terminated'
      const metrics = {
        webInput: formatBytes(ctx.tangleWeb.length),
        status: ctx.v1?.status ?? 'unknown',
        pascalOut: formatBytes(ctx.v1?.pascal.length ?? 0),
        poolOut: formatBytes(ctx.v1?.pool.length ?? 0),
        banner: firstLine(ctx.v1?.output ?? ''),
        modules: extractModuleNumbers(ctx.v1?.output ?? ''),
      }
      const assertions = [
        assert('run ok', ok, ctx.v1?.status, 'terminated'),
        assert('pascalOut > 1KB', (ctx.v1?.pascal.length ?? 0) > 1000, formatBytes(ctx.v1?.pascal.length ?? 0), '> 1 KB'),
        assert('banner v2.8', ctx.v1?.output.includes('This is TANGLE, Version 2.8') ?? false, undefined, 'contains'),
        assert('output has *1*', ctx.v1?.output.includes('*1*') ?? false, undefined, 'contains'),
        assert('output has Done.', ctx.v1?.output.includes('Done.') ?? false, undefined, 'contains'),
        assert('pascal has PROGRAM TANGLE', ctx.v1?.pascal.includes('PROGRAM TANGLE') ?? false, undefined, 'contains'),
      ]
      const artifacts = ctx.v1?.pascal ? [
        artifact('tangle.pas.v1', ctx.v1.pascal),
        artifact('tangle.pool.v1', ctx.v1.pool),
      ] : []

      if (!ok) {
        return failedStage('3', 'run tangle on tangle.web → v1', duration, ctx.v1?.error ?? 'unknown', {
          metrics, artifacts, assertions, debugLogs: debugLog, stackTrace,
        })
      }
      return successStage('3', 'run tangle on tangle.web → v1', duration, {
        metrics, artifacts,
        logs: [
          `banner: ${firstLine(ctx.v1!.output)}`,
          `pascal first: ${previewLine(ctx.v1!.pascal)}`,
          ...tailLines(ctx.v1!.output, 8).map((l, i, arr) => `tail[${arr.length - i}]: ${JSON.stringify(l)}`),
        ],
        assertions, debugLogs: debugLog,
      })
    },
  },

  {
    id: 4,
    title: 'parse tangle.pas (v1)',
    run: (ctx) => {
      const t0 = now()
      let ok = false
      let error: string | undefined
      let stackTrace: string[] = []
      try {
        const result = parse(ctx.v1!.pascal)
        ctx.v1ParseOk = result.success
        ok = result.success
        if (!result.success) error = `parse failed: ${result.error ?? 'unknown'}`
      } catch (e: any) {
        ctx.v1ParseOk = false
        error = e?.message || String(e)
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }

      const duration = now() - t0
      if (!ok) ctx.failedAt = '4'
      return {
        id: '4', title: 'parse tangle.pas (v1)', status: ok ? 'success' : 'failed', duration,
        metrics: { pascalSize: formatBytes(ctx.v1?.pascal.length ?? 0), parseResult: ok ? 'ok' : 'fail' },
        artifacts: ctx.v1?.pascal ? [artifact('tangle.pas.v1', ctx.v1.pascal)] : [],
        logs: error ? [`error: ${error}`] : [],
        consoleLogs: [], debugLogs: [], stackTrace,
        error,
        assertions: [assert('parse ok', ok, ok ? 'ok' : 'fail', 'ok')],
      }
    },
  },

  {
    id: 5,
    title: 'bootstrap: run v1 on tangle.web → v2',
    run: (ctx) => {
      if (ctx.failedAt) return skippedStage('5', 'bootstrap v1 → v2', `prev ${ctx.failedAt} failed`)
      const t0 = now()
      let debugLog: string[] = []
      let stackTrace: string[] = []
      try {
        const r = runTangle(ctx.v1!.pascal, ctx.tangleWeb)
        debugLog = r.debugLog ?? []
        ctx.v2 = { pascal: r.pascal, pool: r.pool, output: r.output, status: r.state.status, error: r.state.error?.message }
        if (r.state.error?.stackTrace) stackTrace = r.state.error.stackTrace
        if (r.state.status !== 'terminated') ctx.failedAt = '5'
      } catch (e: any) {
        ctx.v2 = { pascal: '', pool: '', output: '', status: 'error', error: e?.message }
        ctx.failedAt = '5'
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }

      const duration = now() - t0
      const ok = ctx.v2?.status === 'terminated'
      const metrics = {
        status: ctx.v2?.status ?? 'unknown',
        pascalOut: formatBytes(ctx.v2?.pascal.length ?? 0),
        banner: firstLine(ctx.v2?.output ?? ''),
        modules: extractModuleNumbers(ctx.v2?.output ?? ''),
      }
      const assertions = [
        assert('run ok', ok, ctx.v2?.status, 'terminated'),
        assert('banner v4.6', ctx.v2?.output.includes('This is TANGLE, Version 4.6') ?? false, undefined, 'contains'),
        assert('output has Done.', ctx.v2?.output.includes('Done.') ?? false, undefined, 'contains'),
      ]

      if (!ok) {
        return failedStage('5', 'bootstrap v1 → v2', duration, ctx.v2?.error ?? 'unknown', {
          metrics,
          artifacts: ctx.v2?.pascal ? [artifact('tangle.pas.v2', ctx.v2.pascal)] : [],
          assertions, debugLogs: debugLog, stackTrace,
        })
      }
      return successStage('5', 'bootstrap v1 → v2', duration, {
        metrics,
        artifacts: [artifact('tangle.pas.v2', ctx.v2!.pascal)],
        logs: [
          `banner: ${firstLine(ctx.v2!.output)}`,
          ...tailLines(ctx.v2!.output, 5).map((l, i, arr) => `tail[${arr.length - i}]: ${JSON.stringify(l)}`),
        ],
        assertions, debugLogs: debugLog,
      })
    },
  },

  {
    id: 6,
    title: 'bootstrap: run v2 on tangle.web → v3',
    run: (ctx) => {
      if (ctx.failedAt) return skippedStage('6', 'bootstrap v2 → v3', `prev ${ctx.failedAt} failed`)
      const t0 = now()
      let debugLog: string[] = []
      let stackTrace: string[] = []
      try {
        const r = runTangle(ctx.v2!.pascal, ctx.tangleWeb)
        debugLog = r.debugLog ?? []
        ctx.v3 = { pascal: r.pascal, pool: r.pool, output: r.output, status: r.state.status, error: r.state.error?.message }
        if (r.state.error?.stackTrace) stackTrace = r.state.error.stackTrace
      } catch (e: any) {
        ctx.v3 = { pascal: '', pool: '', output: '', status: 'error', error: e?.message }
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }

      const duration = now() - t0
      const ok = ctx.v3?.status === 'terminated'
      const metrics = {
        status: ctx.v3?.status ?? 'unknown',
        pascalOut: formatBytes(ctx.v3?.pascal.length ?? 0),
        banner: firstLine(ctx.v3?.output ?? ''),
      }
      const assertions = [
        assert('run ok', ok, ctx.v3?.status, 'terminated'),
        assert('banner v4.6', ctx.v3?.output.includes('This is TANGLE, Version 4.6') ?? false, undefined, 'contains'),
      ]

      if (!ok) {
        return failedStage('6', 'bootstrap v2 → v3', duration, ctx.v3?.error ?? 'unknown', {
          metrics, assertions, debugLogs: debugLog, stackTrace,
        })
      }
      return successStage('6', 'bootstrap v2 → v3', duration, {
        metrics,
        artifacts: [artifact('tangle.pas.v3', ctx.v3!.pascal)],
        logs: [
          `banner: ${firstLine(ctx.v3!.output ?? '')}`,
          ...tailLines(ctx.v3!.output ?? '', 5).map((l, i, arr) => `tail[${arr.length - i}]: ${JSON.stringify(l)}`),
        ],
        assertions, debugLogs: debugLog,
      })
    },
  },

  {
    id: 7,
    title: 'verify v2 === v3 (自举稳定性)',
    run: (ctx) => {
      if (ctx.failedAt) return skippedStage('7', 'verify v2 === v3', `prev ${ctx.failedAt} failed`)
      const t0 = now()
      const v2Pascal = ctx.v2?.pascal ?? ''
      const v3Pascal = ctx.v3?.pascal ?? ''
      const equal = v2Pascal === v3Pascal
      const v2Pool = ctx.v2?.pool ?? ''
      const v3Pool = ctx.v3?.pool ?? ''
      const poolEqual = v2Pool === v3Pool

      const duration = now() - t0
      const metrics = {
        v2Pascal: formatBytes(v2Pascal.length),
        v3Pascal: formatBytes(v3Pascal.length),
        v2EqV3: equal,
        v2Pool: formatBytes(v2Pool.length),
        v3Pool: formatBytes(v3Pool.length),
        poolEq: poolEqual,
      }
      const assertions = [
        assert('pascal v2 === v3', equal, `${formatBytes(v2Pascal.length)} vs ${formatBytes(v3Pascal.length)}`, 'identical'),
        assert('pool v2 === v3', poolEqual, `${formatBytes(v2Pool.length)} vs ${formatBytes(v3Pool.length)}`, 'identical'),
      ]

      if (!equal) {
        return failedStage('7', 'verify v2 === v3', duration, 'v2 !== v3, bootstrap unstable', { metrics, assertions })
      }
      return successStage('7', 'verify v2 === v3', duration, {
        metrics,
        logs: ['bootstrap stable: v2 === v3'],
        assertions,
      })
    },
  },

  // ============================================================
  // TEX82 流水线
  // ============================================================

  {
    id: 8,
    title: 'run tangle on tex.web → tex.pas',
    run: (ctx) => {
      // 使用 4.x 自举版本（v3，失败则回退 v2）编译 tex.web。
      // v1/tangle-official.pas 是低版本 TANGLE（2.8），其字符串池 ID 分配与
      // TeX 期望的 4.x pool 不一致（差 128），会导致 banner 显示错误字符串。
      const tangleSrc = ctx.v3?.pascal ?? ctx.v2?.pascal ?? ''
      const tangleSrcLabel = ctx.v3?.pascal ? 'v3' : ctx.v2?.pascal ? 'v2' : 'none'
      if (!tangleSrc) {
        return skippedStage('8', 'run tangle on tex.web → tex.pas', 'no 4.x tangle available (v2/v3 missing)')
      }
      const t0 = now()
      let debugLog: string[] = []
      let stackTrace: string[] = []
      try {
        const r = runTangle(tangleSrc, ctx.texWeb)
        debugLog = r.debugLog ?? []
        ctx.tex = { pascal: r.pascal, pool: r.pool, output: r.output, status: r.state.status, error: r.state.error?.message }
        if (r.state.error?.stackTrace) stackTrace = r.state.error.stackTrace
      } catch (e: any) {
        ctx.tex = { pascal: '', pool: '', output: '', status: 'error', error: e?.message }
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }

      const duration = now() - t0
      const ok = ctx.tex?.status === 'terminated'
      const metrics = {
        tangleSource: tangleSrcLabel,
        webInput: formatBytes(ctx.texWeb.length),
        status: ctx.tex?.status ?? 'unknown',
        pascalOut: formatBytes(ctx.tex?.pascal.length ?? 0),
        poolOut: formatBytes(ctx.tex?.pool.length ?? 0),
        banner: firstLine(ctx.tex?.output ?? ''),
        modules: extractModuleNumbers(ctx.tex?.output ?? ''),
      }
      const assertions = [
        assert('run ok', ok, ctx.tex?.status, 'terminated'),
        assert('pascalOut > 100KB', (ctx.tex?.pascal.length ?? 0) > 100000, formatBytes(ctx.tex?.pascal.length ?? 0), '> 100 KB'),
        assert('pascal has PROGRAM TEX', ctx.tex?.pascal.includes('PROGRAM TEX') ?? false, undefined, 'contains'),
        assert('output has Done.', ctx.tex?.output.includes('Done.') ?? false, undefined, 'contains'),
      ]
      // 提取 TANGLE 输出中的错误行（以 '! ' 开头）和警告行
      const tangleOut = ctx.tex?.output ?? ''
      const errorLines = tangleOut.split('\n').filter((l) => l.startsWith('! ') || l.includes('Pardon me'))
      const hasErrorHistory = tangleOut.includes('Pardon me, but I think I spotted something wrong.')
      const artifacts = ctx.tex?.pascal ? [
        artifact('tex.pas', ctx.tex.pascal),
        artifact('tex.pool', ctx.tex.pool),
        artifact('tex.tangle.out', tangleOut),
      ] : []

      if (!ok) {
        return failedStage('8', 'run tangle on tex.web → tex.pas', duration, ctx.tex?.error ?? 'unknown', {
          metrics, artifacts, assertions, debugLogs: debugLog, stackTrace,
        })
      }
      return successStage('8', 'run tangle on tex.web → tex.pas', duration, {
        metrics: { ...metrics, hasErrorHistory },
        artifacts,
        logs: [
          `tangleSource: ${tangleSrcLabel} (4.x)`,
          `banner: ${firstLine(ctx.tex!.output)}`,
          `pascal first: ${previewLine(ctx.tex!.pascal)}`,
          ...tailLines(ctx.tex!.output, 8).map((l, i, arr) => `tail[${arr.length - i}]: ${JSON.stringify(l)}`),
          ...(errorLines.length > 0 ? errorLines.map((l) => `error: ${JSON.stringify(l)}`) : []),
        ],
        assertions, debugLogs: debugLog,
      })
    },
  },

  {
    id: 9,
    title: 'parse tex.pas',
    run: (ctx) => {
      if (!ctx.tex || ctx.tex.status !== 'terminated') {
        return skippedStage('9', 'parse tex.pas', 'tex.pas not generated')
      }
      const t0 = now()
      let ok = false
      let error: string | undefined
      let stackTrace: string[] = []
      try {
        const result = parse(ctx.tex.pascal)
        ctx.texParseOk = result.success
        ok = result.success
        if (!result.success) error = `parse failed: ${result.error ?? 'unknown'}`
      } catch (e: any) {
        ctx.texParseOk = false
        error = e?.message || String(e)
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }

      const duration = now() - t0
      return {
        id: '9', title: 'parse tex.pas', status: ok ? 'success' : 'failed', duration,
        metrics: {
          pascalSize: formatBytes(ctx.tex.pascal.length),
          lineCount: countLines(ctx.tex.pascal),
          parseResult: ok ? 'ok' : 'fail',
        },
        artifacts: [artifact('tex.pas', ctx.tex.pascal)],
        logs: error ? [`error: ${error}`] : [],
        consoleLogs: [], debugLogs: [], stackTrace,
        error,
        assertions: [assert('parse ok', ok, ok ? 'ok' : 'fail', 'ok')],
      }
    },
  },

  {
    id: 10,
    title: 'compile tex.pas → tex.js',
    run: (ctx) => {
      if (!ctx.texParseOk || !ctx.tex) return skippedStage('10', 'compile tex.pas → tex.js', 'tex.pas parse failed')
      const t0 = now()
      let ok = false
      let error: string | undefined
      let stackTrace: string[] = []
      try {
        ctx.texCompiledJs = compileTeX(ctx.tex.pascal, [pascalHPlugin])
        ok = ctx.texCompiledJs.length > 0
      } catch (e: any) {
        ok = false
        error = e?.message || String(e)
        ctx.texCompileError = error ?? ''
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }
      ctx.texCompileOk = ok

      const duration = now() - t0
      const metrics = {
        pascalInput: formatBytes(ctx.tex.pascal.length),
        jsOut: formatBytes(ctx.texCompiledJs.length),
        jsLines: countLines(ctx.texCompiledJs),
        compileResult: ok ? 'ok' : 'fail',
        plugin: 'pascalH',
      }
      const assertions = [
        assert('compile ok', ok, ok ? 'ok' : 'fail', 'ok'),
        assert('jsOut > 50KB', ctx.texCompiledJs.length > 50000, formatBytes(ctx.texCompiledJs.length), '> 50 KB'),
      ]

      if (!ok) {
        return failedStage('10', 'compile tex.pas → tex.js', duration, error ?? 'unknown', {
          metrics,
          logs: error ? [`error: ${error.slice(0, 500)}`] : [],
          assertions, stackTrace,
        })
      }
      return successStage('10', 'compile tex.pas → tex.js', duration, {
        metrics,
        artifacts: [artifact('tex.js', ctx.texCompiledJs)],
        logs: [`js first: ${previewLine(ctx.texCompiledJs)}`],
        assertions,
      })
    },
  },

  {
    id: 11,
    title: 'run TeX on hello.tex (简单测试)',
    run: (ctx) => {
      if (!ctx.texCompileOk) return skippedStage('11', 'run TeX on hello.tex', 'tex.pas compile failed')
      const t0 = now()
      let debugLog: string[] = []
      let stackTrace: string[] = []
      try {
        const r = runTeXCompiled(ctx.texCompiledJs, {
          input: ['hello'],
          files: {
            'hello.tex': ctx.helloTex,
            'TeXformats:TEX.POOL': ctx.tex!.pool,
          },
          maxSteps: 2e9,
          plugins: [pascalHPlugin],
        })
        debugLog = r.debugLog ?? []
        if (r.state.error?.stackTrace) stackTrace = r.state.error.stackTrace
        ctx.hello = { output: r.output, status: r.state.status, error: r.state.error?.message, steps: r.state.steps }
      } catch (e: any) {
        ctx.hello = { output: '', status: 'error', error: e?.message, steps: 0 }
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }

      const duration = now() - t0
      const output = ctx.hello?.output ?? ''
      const ok = ctx.hello?.status === 'terminated'
      const hasBanner = output.includes('This is TeX') ?? false
      const hasEmergencyStop = output.includes('! Emergency stop.')
      const hasNoPages = output.includes('No pages of output')
      // hello.tex 应该正常输出，不能有 Emergency stop
      const outputOk = ok && !hasEmergencyStop && !hasNoPages
      const metrics = {
        inputFile: 'hello.tex',
        inputSize: formatBytes(ctx.helloTex.length),
        status: ctx.hello?.status ?? 'unknown',
        steps: ctx.hello?.steps ?? 0,
        outputSize: formatBytes(output.length),
        banner: firstLine(output),
        hasEmergencyStop,
        hasNoPages,
      }
      const assertions = [
        assert('run ok', ok, ctx.hello?.status, 'terminated'),
        assert('output has This is TeX', hasBanner, undefined, 'contains'),
        assert('no Emergency stop', !hasEmergencyStop, undefined, 'no emergency stop'),
        assert('has pages of output', !hasNoPages, undefined, 'has pages'),
      ]
      const outputLines = output.split('\n').filter((l) => l.length > 0)
      // 诊断行
      const diagLines: string[] = []
      if (hasEmergencyStop) diagLines.push('diag: Emergency stop detected - TeX aborted prematurely')
      if (hasNoPages) diagLines.push('diag: No pages of output - TeX did not produce DVI')
      // 检查输入文件名是否被错误读取（字符偏移问题）
      const hasHelloTex = output.includes('hello.tex') || output.includes('hello')
      const hasEeXformat = output.includes('eXformat')
      if (!hasHelloTex && hasEeXformat) {
        diagLines.push('diag: output contains "eXformat" instead of "hello" - input filename first char dropped (char offset bug)')
      }

      if (!ok || !outputOk) {
        return failedStage('11', 'run TeX on hello.tex', duration,
          ctx.hello?.error ?? (hasEmergencyStop ? 'Emergency stop' : 'unknown output issue'), {
          metrics,
          artifacts: output ? [artifact('hello.log', output)] : [],
          logs: [
            ...outputLines.map((l, i) => `out[${i}]: ${JSON.stringify(l)}`),
            ...diagLines,
            ...(ctx.hello?.error ? [`error: ${ctx.hello.error}`] : []),
          ],
          assertions, debugLogs: debugLog, stackTrace,
        })
      }
      return successStage('11', 'run TeX on hello.tex', duration, {
        metrics,
        artifacts: [artifact('hello.log', output)],
        logs: [
          ...outputLines.map((l, i) => `out[${i}]: ${JSON.stringify(l)}`),
          ...diagLines,
        ],
        assertions, debugLogs: debugLog,
      })
    },
  },

  {
    id: 12,
    title: 'run TeX on trip.tex (TRIP 测试)',
    run: (ctx) => {
      if (!ctx.texCompileOk) return skippedStage('12', 'run TeX on trip.tex', 'tex.pas compile failed')
      const t0 = now()
      let debugLog: string[] = []
      let stackTrace: string[] = []
      try {
        const r = runTeXCompiled(ctx.texCompiledJs, {
          input: ['trip'],
          files: {
            'trip.tex': ctx.tripTex,
            'trip.tfm': ctx.tripTfm,
            'TeXformats:TEX.POOL': ctx.tex!.pool,
          },
          maxSteps: 5e9,
          plugins: [pascalHPlugin],
        })
        debugLog = r.debugLog ?? []
        if (r.state.error?.stackTrace) stackTrace = r.state.error.stackTrace
        ctx.trip = { output: r.output, status: r.state.status, error: r.state.error?.message, steps: r.state.steps }
      } catch (e: any) {
        ctx.trip = { output: '', status: 'error', error: e?.message, steps: 0 }
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }

      const duration = now() - t0
      const ok = ctx.trip?.status === 'terminated'
      const output = ctx.trip?.output ?? ''
      const hasBanner = output.includes('This is TeX')
      const hasInitex = output.includes('(INITEX)')
      const outputLines = output.split('\n').filter((l) => l.length > 0)
      const outputLineCount = outputLines.length
      // TRIP 是 diabolical test，期望输出应包含多行（不是只几行 emergency stop）
      const hasReasonableOutput = outputLineCount > 10
      // 检查是否异常退出（只有 Emergency stop）
      const hasEmergencyStop = output.includes('! Emergency stop.')
      const hasNoPages = output.includes('No pages of output')
      // 诊断信息：检查 pool 字符串偏移问题
      const hasDisplaylimits = output.includes('displaylimits')
      const hasEeXformats = output.includes('eXformats')
      const hasTeXformats = output.includes('TeXformats')

      const metrics = {
        inputFile: 'trip.tex',
        inputSize: formatBytes(ctx.tripTex.length),
        tfmSize: formatBytes(ctx.tripTfm.length),
        status: ctx.trip?.status ?? 'unknown',
        steps: ctx.trip?.steps ?? 0,
        outputSize: formatBytes(output.length),
        outputLines: outputLineCount,
        banner: firstLine(output),
        hasInitex,
        hasEmergencyStop,
        hasNoPages,
        hasDisplaylimits,
        hasEeXformats,
        hasTeXformats,
      }
      const assertions = [
        assert('run ok', ok, ctx.trip?.status, 'terminated'),
        assert('output has This is TeX', hasBanner, undefined, 'contains'),
        assert('output has (INITEX)', hasInitex, undefined, 'contains'),
        assert('output lines > 10', hasReasonableOutput, String(outputLineCount), '> 10'),
      ]
      // 诊断行
      const diagLines: string[] = []
      if (hasEmergencyStop) diagLines.push(`diag: emergency stop detected (output too short, ${outputLineCount} lines)`)
      if (hasDisplaylimits) diagLines.push('diag: banner contains "displaylimits" (pool string offset issue)')
      if (hasEeXformats) diagLines.push('diag: output contains "eXformats" (missing leading T, pool offset by 1)')
      if (hasNoPages) diagLines.push('diag: "No pages of output" - TeX did not produce output')

      if (!ok) {
        return failedStage('12', 'run TeX on trip.tex', duration, ctx.trip?.error ?? 'unknown', {
          metrics,
          artifacts: output ? [artifact('trip.log', output)] : [],
          logs: [
            ...outputLines.map((l, i) => `out[${i}]: ${JSON.stringify(l)}`),
            ...diagLines,
            ...(ctx.trip?.error ? [`error: ${ctx.trip.error}`] : []),
          ],
          assertions, debugLogs: debugLog, stackTrace,
        })
      }
      return successStage('12', 'run TeX on trip.tex', duration, {
        metrics,
        artifacts: [artifact('trip.log', output)],
        logs: [
          ...outputLines.map((l, i) => `out[${i}]: ${JSON.stringify(l)}`),
          ...diagLines,
        ],
        assertions, debugLogs: debugLog,
      })
    },
  },

  {
    id: 13,
    title: 'verify trip banner (基本验证)',
    run: (ctx) => {
      if (!ctx.trip) return skippedStage('13', 'verify trip banner', 'TRIP not run')
      const t0 = now()
      const actual = ctx.trip.output
      const expected = ctx.tripFot
      const bannerMatch = actual.includes('This is TeX, Version 3.14159265')
      const hasInitex = actual.includes('(INITEX)')

      const duration = now() - t0
      const metrics = {
        expectedOut: formatBytes(expected.length),
        actualOut: formatBytes(actual.length),
        bannerMatch,
        hasInitex,
      }
      const assertions = [
        assert('banner match', bannerMatch, undefined, 'contains This is TeX, Version 3.14159265'),
        assert('has (INITEX)', hasInitex, undefined, 'contains'),
      ]
      const ok = bannerMatch && hasInitex

      if (!ok) {
        return failedStage('13', 'verify trip banner', duration, 'banner mismatch', {
          metrics,
          artifacts: [artifact('trip.log', actual), artifact('trip.fot', expected)],
          logs: [`actual first line: ${JSON.stringify(firstLine(actual))}`],
          assertions,
        })
      }
      return successStage('13', 'verify trip banner', duration, {
        metrics,
        artifacts: [artifact('trip.log', actual), artifact('trip.fot', expected)],
        logs: [`banner: ${firstLine(actual)}`],
        assertions,
      })
    },
  },

  {
    id: 14,
    title: 'compare trip output vs trip.fot (详细比对)',
    run: (ctx) => {
      if (!ctx.trip) return skippedStage('14', 'compare trip vs trip.fot', 'TRIP not run')
      const t0 = now()
      const actual = ctx.trip.output
      const expected = ctx.tripFot

      const fotLines = expected.split('\n')
      const outLines = actual.split('\n')

      // 逐行比对（全部行，不只前 30 行）
      const maxCompare = Math.max(fotLines.length, outLines.length)
      let matchCount = 0
      let mismatchCount = 0
      let onlyInExpected = 0
      let onlyInActual = 0
      const compareLines: string[] = []
      for (let i = 0; i < maxCompare; i++) {
        const exp = fotLines[i]
        const act = outLines[i]
        if (exp === undefined && act === undefined) continue
        if (exp === undefined) {
          onlyInActual++
          compareLines.push(`line ${i}: +act=${JSON.stringify(act)}`)
        } else if (act === undefined) {
          onlyInExpected++
          compareLines.push(`line ${i}: -exp=${JSON.stringify(exp)}`)
        } else if (exp === act) {
          matchCount++
        } else {
          mismatchCount++
          if (compareLines.length < 50) {
            compareLines.push(`line ${i}: X exp=${JSON.stringify(exp)} act=${JSON.stringify(act)}`)
          }
        }
      }
      const totalLines = matchCount + mismatchCount + onlyInExpected + onlyInActual
      const matchRate = totalLines > 0 ? `${matchCount}/${totalLines} (${(matchCount / totalLines * 100).toFixed(1)}%)` : '0/0'

      // 关键内容检查
      const expectedMarkers = [
        '(trip.tex',
        'Bad number',
        'Completed box being shipped out',
        'Memory usage',
        'OK (see the transcript',
        'Missing }',
        'Output loop',
      ]
      const markerChecks = expectedMarkers.map((m) => {
        const inExpected = expected.includes(m)
        const inActual = actual.includes(m)
        return { marker: m, inExpected, inActual, pass: inExpected === inActual }
      })
      const markerPassCount = markerChecks.filter((c) => c.pass).length

      const duration = now() - t0
      const metrics = {
        expectedLines: fotLines.length,
        actualLines: outLines.length,
        matchCount,
        mismatchCount,
        onlyInExpected,
        onlyInActual,
        matchRate,
        markerChecks: `${markerPassCount}/${markerChecks.length}`,
      }
      const assertions = [
        assert('match rate > 50%', totalLines > 0 && matchCount / totalLines > 0.5, matchRate, '> 50%'),
        assert('markers all pass', markerPassCount === markerChecks.length, `${markerPassCount}/${markerChecks.length}`, 'all'),
      ]

      const logs = [
        `matchRate: ${matchRate}`,
        ...markerChecks.map((c) => `marker: ${c.pass ? 'ok' : 'X'} "${c.marker}" exp=${c.inExpected} act=${c.inActual}`),
        ...compareLines.slice(0, 50),
      ]

      // TRIP 是 diabolical test，match rate > 50% 即算通过
      const ok = totalLines > 0 && matchCount / totalLines > 0.5

      if (!ok) {
        return failedStage('14', 'compare trip vs trip.fot', duration, `match rate too low: ${matchRate}`, {
          metrics,
          artifacts: [artifact('trip.compare.txt', compareLines.join('\n'))],
          logs,
          assertions,
        })
      }
      return successStage('14', 'compare trip vs trip.fot', duration, {
        metrics,
        artifacts: [artifact('trip.compare.txt', compareLines.join('\n'))],
        logs,
        assertions,
      })
    },
  },
]

// ============================================================
// 主执行器
// ============================================================

export async function runE2E(opts: CliOptions): Promise<void> {
  console.log(`\n${'='.repeat(70)}`)
  console.log('E2E 测试运行器')
  console.log(`时间: ${timestamp()}`)
  console.log(`参数: ${opts.stages ? `--stage=${opts.stages.join(',')}` : 'all'}${opts.noCache ? ' --fresh' : ''}`)
  console.log(`${'='.repeat(70)}\n`)

  const ctx = createContext()
  const stageReports: StageReport[] = []
  const totalStart = now()

  // 保存原 console 方法，单 stage 期间拦截输出到 buffer
  const origLog = console.log
  const origErr = console.error
  const origWarn = console.warn

  for (const stage of stages) {
    if (opts.stages && !opts.stages.includes(stage.id)) continue

    if (!opts.noCache && ctx.failedAt && !opts.stages) {
      const report = skippedStage(String(stage.id), stage.title, `prev ${ctx.failedAt} failed`)
      stageReports.push(report)
      printStageProgress(report)
      continue
    }

    const stageStart = now()
    process.stdout.write(`  [${String(stage.id).padStart(2, ' ')}] ${stage.title} ... `)

    // 拦截该阶段的所有 console 输出，写入 buffer 后由报告消费
    const consoleBuffer: string[] = []
    console.log = (...args: any[]) => {
      consoleBuffer.push(args.map(formatConsoleArg).join(' '))
    }
    console.error = (...args: any[]) => {
      consoleBuffer.push('[stderr] ' + args.map(formatConsoleArg).join(' '))
    }
    console.warn = (...args: any[]) => {
      consoleBuffer.push('[warn] ' + args.map(formatConsoleArg).join(' '))
    }

    let report: StageReport
    try {
      report = await stage.run(ctx)
    } catch (e: any) {
      const duration = now() - stageStart
      const stackLines: string[] = e?.stack
        ? String(e.stack).split('\n').slice(0, 40)
        : []
      report = failedStage(String(stage.id), stage.title, duration, e?.message || String(e), {
        logs: [`exception: ${e?.message || String(e)}`],
        stackTrace: stackLines,
      })
    } finally {
      // 恢复原 console
      console.log = origLog
      console.error = origErr
      console.warn = origWarn
    }

    // 把拦截到的 console 输出合并到 stage report（不覆盖 stage 主动设置的）
    if (consoleBuffer.length > 0) {
      report = {
        ...report,
        consoleLogs: report.consoleLogs.length > 0
          ? [...report.consoleLogs, ...consoleBuffer]
          : consoleBuffer,
      }
    }

    printStageProgress(report, now() - stageStart)
    stageReports.push(report)
  }

  const totalDuration = now() - totalStart
  const success = stageReports.every((s) => s.status !== 'failed')

  const report = createReport(
    timestamp(), success, totalDuration, stageReports,
    { node: process.version, platform: os.platform(), arch: os.arch() },
    process.argv.slice(2)
  )
  writeReport(report)

  console.log(`\n${'='.repeat(70)}`)
  console.log(`结果: ${success ? 'SUCCESS' : 'FAILED'}`)
  console.log(`总耗时: ${(totalDuration / 1000).toFixed(2)} s`)
  console.log(`报告: ${path.join(REPORT_DIR, 'index.html')}`)
  console.log(`      ${path.join(REPORT_DIR, report.id, 'overview.json')}`)
  console.log(`${'='.repeat(70)}\n`)

  if (!success) process.exitCode = 1
}

/** console 参数格式化：对象/错误展开为字符串 */
function formatConsoleArg(arg: any): string {
  if (arg instanceof Error) return arg.stack || arg.message
  if (typeof arg === 'object' && arg !== null) {
    try { return JSON.stringify(arg) } catch { return String(arg) }
  }
  return String(arg)
}

function printStageProgress(report: StageReport, actualDuration?: number): void {
  const status = report.status === 'success' ? 'ok' : report.status === 'failed' ? 'X' : '-'
  const duration = actualDuration ?? report.duration
  const durStr = duration < 1000 ? `${duration} ms` : `${(duration / 1000).toFixed(2)} s`
  console.log(`${status} ${report.status.toUpperCase()} (${durStr})`)
  for (const [k, v] of Object.entries(report.metrics)) {
    console.log(`       ${k}: ${v}`)
  }
  if (report.error) console.log(`       error: ${report.error.slice(0, 200)}`)
}

export function listStages(): void {
  console.log('\nE2E 测试阶段列表：\n')
  for (const stage of stages) {
    console.log(`  [${String(stage.id).padStart(2, ' ')}] ${stage.title}`)
  }
  console.log('\n用法：')
  console.log('  npm run e2e                  # 运行所有阶段')
  console.log('  npm run e2e -- --stage=10    # 只运行阶段 10')
  console.log('  npm run e2e -- --list        # 列出所有阶段')
  console.log('  npm run e2e -- --report      # 运行后打开 HTML 报告')
  console.log('  npm run e2e -- --fresh       # 禁用流水线复用')
}

export function openReport(): void {
  const indexPath = path.join(REPORT_DIR, 'index.html')
  if (!fs.existsSync(indexPath)) {
    console.error(`报告不存在: ${indexPath}`)
    return
  }
  const platform = os.platform()
  const cmd = platform === 'win32' ? 'start ""' : platform === 'darwin' ? 'open' : 'xdg-open'
  try {
    require('child_process').execSync(`${cmd} "${indexPath}"`)
    console.log(`已打开报告: ${indexPath}`)
  } catch {
    console.log(`请手动打开报告: ${indexPath}`)
  }
}
