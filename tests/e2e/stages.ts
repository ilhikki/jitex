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
 *   XeTeX 流水线（编译 xetex.pas，参照 web2c/xetexdir/am/xetex.am）：
 *    17. tie 合并 tangle.web + tangle-xetex.ch → tangle v4 (大文件支持)
 *    18. tie 合并 xetex.web + 11 个 ch → xetex-final.web，用 tangle v4 编译 → xetex.pas
 *
 * 设计：
 *   - 流水线模式：阶段顺序执行，复用上一阶段结果，失败则后续跳过
 *   --fresh 模式：每阶段独立运行（用于调试单阶段）
 */
import * as os from 'os'
import { parse } from '@/index'
import { transform } from '@/compiler/transform'
import { pascalHPlugin } from '@/compiler/plugins/pascal-h.plugin'
import { extractDviText, dviToHtml, dviToJson } from './dvi-extract'
import {
  compileTeX,
  countLines,
  extractModuleNumbers,
  firstLine,
  formatBytes,
  HYPHEN_TEX,
  PLAIN_TEX,
  previewLine,
  readCmFontsForTeX,
  readResource,
  readResourceBytes,
  runTangle,
  runTeXCompiled,
  tailLines,
  TANGLE_PAS,
  TANGLE_WEB,
  TEX_TRIP_CH,
  TEX_WEB,
  TRIP_FOT,
  TRIP_TEX,
  TRIP_TFM,
  TRIPMAN_TEX,
} from './_helper'
import { tie } from './tie'
import { createReport, REPORT_DIR, StageArtifact, StageReport, writeReport } from './reporter'
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
      const nums = v
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n))
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
  // 默认内存配置的 tex（不带 TRIP change file，mem_top=30000），用于 INITEX/plain.fmt
  texFull: RunResult | null
  texCompiledJsFull: string
  hello: {
    output: string
    status: string
    error?: string
    steps: number
    files: Map<string, Uint8Array>
  } | null
  trip: {
    output: string
    status: string
    error?: string
    steps: number
    files: Map<string, Uint8Array>
    logFile?: string
  } | null

  // s15/s16: plain.fmt 生成 + tripman 编译
  plainTex: string
  hyphenTex: string
  tripmanTex: string
  cmFonts: Record<string, Uint8Array>
  plainFmt: Uint8Array | null
  tripman: {
    output: string
    status: string
    error?: string
    steps: number
    files: Map<string, Uint8Array>
  } | null

  // s17/s18: XeTeX 编译流水线
  // s17: 用 tie 合并 tangle.web + tangle-xetex.ch → tangle-final.web，
  //      再用 v3 编译出支持大文件的 TANGLE v4（buf_size=1000, zz=5）
  tangleXetexCh: string
  tangleV4: RunResult | null
  // s18: 用 tie 合并 xetex.web + 11 个 ch → xetex-final.web，
  //      再用 tangle v4 编译出 xetex.pas
  xetexWeb: string
  xetexChanges: { filename: string; content: string }[]
  xetex: RunResult | null

  failedAt: string
}

function createContext(): PipelineContext {
  return {
    tanglePas: '',
    tangleWeb: '',
    texWeb: '',
    helloTex: '',
    tripTex: '',
    tripTfm: new Uint8Array(0),
    tripFot: '',
    compiledJs: '',
    v1: null,
    v1ParseOk: false,
    v2: null,
    v3: null,
    tex: null,
    texParseOk: false,
    texCompiledJs: '',
    texCompileOk: false,
    texCompileError: '',
    texFull: null,
    texCompiledJsFull: '',
    hello: null,
    trip: null,
    plainTex: '',
    hyphenTex: '',
    tripmanTex: '',
    cmFonts: {},
    plainFmt: null,
    tripman: null,
    // s17/s18: XeTeX 编译流水线
    tangleXetexCh: '',
    tangleV4: null,
    xetexWeb: '',
    xetexChanges: [],
    xetex: null,
    failedAt: '',
  }
}

// ============================================================
// 辅助函数
// ============================================================

function now(): number {
  return Date.now()
}
function timestamp(): string {
  return new Date().toISOString()
}

/** 构造产物（含完整内容，用于保存到报告文件夹） */
function artifact(name: string, content: string): StageArtifact {
  return {
    name,
    content,
    size: Buffer.byteLength(content, 'utf-8'),
    lines: countLines(content),
  }
}

/** 构造二进制产物（dvi/tfm 等二进制文件，用于保存到报告文件夹） */
function binaryArtifact(name: string, data: Uint8Array): StageArtifact {
  return {
    name,
    content: '',
    binary: data,
    size: data.length,
    lines: 0,
  }
}

function successStage(
  id: string,
  title: string,
  duration: number,
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
    id,
    title,
    status: 'success',
    duration,
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
  id: string,
  title: string,
  duration: number,
  error: string,
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
    id,
    title,
    status: 'failed',
    duration,
    error,
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
    id,
    title,
    status: 'skipped',
    duration: 0,
    metrics: { reason },
    artifacts: [],
    logs: [],
    consoleLogs: [],
    debugLogs: [],
    stackTrace: [],
    assertions: [],
  }
}

function assert(
  name: string,
  cond: boolean,
  actual?: string,
  expected?: string
): { name: string; passed: boolean; actual?: string; expected?: string } {
  return { name, passed: cond, actual, expected }
}

/**
 * 从 TeX 运行结果的 files Map 中查找 dvi 文件。
 * TeX 通过 rewrite(f, 'name.dvi') 创建输出文件，文件名以 '.dvi' 结尾。
 *
 * DVI 文件格式（Knuth TEXPack）：
 *   - 首 2 字节为 preamble opcode (247) + format version (2)
 *   - 末尾为 postamble opcode (249) followed by 4 bytes of 0xdf (223)
 *   - 最小有效 DVI（空文档）约 50+ 字节
 *
 * @returns 找到的 dvi 文件信息，或 null
 */
function findDviFile(files: Map<string, Uint8Array>): { name: string; data: Uint8Array } | null {
  for (const [name, data] of files) {
    // 跳过输入文件和 TTY
    if (name === 'TTY:') continue
    if (name.toLowerCase().endsWith('.dvi')) {
      return { name, data }
    }
  }
  return null
}

/** 按扩展名查找文件（如 'trip.fmt'），返回第一个匹配的数据 */
function findFile(files: Map<string, Uint8Array>, extension: string): Uint8Array | null {
  const ext = extension.toLowerCase()
  for (const [name, data] of files) {
    if (name === 'TTY:') continue
    if (name.toLowerCase().endsWith(ext)) {
      return data
    }
  }
  return null
}

/**
 * 检查 DVI 文件是否有效。
 * DVI 格式参考：https://texdoc.org/serve/dvitype.pdf/0
 *
 * 有效性检查：
 *   1. 长度 > 0（非空）
 *   2. 首字节为 247 (pre opcode)
 *   3. 第 2 字节为 2 (DVI format version 2)
 *   4. 末尾包含 postamble 标记（223 重复）
 *
 * 内容检查（hasContent）：
 *   解析 pre 后扫描所有 bop..eop 段，若任一页在 bop header（45 字节）
 *   与 eop 之间存在字节，则视为有内容。空 DVI（仅 pre/bop/eop/post）
 *   会被识别为 hasContent=false，便于上层断言"TeX 是否真的排出了字符"。
 */
function validateDvi(data: Uint8Array): {
  valid: boolean
  hasContent: boolean
  reason: string
  firstBytes: string
  lastBytes: string
} {
  if (data.length === 0) {
    return {
      valid: false,
      hasContent: false,
      reason: 'empty dvi file',
      firstBytes: '',
      lastBytes: '',
    }
  }
  const firstBytes = Array.from(data.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
  const lastBytes =
    data.length >= 8
      ? Array.from(data.slice(-8))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ')
      : firstBytes
  // DVI preamble: opcode 247 (0xf7), version 2
  if (data[0] !== 247) {
    return {
      valid: false,
      hasContent: false,
      reason: `bad preamble opcode: expected 247 (0xf7), got ${data[0]}`,
      firstBytes,
      lastBytes,
    }
  }
  if (data[1] !== 2) {
    return {
      valid: false,
      hasContent: false,
      reason: `bad DVI version: expected 2, got ${data[1]}`,
      firstBytes,
      lastBytes,
    }
  }
  // 最小有效 DVI（preamble + postamble）约 50 字节
  if (data.length < 50) {
    return {
      valid: false,
      hasContent: false,
      reason: `dvi too short: ${data.length} bytes (expected > 50)`,
      firstBytes,
      lastBytes,
    }
  }
  // 末尾应有 4+ 个 223 (0xdf) 作为 postamble 标记
  let trailer223 = 0
  for (let i = data.length - 1; i >= 0 && data[i] === 223; i--) {
    trailer223++
  }
  if (trailer223 < 4) {
    return {
      valid: false,
      hasContent: false,
      reason: `missing postamble trailer (223 x4+): only ${trailer223}`,
      firstBytes,
      lastBytes,
    }
  }

  // 内容检查：扫描 bop..eop 段，看是否有字符/规则等内容
  // pre 结构: 247, ver, num[4], den[4], mag[4], k, x[k] = 15 + k 字节
  // bop 结构: 139, c0..c9[40], p[4] = 45 字节
  // eop 结构: 140 = 1 字节
  let hasContent = false
  try {
    const k = data[14]
    let pos = 15 + k // 跳过 pre
    while (pos < data.length && data[pos] !== 248 /* post */) {
      if (data[pos] === 139 /* bop */) {
        const bopHeaderEnd = pos + 45
        // 在 bop header 之后查找 eop
        let p = bopHeaderEnd
        while (p < data.length && data[p] !== 140 /* eop */ && data[p] !== 139 /* bop */) {
          p++
        }
        if (p > bopHeaderEnd) {
          // bop header 与 eop 之间存在字节 → 有内容
          hasContent = true
          break
        }
        // eop 紧跟 bop header，本页为空，继续扫描下一页
        pos = p + 1 // 跳过 eop
      } else {
        pos++
      }
    }
  } catch {
    // 解析失败，保持 hasContent=false
  }

  return { valid: true, hasContent, reason: 'ok', firstBytes, lastBytes }
}

// ============================================================
// Stage 工厂：抽取重复代码
//   - parseStage: parse xxx.pas（stage 1/4/9 模式）
//   - compileStage: compile xxx.pas → JS（stage 2/10 模式）
//   - runTangleStage: 包装 runTangle 并构造报告（stage 3/5/6/8/17/18 模式）
//   - toRunResult: 将 TangleResult 转为 PipelineContext.RunResult
// ============================================================

type TangleCtxResult = {
  pascal: string
  pool: string
  output: string
  status: string
  error?: string
}

/**
 * TANGLE 运行结果 → PipelineContext.RunResult 结构
 */
function toRunResult(r: ReturnType<typeof runTangle>): TangleCtxResult {
  return {
    pascal: r.pascal,
    pool: r.pool,
    output: r.output,
    status: r.state.status,
    error: r.state.error?.message,
  }
}

/** 从 TANGLE output 提取典型错误行（以 '! ' 开头） */
function tangleErrorLines(output: string, max = 5): string[] {
  if (!output) return []
  return output
    .split('\n')
    .filter((l) => l.startsWith('! '))
    .slice(0, max)
}

/** 构造 TANGLE 典型日志行：banner + pascal 首行 + tail N 行 */
function tangleLogLines(
  output: string,
  pascal: string,
  tailN = 5
): string[] {
  const lines: string[] = [`banner: ${firstLine(output)}`]
  if (pascal) lines.push(`pascal first: ${previewLine(pascal)}`)
  const tailed = tailLines(output, tailN).map(
    (l, i, arr) => `tail[${arr.length - i}]: ${JSON.stringify(l)}`
  )
  return lines.concat(tailed)
}

/** TANGLE 产物：v{n}.pas + v{n}.pool（可选 tangle.out） */
function tangleArtifacts(
  label: string,
  pascal: string,
  pool: string,
  output = ''
): StageArtifact[] {
  const result: StageArtifact[] = []
  if (pascal) result.push(artifact(`${label}.pas`, pascal))
  if (pool) result.push(artifact(`${label}.pool`, pool))
  if (output) result.push(artifact(`${label}.out`, output))
  return result
}

interface TangleStageOptions {
  id: string
  title: string
  /** 运行阶段前的准备函数（加载资源、tie 合并等）。返回 runTangle 的参数。 */
  prepare: (
    ctx: PipelineContext
  ) =>
    | { pas: string; web: string; ch?: string | Uint8Array; debugLog: string[] }
    | { skip: string }
  /** 设置 ctx.* 字段（如 ctx.v1 = result） */
  commit: (ctx: PipelineContext, res: TangleCtxResult) => void
  /** 失败后 ctx.failedAt = id */
  failId?: string
  /** 依赖 prev.failedAt 检查，true 时会先检查 ctx.failedAt */
  checkFail?: boolean
  /** 生成 metrics */
  metrics: (ctx: PipelineContext, res: TangleCtxResult, webInput: number) => Record<string, any>
  /** 生成 assertions */
  assertions: (ctx: PipelineContext, res: TangleCtxResult) => StageReport['assertions']
  /** 生成 artifacts（默认用 tangleArtifacts，可覆盖） */
  artifacts?: (ctx: PipelineContext, res: TangleCtxResult) => StageArtifact[]
  /** 成功时生成 logs（默认用 tangleLogLines） */
  logs?: (ctx: PipelineContext, res: TangleCtxResult) => string[]
}

/**
 * tie 合并：根据原 web 文件换行符（CRLF/LF）做行尾对齐。
 * 返回对齐后的 web + tieLogs；tie 错误信息追加到 debugLog 输出。
 */
function tieMerge(
  master: string,
  changes: { filename: string; content: string }[],
  debugLog: string[],
  tag: string
): string {
  const r = tie(master, changes)
  const errs = r.logs.filter((l) => l.level === 'error')
  const warns = r.logs.filter((l) => l.level === 'warn')
  debugLog.push(
    `[${tag}] tie: ${r.logs.length} logs, ${errs.length} errors, ${warns.length} warns, ` +
      `web ${formatBytes(master.length)} → ${formatBytes(r.web.length)}`
  )
  if (errs.length) debugLog.push(`[${tag}] tie errors: ${errs.map((e) => e.message).join('; ')}`)
  return master.includes('\r\n') ? r.web.replace(/\r?\n/g, '\r\n') : r.web
}

/**
 * 通用 runTangle stage 工厂：
 *   prepare → runTangle → commit → 构建报告
 * 当 prepare 返回 {skip: reason} 时输出 skippedStage。
 */
function runTangleStage(opts: TangleStageOptions): StageDef['run'] {
  const { id, title, prepare, commit, failId, checkFail, metrics, assertions } = opts
  return (ctx: PipelineContext): StageReport => {
    if (checkFail && ctx.failedAt)
      return skippedStage(id, title, `prev ${ctx.failedAt} failed`)
    const t0 = now()
    const debugLog: string[] = []
    let stackTrace: string[] = []
    let res: TangleCtxResult = { pascal: '', pool: '', output: '', status: 'error' }
    let pasArg = ''
    let webArg = ''
    let chArg: string | Uint8Array | undefined
    let skipReason = ''
    try {
      const prep = prepare(ctx)
      if ('skip' in prep) {
        skipReason = prep.skip
      } else {
        pasArg = prep.pas
        webArg = prep.web
        chArg = prep.ch
        debugLog.push(...(prep.debugLog ?? []))
        const r = runTangle(pasArg, webArg, [pascalHPlugin], chArg ?? '')
        debugLog.push(...(r.debugLog ?? []))
        if (r.state.error?.stackTrace) stackTrace = r.state.error.stackTrace
        res = toRunResult(r)
        commit(ctx, res)
        if (failId && res.status !== 'terminated') ctx.failedAt = failId
      }
    } catch (e: any) {
      res = { pascal: '', pool: '', output: '', status: 'error', error: e?.message }
      commit(ctx, res)
      if (failId) ctx.failedAt = failId
      stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
    }

    if (skipReason) return skippedStage(id, title, skipReason)

    const duration = now() - t0
    const ok = res.status === 'terminated'
    const commonArtifacts = opts.artifacts
      ? opts.artifacts(ctx, res)
      : tangleArtifacts(`tangle.stage${id}`, res.pascal, res.pool, res.output)
    const commonLogs = opts.logs
      ? opts.logs(ctx, res)
      : tangleLogLines(res.output, res.pascal, 8)
    const commonMetrics = metrics(ctx, res, webArg.length)
    const commonAssertions = assertions(ctx, res)

    if (!ok) {
      return failedStage(id, title, duration, res.error ?? 'unknown', {
        metrics: commonMetrics,
        artifacts: commonArtifacts,
        logs: [
          `banner: ${firstLine(res.output)}`,
          ...tangleErrorLines(res.output).map((l) => `error: ${JSON.stringify(l)}`),
          ...tailLines(res.output, 10).map(
            (l, i, arr) => `tail[${arr.length - i}]: ${JSON.stringify(l)}`
          ),
        ],
        assertions: commonAssertions,
        debugLogs: debugLog,
        stackTrace,
      })
    }
    return successStage(id, title, duration, {
      metrics: commonMetrics,
      artifacts: commonArtifacts,
      logs: commonLogs,
      assertions: commonAssertions,
      debugLogs: debugLog,
    })
  }
}

interface ParseStageOptions {
  id: string
  title: string
  /** 需要 parse 的源码，从 ctx 取 */
  source: (ctx: PipelineContext) => string
  /** 解析成功回调（设置 ctx.xxxParseOk = true 等） */
  onOk?: (ctx: PipelineContext) => void
  /** 失败后 ctx.failedAt = id */
  failId?: string
  /** 前置 ctx.failedAt 检查 */
  checkFail?: boolean
  /** 前置依赖（缺 source 则 skip） */
  requires?: (ctx: PipelineContext) => { ok: boolean; reason?: string }
}

/** 通用 parse stage 工厂 */
function parseStage(opts: ParseStageOptions): StageDef['run'] {
  const { id, title, source, onOk, failId, checkFail, requires } = opts
  return (ctx: PipelineContext): StageReport => {
    if (checkFail && ctx.failedAt)
      return skippedStage(id, title, `prev ${ctx.failedAt} failed`)
    if (requires) {
      const req = requires(ctx)
      if (!req.ok) return skippedStage(id, title, req.reason ?? 'dependency missing')
    }
    const t0 = now()
    const src = source(ctx)
    let ok = false
    let error: string | undefined
    let stackTrace: string[] = []
    try {
      const r = parse(src)
      ok = r.success
      if (!ok) error = `parse failed: ${r.error ?? 'unknown'}`
      if (ok && onOk) onOk(ctx)
    } catch (e: any) {
      error = e?.message || String(e)
      stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
    }
    if (failId && !ok) ctx.failedAt = failId

    const duration = now() - t0
    const metrics = {
      srcSize: formatBytes(src.length),
      srcLines: countLines(src),
      parseResult: ok ? 'ok' : 'fail',
    }
    const artifacts = src ? [artifact(`stage${id}.parse.src`, src)] : []
    const assertList = [assert('parse ok', ok, ok ? 'ok' : 'fail', 'ok')]
    if (!ok) {
      return failedStage(id, title, duration, error!, {
        metrics,
        artifacts,
        logs: error ? [`error: ${error}`] : [],
        assertions: assertList,
        stackTrace,
      })
    }
    return successStage(id, title, duration, {
      metrics,
      artifacts,
      logs: src ? [`first: ${previewLine(src)}`] : [],
      assertions: assertList,
    })
  }
}

interface CompileStageOptions {
  id: string
  title: string
  /** transform 调用 */
  runTransform: (ctx: PipelineContext) => string
  /** 保存编译产物到 ctx */
  commit: (ctx: PipelineContext, js: string) => void
  /** 失败后 ctx.failedAt = id */
  failId?: string
  /** 前置依赖 */
  requires?: (ctx: PipelineContext) => { ok: boolean; reason?: string }
  /** assertions 扩展 */
  extraAssertions?: (ctx: PipelineContext, js: string) => StageReport['assertions']
  /** metrics 扩展 */
  extraMetrics?: (ctx: PipelineContext, js: string) => Record<string, any>
}

/** 通用 compile stage 工厂 */
function compileStage(opts: CompileStageOptions): StageDef['run'] {
  const { id, title, runTransform, commit, failId, requires, extraAssertions, extraMetrics } = opts
  return (ctx: PipelineContext): StageReport => {
    if (requires) {
      const req = requires(ctx)
      if (!req.ok) return skippedStage(id, title, req.reason ?? 'dependency missing')
    }
    const t0 = now()
    let ok = false
    let error: string | undefined
    let stackTrace: string[] = []
    let js = ''
    try {
      js = runTransform(ctx)
      ok = js.length > 0
      commit(ctx, js)
    } catch (e: any) {
      error = e?.message || String(e)
      stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
    }
    if (failId && !ok) ctx.failedAt = failId

    const duration = now() - t0
    const metrics: Record<string, any> = {
      jsSize: formatBytes(js.length),
      jsLines: countLines(js),
      compileResult: ok ? 'ok' : 'fail',
      ...(extraMetrics ? extraMetrics(ctx, js) : {}),
    }
    const assertions: StageReport['assertions'] = [
      assert('compile ok', ok, ok ? 'ok' : 'fail', 'ok'),
      ...(extraAssertions ? extraAssertions(ctx, js) : []),
    ]
    const artifacts = js ? [artifact(`stage${id}.compiled.js`, js)] : []
    if (!ok) {
      return failedStage(id, title, duration, error!, {
        metrics,
        assertions,
        stackTrace,
      })
    }
    return successStage(id, title, duration, {
      metrics,
      artifacts,
      logs: js ? [`js first: ${previewLine(js)}`] : [],
      assertions,
    })
  }
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
      // stage 1 有额外副作用：一次性加载所有 E2E 资源
      const t0 = now()
      ctx.tanglePas = readResource(TANGLE_PAS)
      ctx.tangleWeb = readResource(TANGLE_WEB)
      ctx.texWeb = readResource(TEX_WEB)
      ctx.helloTex = readResource('hello.tex')
      ctx.tripTex = readResource(TRIP_TEX)
      ctx.tripTfm = readResourceBytes(TRIP_TFM)
      ctx.tripFot = readResource(TRIP_FOT)
      ctx.plainTex = readResource(PLAIN_TEX)
      ctx.hyphenTex = readResource(HYPHEN_TEX)
      ctx.tripmanTex = readResource(TRIPMAN_TEX)
      ctx.cmFonts = readCmFontsForTeX()

      const src = ctx.tanglePas
      let ok = false
      let error: string | undefined
      let stackTrace: string[] = []
      try {
        const result = parse(src)
        ok = result.success
        if (!ok) error = `parse failed: ${result.error ?? 'unknown'}`
      } catch (e: any) {
        error = e?.message || String(e)
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }
      const duration = now() - t0
      const metrics = { inputSize: formatBytes(src.length), lineCount: countLines(src) }
      const artifacts = [artifact('tangle-official.pas', src)]
      const assertList = [assert('parse ok', ok, ok ? 'ok' : 'fail', 'ok')]
      if (!ok) {
        ctx.failedAt = '1'
        return failedStage('1', 'parse tangle-official.pas', duration, error!, {
          metrics, artifacts, stackTrace, assertions: assertList,
        })
      }
      return successStage('1', 'parse tangle-official.pas', duration, {
        metrics, artifacts,
        logs: [`first: ${previewLine(src)}`],
        assertions: assertList,
      })
    },
  },

  {
    id: 2,
    title: 'compile tangle to JS',
    run: compileStage({
      id: '2',
      title: 'compile tangle to JS',
      failId: '2',
      runTransform: (ctx) =>
        transform(ctx.tanglePas, {
          extensions: ['string'],
          programFileUrls: {
            WEBFILE: 'WEBFILE', CHANGEFILE: 'CHANGEFILE',
            PASCALFILE: 'PASCALFILE', POOL: 'POOL',
          },
          plugins: [pascalHPlugin],
        }),
      commit: (ctx, js) => { ctx.compiledJs = js },
      extraAssertions: (_, js) => [
        assert('jsSize > 10KB', js.length > 10000, formatBytes(js.length), '> 10 KB'),
      ],
    }),
  },

  {
    id: 3,
    title: 'run tangle on tangle.web → tangle.pas (v1)',
    run: runTangleStage({
      id: '3', title: 'run tangle on tangle.web → v1',
      failId: '3',
      prepare: (ctx) => ({
        pas: ctx.tanglePas, web: ctx.tangleWeb,
        debugLog: [`[s3] tanglePas=${formatBytes(ctx.tanglePas.length)} tangleWeb=${formatBytes(ctx.tangleWeb.length)}`],
      }),
      commit: (ctx, res) => { ctx.v1 = res },
      metrics: (_, res, webInput) => ({
        webInput: formatBytes(webInput),
        status: res.status,
        pascalOut: formatBytes(res.pascal.length),
        poolOut: formatBytes(res.pool.length),
        banner: firstLine(res.output),
        modules: extractModuleNumbers(res.output),
      }),
      assertions: (_, res) => [
        assert('run ok', res.status === 'terminated', res.status, 'terminated'),
        assert('pascalOut > 1KB', res.pascal.length > 1000, formatBytes(res.pascal.length), '> 1 KB'),
        assert('banner v2.8', res.output.includes('This is TANGLE, Version 2.8'), undefined, 'contains'),
        assert('output has *1*', res.output.includes('*1*'), undefined, 'contains'),
        assert('output has Done.', res.output.includes('Done.'), undefined, 'contains'),
        assert('pascal has PROGRAM TANGLE', res.pascal.includes('PROGRAM TANGLE'), undefined, 'contains'),
      ],
      artifacts: (_, res) => tangleArtifacts('tangle.pas.v1', res.pascal, res.pool),
    }),
  },

  {
    id: 4,
    title: 'parse tangle.pas (v1)',
    run: parseStage({
      id: '4', title: 'parse tangle.pas (v1)',
      failId: '4',
      requires: (ctx) => ctx.v1?.pascal
        ? { ok: true } : { ok: false, reason: 'v1 pascal missing' },
      source: (ctx) => ctx.v1!.pascal,
      onOk: (ctx) => { ctx.v1ParseOk = true },
    }),
  },

  {
    id: 5,
    title: 'bootstrap: run v1 on tangle.web → v2',
    run: runTangleStage({
      id: '5', title: 'bootstrap v1 → v2',
      checkFail: true, failId: '5',
      prepare: (ctx) => ({
        pas: ctx.v1!.pascal, web: ctx.tangleWeb,
        debugLog: [`[s5] v1Pas=${formatBytes(ctx.v1!.pascal.length)}`],
      }),
      commit: (ctx, res) => { ctx.v2 = res },
      metrics: (_, res, webInput) => ({
        webInput: formatBytes(webInput),
        status: res.status,
        pascalOut: formatBytes(res.pascal.length),
        banner: firstLine(res.output),
        modules: extractModuleNumbers(res.output),
      }),
      assertions: (_, res) => [
        assert('run ok', res.status === 'terminated', res.status, 'terminated'),
        assert('banner v4.6', res.output.includes('This is TANGLE, Version 4.6'), undefined, 'contains'),
        assert('output has Done.', res.output.includes('Done.'), undefined, 'contains'),
      ],
      artifacts: (_, res) => tangleArtifacts('tangle.pas.v2', res.pascal, res.pool),
      logs: (_, res) => tangleLogLines(res.output, res.pascal, 5),
    }),
  },

  {
    id: 6,
    title: 'bootstrap: run v2 on tangle.web → v3',
    run: runTangleStage({
      id: '6', title: 'bootstrap v2 → v3',
      checkFail: true,
      prepare: (ctx) => ({
        pas: ctx.v2!.pascal, web: ctx.tangleWeb,
        debugLog: [`[s6] v2Pas=${formatBytes(ctx.v2!.pascal.length)}`],
      }),
      commit: (ctx, res) => { ctx.v3 = res },
      metrics: (_, res, webInput) => ({
        webInput: formatBytes(webInput),
        status: res.status,
        pascalOut: formatBytes(res.pascal.length),
        banner: firstLine(res.output),
      }),
      assertions: (_, res) => [
        assert('run ok', res.status === 'terminated', res.status, 'terminated'),
        assert('banner v4.6', res.output.includes('This is TANGLE, Version 4.6'), undefined, 'contains'),
      ],
      artifacts: (_, res) => tangleArtifacts('tangle.pas.v3', res.pascal, res.pool),
      logs: (_, res) => tangleLogLines(res.output, res.pascal, 5),
    }),
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
        v2Pascal: formatBytes(v2Pascal.length), v3Pascal: formatBytes(v3Pascal.length),
        v2EqV3: equal,
        v2Pool: formatBytes(v2Pool.length), v3Pool: formatBytes(v3Pool.length),
        poolEq: poolEqual,
      }
      const assertions = [
        assert('pascal v2 === v3', equal,
          `${formatBytes(v2Pascal.length)} vs ${formatBytes(v3Pascal.length)}`, 'identical'),
        assert('pool v2 === v3', poolEqual,
          `${formatBytes(v2Pool.length)} vs ${formatBytes(v3Pool.length)}`, 'identical'),
      ]
      if (!equal)
        return failedStage('7', 'verify v2 === v3', duration, 'v2 !== v3, bootstrap unstable', {
          metrics, assertions,
        })
      return successStage('7', 'verify v2 === v3', duration, {
        metrics, logs: ['bootstrap stable: v2 === v3'], assertions,
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
        return skippedStage(
          '8',
          'run tangle on tex.web → tex.pas',
          'no 4.x tangle available (v2/v3 missing)'
        )
      }
      const t0 = now()
      let debugLog: string[] = []
      let stackTrace: string[] = []
      // TRIP 测试用 WEB change file（tripman.tex step 2 要求）：
      // stat/tats 宏 + init/tini + mem_min/mem_bot/mem_top/mem_max + error_line 等。
      // 静态资源 resources/tex.trip.ch，用 WEB 原生 @x/@y/@z 机制由 TANGLE 合并。
      // 行尾与 tex.web 对齐（tex.web 为 CRLF），确保 TANGLE 行匹配字节级一致。
      let tripChange = readResource(TEX_TRIP_CH)
      if (ctx.texWeb.includes('\r\n')) {
        tripChange = tripChange.replace(/\r?\n/g, '\r\n')
      }
      try {
        const r = runTangle(tangleSrc, ctx.texWeb, [pascalHPlugin], tripChange)
        debugLog = r.debugLog ?? []
        ctx.tex = {
          pascal: r.pascal,
          pool: r.pool,
          output: r.output,
          status: r.state.status,
          error: r.state.error?.message,
        }
        if (r.state.error?.stackTrace) stackTrace = r.state.error.stackTrace

        // 同时产出不带 TRIP change file 的默认版本（mem_top=30000），
        // 供 s15 INITEX 生成 plain.fmt 使用（TRIP 的 mem_top=3000 内存不足）。
        const rf = runTangle(tangleSrc, ctx.texWeb, [pascalHPlugin], '')
        debugLog.push(`[s8-full] status=${rf.state.status} pascalLen=${rf.pascal.length}`)
        ctx.texFull = {
          pascal: rf.pascal,
          pool: rf.pool,
          output: rf.output,
          status: rf.state.status,
          error: rf.state.error?.message,
        }
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
        assert(
          'pascalOut > 100KB',
          (ctx.tex?.pascal.length ?? 0) > 100000,
          formatBytes(ctx.tex?.pascal.length ?? 0),
          '> 100 KB'
        ),
        assert(
          'pascal has PROGRAM TEX',
          ctx.tex?.pascal.includes('PROGRAM TEX') ?? false,
          undefined,
          'contains'
        ),
        assert(
          'output has Done.',
          ctx.tex?.output.includes('Done.') ?? false,
          undefined,
          'contains'
        ),
      ]
      // 提取 TANGLE 输出中的错误行（以 '! ' 开头）和警告行
      const tangleOut = ctx.tex?.output ?? ''
      const errorLines = tangleOut
        .split('\n')
        .filter((l) => l.startsWith('! ') || l.includes('Pardon me'))
      const hasErrorHistory = tangleOut.includes(
        'Pardon me, but I think I spotted something wrong.'
      )
      const artifacts = ctx.tex?.pascal
        ? [
            artifact('tex.pas', ctx.tex.pascal),
            artifact('tex.pool', ctx.tex.pool),
            artifact('tex.tangle.out', tangleOut),
            artifact('tex.trip.ch', tripChange),
          ]
        : []

      if (!ok) {
        return failedStage(
          '8',
          'run tangle on tex.web → tex.pas',
          duration,
          ctx.tex?.error ?? 'unknown',
          {
            metrics,
            artifacts,
            assertions,
            debugLogs: debugLog,
            stackTrace,
          }
        )
      }
      return successStage('8', 'run tangle on tex.web → tex.pas', duration, {
        metrics: { ...metrics, hasErrorHistory },
        artifacts,
        logs: [
          `tangleSource: ${tangleSrcLabel} (4.x)`,
          `banner: ${firstLine(ctx.tex!.output)}`,
          `pascal first: ${previewLine(ctx.tex!.pascal)}`,
          ...tailLines(ctx.tex!.output, 8).map(
            (l, i, arr) => `tail[${arr.length - i}]: ${JSON.stringify(l)}`
          ),
          ...(errorLines.length > 0 ? errorLines.map((l) => `error: ${JSON.stringify(l)}`) : []),
        ],
        assertions,
        debugLogs: debugLog,
      })
    },
  },

  {
    id: 9,
    title: 'parse tex.pas',
    run: parseStage({
      id: '9', title: 'parse tex.pas',
      requires: (ctx) => ctx.tex?.status === 'terminated'
        ? { ok: true } : { ok: false, reason: 'tex.pas not generated' },
      source: (ctx) => ctx.tex!.pascal,
      onOk: (ctx) => { ctx.texParseOk = true },
    }),
  },

  {
    id: 10,
    title: 'compile tex.pas → tex.js',
    run: compileStage({
      id: '10', title: 'compile tex.pas → tex.js',
      requires: (ctx) => ctx.texParseOk && !!ctx.tex
        ? { ok: true } : { ok: false, reason: 'tex.pas parse failed' },
      runTransform: (ctx) => compileTeX(ctx.tex!.pascal, [pascalHPlugin]),
      commit: (ctx, js) => {
        ctx.texCompiledJs = js
        // 同时编译默认内存版本（mem_top=30000），供 s15/s16 使用
        if (js.length > 0 && ctx.texFull?.pascal) {
          ctx.texCompiledJsFull = compileTeX(ctx.texFull.pascal, [pascalHPlugin])
        }
        ctx.texCompileOk = js.length > 0
        if (js.length === 0) ctx.texCompileError = 'empty compile output'
      },
      extraMetrics: (ctx, js) => ({
        pascalInput: formatBytes(ctx.tex!.pascal.length),
        jsFullOut: formatBytes(ctx.texCompiledJsFull?.length ?? 0),
        plugin: 'pascalH',
      }),
      extraAssertions: (_, js) => [
        assert('jsOut > 50KB', js.length > 50000, formatBytes(js.length), '> 50 KB'),
      ],
    }),
  },

  {
    id: 11,
    title: 'run TeX on hello.tex (简单测试)',
    run: (ctx) => {
      if (!ctx.texCompileOk)
        return skippedStage('11', 'run TeX on hello.tex', 'tex.pas compile failed')
      const t0 = now()
      let debugLog: string[] = []
      let stackTrace: string[] = []
      let resultFiles: Map<string, Uint8Array> = new Map()
      try {
        const r = runTeXCompiled(ctx.texCompiledJs, {
          input: ['hello'],
          files: {
            'hello.tex': ctx.helloTex,
            'TeXfonts:trip.tfm': ctx.tripTfm,
            'TeXformats:TEX.POOL': ctx.tex!.pool,
          },
          maxSteps: 2e9,
          plugins: [pascalHPlugin],
        })
        debugLog = r.debugLog ?? []
        resultFiles = r.files
        if (r.state.error?.stackTrace) stackTrace = r.state.error.stackTrace
        ctx.hello = {
          output: r.output,
          status: r.state.status,
          error: r.state.error?.message,
          steps: r.state.steps,
          files: r.files,
        }
      } catch (e: any) {
        ctx.hello = { output: '', status: 'error', error: e?.message, steps: 0, files: new Map() }
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }

      const duration = now() - t0
      const output = ctx.hello?.output ?? ''
      const ok = ctx.hello?.status === 'terminated'
      const hasBanner = output.includes('This is TeX') ?? false
      const hasEmergencyStop = output.includes('! Emergency stop.')
      const hasNoPages = output.includes('No pages of output')

      // DVI 文件检查（不只依赖 console 输出，验证实际产物）
      const dviInfo = findDviFile(resultFiles)
      const dviValidation = dviInfo ? validateDvi(dviInfo.data) : null
      const hasDvi = dviInfo !== null && dviValidation !== null
      const dviValid = hasDvi && dviValidation!.valid
      const dviHasContent = hasDvi && dviValidation!.hasContent
      const dviSize = dviInfo?.data.length ?? 0

      // hello.tex 应该正常输出，不能有 Emergency stop，且应产生有效且非空的 DVI
      // （空 DVI = bop 紧跟 eop，没有任何字符操作，说明 TeX 没把文本排到页面上）
      const outputOk = ok && !hasEmergencyStop && !hasNoPages && dviValid && dviHasContent
      const metrics: Record<string, any> = {
        inputFile: 'hello.tex',
        inputSize: formatBytes(ctx.helloTex.length),
        status: ctx.hello?.status ?? 'unknown',
        steps: ctx.hello?.steps ?? 0,
        outputSize: formatBytes(output.length),
        banner: firstLine(output),
        hasEmergencyStop,
        hasNoPages,
        dviFile: dviInfo?.name ?? '(none)',
        dviSize: formatBytes(dviSize),
        dviValid,
        dviHasContent,
      }
      const assertions = [
        assert('run ok', ok, ctx.hello?.status, 'terminated'),
        assert('output has This is TeX', hasBanner, undefined, 'contains'),
        assert('no Emergency stop', !hasEmergencyStop, undefined, 'no emergency stop'),
        assert('has pages of output', !hasNoPages, undefined, 'has pages'),
        assert('dvi file exists', hasDvi, dviInfo?.name ?? '(none)', '.dvi file'),
        assert(
          'dvi valid (preamble+postamble)',
          dviValid,
          dviValidation?.reason ?? 'no dvi',
          'valid DVI'
        ),
        assert(
          'dvi has content (chars between bop and eop)',
          dviHasContent,
          dviHasContent
            ? 'has content'
            : hasDvi
              ? 'empty page (bop immediately followed by eop)'
              : 'no dvi',
          'page with character operations'
        ),
      ]
      const outputLines = output.split('\n').filter((l) => l.length > 0)
      // 诊断行
      const diagLines: string[] = []
      if (hasEmergencyStop)
        diagLines.push('diag: Emergency stop detected - TeX aborted prematurely')
      if (hasNoPages) diagLines.push('diag: No pages of output - TeX did not produce DVI')
      // 检查输入文件名是否被错误读取（字符偏移问题）
      const hasHelloTex = output.includes('hello.tex') || output.includes('hello')
      const hasEeXformat = output.includes('eXformat')
      if (!hasHelloTex && hasEeXformat) {
        diagLines.push(
          'diag: output contains "eXformat" instead of "hello" - input filename first char dropped (char offset bug)'
        )
      }
      // DVI 诊断
      if (!hasDvi) {
        diagLines.push('diag: no .dvi file in output files - TeX did not produce DVI output')
        // 列出所有输出文件名，便于诊断
        const allFiles = Array.from(resultFiles.keys()).filter((n) => n !== 'TTY:')
        diagLines.push(
          `diag: output files: ${allFiles.length > 0 ? allFiles.join(', ') : '(none)'}`
        )
      } else if (!dviValid) {
        diagLines.push(`diag: dvi invalid: ${dviValidation!.reason}`)
        diagLines.push(`diag: dvi first 8 bytes: ${dviValidation!.firstBytes}`)
        diagLines.push(`diag: dvi last 8 bytes: ${dviValidation!.lastBytes}`)
      } else if (!dviHasContent) {
        diagLines.push(
          `diag: dvi empty - bop immediately followed by eop (no character ops), size=${dviSize}`
        )
        diagLines.push(`diag: dvi first 8 bytes: ${dviValidation!.firstBytes}`)
        diagLines.push(`diag: dvi last 8 bytes: ${dviValidation!.lastBytes}`)
        diagLines.push(
          'diag: TeX shipped out a page but no characters were typeset (likely nullfont/no font loaded, or \\end before any text was processed)'
        )
      } else {
        diagLines.push(
          `diag: dvi ok: ${dviInfo!.name} ${formatBytes(dviSize)}, first=${dviValidation!.firstBytes}`
        )
      }

      // 产物：hello.log + dvi 文件（二进制）+ plain-dvi.txt（DVI 文字提取）
      const artifacts: StageArtifact[] = output ? [artifact('hello.log', output)] : []
      if (dviInfo) {
        artifacts.push(binaryArtifact(dviInfo.name, dviInfo.data))
        // 提取 DVI 中的文字内容，输出为 plain-dvi.txt 便于人工核对
        const dviText = extractDviText(dviInfo.data)
        artifacts.push(artifact('plain-dvi.txt', dviText.text))
        // 生成 DVI → HTML 预览，便于在浏览器中查看排版结果
        artifacts.push(artifact('hello.dvi.html', dviToHtml(dviInfo.data)))
        // 生成 DVI → JSON 数据树，便于调试解析过程
        artifacts.push(artifact('hello.dvi.json', dviToJson(dviInfo.data)))
        // 把 DVI 文字提取的关键信息也加入 metrics 和诊断日志
        metrics.dviPages = dviText.pages.length
        metrics.dviFonts = dviText.fonts.size
        metrics.dviTextLen = dviText.pages.reduce((sum, p) => sum + p.length, 0)
        if (dviText.errors.length > 0) {
          metrics.dviParseErrors = dviText.errors.length
          for (const err of dviText.errors.slice(0, 5)) {
            diagLines.push(`diag: dvi parse: ${err}`)
          }
        }
        // 如果 DVI 有内容，把提取的文字预览加到诊断日志
        if (dviText.pages.length > 0) {
          const firstPage = dviText.pages[0]
          const preview = firstPage.length > 0 ? firstPage.slice(0, 80) : '(empty)'
          diagLines.push(`diag: dvi page 1 text preview: ${JSON.stringify(preview)}`)
        }
      }

      if (!ok || !outputOk) {
        return failedStage(
          '11',
          'run TeX on hello.tex',
          duration,
          ctx.hello?.error ??
            (hasEmergencyStop
              ? 'Emergency stop'
              : !dviValid
                ? 'invalid DVI'
                : !dviHasContent
                  ? 'empty DVI (no character operations)'
                  : 'unknown output issue'),
          {
            metrics,
            artifacts,
            logs: [
              ...outputLines.map((l, i) => `out[${i}]: ${JSON.stringify(l)}`),
              ...diagLines,
              ...(ctx.hello?.error ? [`error: ${ctx.hello.error}`] : []),
            ],
            assertions,
            debugLogs: debugLog,
            stackTrace,
          }
        )
      }
      return successStage('11', 'run TeX on hello.tex', duration, {
        metrics,
        artifacts,
        logs: [...outputLines.map((l, i) => `out[${i}]: ${JSON.stringify(l)}`), ...diagLines],
        assertions,
        debugLogs: debugLog,
      })
    },
  },

  {
    id: 12,
    title: 'run TeX on trip.tex (TRIP 测试)',
    run: (ctx) => {
      if (!ctx.texCompileOk)
        return skippedStage('12', 'run TeX on trip.tex', 'tex.pas compile failed')
      const t0 = now()
      let debugLog: string[] = []
      let stackTrace: string[] = []
      let resultFiles: Map<string, Uint8Array> = new Map()
      let output = ''
      let tripStatus: string = 'unknown'
      let tripError: string | undefined
      let tripSteps = 0
      let pass1Output = ''
      try {
        // ---- Pass 1: INITEX 运行 trip.tex，生成 trip.fmt 格式文件 ----
        // trip.tex 第 90 行有 \let\next=\dump，TeX 执行到此处会 dump 格式文件
        const r1 = runTeXCompiled(ctx.texCompiledJs, {
          input: ['trip'],
          files: {
            'trip.tex': ctx.tripTex,
            'TeXfonts:trip.tfm': ctx.tripTfm,
            'TeXformats:TEX.POOL': ctx.tex!.pool,
          },
          maxSteps: 5e9,
          plugins: [pascalHPlugin],
        })
        debugLog.push(...(r1.debugLog ?? []))
        pass1Output = r1.output
        if (r1.state.error?.stackTrace) stackTrace = r1.state.error.stackTrace

        // 查找生成的 trip.fmt 文件
        const tripFmt = findFile(r1.files, 'trip.fmt')
        debugLog.push(
          `[pass1] status=${r1.state.status} steps=${r1.state.steps} fmtFound=${!!tripFmt} fmtSize=${tripFmt?.length ?? 0}`
        )

        // ---- Pass 2: 用 trip.fmt 运行 trip.tex，生成 trip.fot 输出 ----
        // trip.fot 是 pass 2 的期望输出（&trip 加载格式文件后运行 trip.tex）。
        // trip.tex 第 11 行 \ifx\initex\undefined 会在格式文件已加载时跳过 INITEX 初始化块，
        // 因此 pass 2 输出比 pass 1 短是正常的（不能按长度比较）。
        // 接受标准：pass 2 状态为 terminated 且未出现 "Fatal format file error"。
        // 失败时回退到 pass 1 输出（格式文件加载未实现时）。
        if (tripFmt) {
          // 输入需带前后空格以匹配 trip.fot 的终端回显：
          // trip.fot 第二行为 "** &trip  trip "（** 后有空格，trip 后也有空格）。
          // ** 是 TeX 的 init_terminal 提示符，后面的 " &trip  trip " 是终端回显的用户输入。
          // 前导空格和尾部空格会被 input_ln 的 loc 跳过和 last_nonblank 截断，
          // 但终端回显保留原始输入（含前后空格）。
          const r2 = runTeXCompiled(ctx.texCompiledJs, {
            input: [' &trip  trip '],
            files: {
              'trip.tex': ctx.tripTex,
              'trip.fmt': tripFmt,
              'TeXfonts:trip.tfm': ctx.tripTfm,
              'TeXformats:TEX.POOL': ctx.tex!.pool,
            },
            maxSteps: 5e9,
            plugins: [pascalHPlugin],
          })
          debugLog.push(...(r2.debugLog ?? []))
          if (r2.state.error?.stackTrace) stackTrace = r2.state.error.stackTrace
          const pass2Fatal = r2.output.includes('Fatal format file error')
          debugLog.push(
            `[pass2] status=${r2.state.status} steps=${r2.state.steps} outLen=${r2.output.length} fatal=${pass2Fatal} err=${r2.state.error?.message ?? '(none)'}`
          )
          // pass 2 成功（状态 terminated 且无 fatal format error）→ 使用 pass 2
          if (r2.state.status === 'terminated' && !pass2Fatal) {
            output = r2.output
            tripStatus = r2.state.status
            tripError = r2.state.error?.message
            tripSteps = r1.state.steps + r2.state.steps
            resultFiles = r2.files
            debugLog.push(`[pass2] accepted (status=terminated, no fatal format error)`)
          } else {
            // pass 2 失败（格式文件加载未实现或 fatal error），回退到 pass 1
            debugLog.push(
              `[pass2] rejected (status=${r2.state.status}, fatal=${pass2Fatal}), falling back to pass 1`
            )
            // 保存 pass 2 输出前 10 行用于诊断
            const r2Lines = r2.output
              .split('\n')
              .filter((l) => l.length > 0)
              .slice(0, 10)
            debugLog.push(`[pass2] first lines: ${JSON.stringify(r2Lines)}`)
            output = r1.output
            tripStatus = r1.state.status
            tripError = r1.state.error?.message
            tripSteps = r1.state.steps
            resultFiles = r1.files
          }
        } else {
          // trip.fmt 未生成，使用 pass 1 的结果
          output = r1.output
          tripStatus = r1.state.status
          tripError = r1.state.error?.message
          tripSteps = r1.state.steps
          resultFiles = r1.files
        }
        // 提取 TeX 写入的日志文件（trip.log）内容。
        // trip.fot 是日志文件内容，不是终端输出，因此需要用日志文件来比较。
        // TeX 通过 open_log_file 中的 rewrite(logfile, 'trip.log') 创建日志文件，
        // banner 和 ** + 输入行回显都写入日志文件（SELECTOR=18, log_only），
        // 而终端输出只包含部分内容（如 ** 提示符但无输入行回显）。
        let tripLogFile = ''
        const logEntry = Array.from(resultFiles.entries()).find(([k]) => k.endsWith('.log'))
        if (logEntry) {
          tripLogFile = new TextDecoder().decode(logEntry[1])
        }
        ctx.trip = {
          output,
          status: tripStatus,
          error: tripError,
          steps: tripSteps,
          files: resultFiles,
          logFile: tripLogFile,
        }
      } catch (e: any) {
        ctx.trip = {
          output: '',
          status: 'error',
          error: e?.message,
          steps: 0,
          files: new Map(),
          logFile: '',
        }
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
      }

      const duration = now() - t0
      const ok = ctx.trip?.status === 'terminated'
      const hasBanner = output.includes('This is TeX')
      const hasInitex = output.includes('(INITEX)')
      const outputLines = output.split('\n').filter((l) => l.length > 0)
      const outputLineCount = outputLines.length
      const hasReasonableOutput = outputLineCount > 10
      const hasEmergencyStop = output.includes('! Emergency stop.')
      const hasNoPages = output.includes('No pages of output')
      const hasDisplaylimits = output.includes('displaylimits')
      const hasEeXformats = output.includes('eXformats')
      const hasTeXformats = output.includes('TeXformats')

      const dviInfo = findDviFile(resultFiles)
      const dviValidation = dviInfo ? validateDvi(dviInfo.data) : null
      const hasDvi = dviInfo !== null && dviValidation !== null
      const dviValid = hasDvi && dviValidation!.valid
      const dviSize = dviInfo?.data.length ?? 0

      const metrics: Record<string, any> = {
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
        dviFile: dviInfo?.name ?? '(none)',
        dviSize: formatBytes(dviSize),
        dviValid,
      }
      const assertions = [
        assert('run ok', ok, ctx.trip?.status, 'terminated'),
        assert('output has This is TeX', hasBanner, undefined, 'contains'),
        assert('output has (INITEX)', hasInitex, undefined, 'contains'),
        assert('output lines > 10', hasReasonableOutput, String(outputLineCount), '> 10'),
        assert('dvi file exists', hasDvi, dviInfo?.name ?? '(none)', '.dvi file'),
      ]
      const diagLines: string[] = []
      if (hasEmergencyStop)
        diagLines.push(`diag: emergency stop detected (output too short, ${outputLineCount} lines)`)
      if (hasDisplaylimits)
        diagLines.push('diag: banner contains "displaylimits" (pool string offset issue)')
      if (hasEeXformats)
        diagLines.push('diag: output contains "eXformats" (missing leading T, pool offset by 1)')
      if (hasNoPages) diagLines.push('diag: "No pages of output" - TeX did not produce output')
      if (!hasDvi) {
        diagLines.push('diag: no .dvi file in output files - TeX did not produce DVI output')
        const allFiles = Array.from(resultFiles.keys()).filter((n) => n !== 'TTY:')
        diagLines.push(
          `diag: output files: ${allFiles.length > 0 ? allFiles.join(', ') : '(none)'}`
        )
      } else {
        diagLines.push(`diag: dvi: ${dviInfo!.name} ${formatBytes(dviSize)}, valid=${dviValid}`)
        diagLines.push(`diag: dvi first 8 bytes: ${dviValidation!.firstBytes}`)
        diagLines.push(`diag: dvi last 8 bytes: ${dviValidation!.lastBytes}`)
        if (!dviValid) diagLines.push(`diag: dvi invalid: ${dviValidation!.reason}`)
      }

      const artifacts: StageArtifact[] = output ? [artifact('trip.log', output)] : []
      // 保存实际日志文件（TeX 写入 trip.log 的内容，用于与 trip.fot 比较）
      if (ctx.trip?.logFile) {
        artifacts.push(artifact('trip.actual.log', ctx.trip.logFile))
      }
      // 列出所有输出文件，便于诊断
      const allOutFiles = Array.from(resultFiles.keys()).filter((n) => n !== 'TTY:')
      diagLines.push(`diag: output files (${allOutFiles.length}): ${allOutFiles.join(', ')}`)
      if (pass1Output) artifacts.push(artifact('trip.pass1.log', pass1Output))
      if (dviInfo) {
        artifacts.push(binaryArtifact(dviInfo.name, dviInfo.data))
        // 提取 DVI 中的文字内容，输出为 plain-dvi.txt 便于人工核对
        const dviText = extractDviText(dviInfo.data)
        artifacts.push(artifact('plain-dvi.txt', dviText.text))
        // 生成 DVI → HTML 预览，便于在浏览器中查看排版结果
        artifacts.push(artifact('trip.dvi.html', dviToHtml(dviInfo.data)))
        // 生成 DVI → JSON 数据树，便于调试解析过程
        artifacts.push(artifact('trip.dvi.json', dviToJson(dviInfo.data)))
        metrics.dviPages = dviText.pages.length
        metrics.dviFonts = dviText.fonts.size
        metrics.dviTextLen = dviText.pages.reduce((sum, p) => sum + p.length, 0)
        if (dviText.errors.length > 0) {
          metrics.dviParseErrors = dviText.errors.length
          for (const err of dviText.errors.slice(0, 5)) {
            diagLines.push(`diag: dvi parse: ${err}`)
          }
        }
        // 预览前两页的文字内容
        for (let i = 0; i < Math.min(2, dviText.pages.length); i++) {
          const preview = dviText.pages[i].slice(0, 80)
          diagLines.push(`diag: dvi page ${i + 1} text preview: ${JSON.stringify(preview)}`)
        }
      }

      if (!ok) {
        return failedStage('12', 'run TeX on trip.tex', duration, ctx.trip?.error ?? 'unknown', {
          metrics,
          artifacts,
          logs: [
            ...outputLines.map((l, i) => `out[${i}]: ${JSON.stringify(l)}`),
            ...diagLines,
            ...(ctx.trip?.error ? [`error: ${ctx.trip.error}`] : []),
          ],
          assertions,
          debugLogs: debugLog,
          stackTrace,
        })
      }
      return successStage('12', 'run TeX on trip.tex', duration, {
        metrics,
        artifacts,
        logs: [...outputLines.map((l, i) => `out[${i}]: ${JSON.stringify(l)}`), ...diagLines],
        assertions,
        debugLogs: debugLog,
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
      // trip.fot 是 TeX 的终端输出（含终端驱动回显的输入行）。
      // TeX 在 init_terminal 中打印 ** 提示符，终端驱动回显用户输入 &trip  trip，
      // 然后后续输出由 TeX 打印。日志文件内容不同（含完整 banner 和 tracing）。
      const actual = ctx.trip.output
      const expected = ctx.tripFot
      const actualSource = 'trip output (terminal)'

      // 规范化行尾：trip.fot 使用 CRLF（\r\n），我们的输出使用 LF（\n）
      // 同时去掉末尾换行符：trip.fot 文件末尾的 \n 是文件保存时添加的，
      // 不是 TeX 的输出（TeX 打印 "Transcript written on trip.log." 后不换行）
      const normalizeLineEndings = (s: string) =>
        s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+$/, '')
      const fotLines = normalizeLineEndings(expected).split('\n')
      const outLines = normalizeLineEndings(actual).split('\n')

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
      const matchRate =
        totalLines > 0
          ? `${matchCount}/${totalLines} (${((matchCount / totalLines) * 100).toFixed(1)}%)`
          : '0/0'

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
        actualSource,
        matchCount,
        mismatchCount,
        onlyInExpected,
        onlyInActual,
        matchRate,
        markerChecks: `${markerPassCount}/${markerChecks.length}`,
      }
      const assertions = [
        assert(
          'match rate = 100%',
          totalLines > 0 && matchCount === totalLines,
          matchRate,
          '= 100%'
        ),
        assert(
          'markers all pass',
          markerPassCount === markerChecks.length,
          `${markerPassCount}/${markerChecks.length}`,
          'all'
        ),
      ]

      const logs = [
        `actualSource: ${actualSource}`,
        `matchRate: ${matchRate}`,
        ...markerChecks.map(
          (c) =>
            `marker: ${c.pass ? 'ok' : 'X'} "${c.marker}" exp=${c.inExpected} act=${c.inActual}`
        ),
        ...compareLines.slice(0, 50),
      ]

      // TRIP 是 diabolical test，match rate 必须 100% 通过
      const ok = totalLines > 0 && matchCount === totalLines

      if (!ok) {
        return failedStage(
          '14',
          'compare trip vs trip.fot',
          duration,
          `match rate not 100%: ${matchRate}`,
          {
            metrics,
            artifacts: [artifact('trip.compare.txt', compareLines.join('\n'))],
            logs,
            assertions,
          }
        )
      }
      return successStage('14', 'compare trip vs trip.fot', duration, {
        metrics,
        artifacts: [artifact('trip.compare.txt', compareLines.join('\n'))],
        logs,
        assertions,
      })
    },
  },

  // ============================================================
  // PLAIN TeX 流水线
  // ============================================================

  {
    id: 15,
    title: 'generate plain.fmt (INITEX)',
    run: (ctx) => {
      if (!ctx.texCompileOk)
        return skippedStage('15', 'generate plain.fmt', 'tex.pas compile failed')
      if (!ctx.texCompiledJsFull)
        return skippedStage('15', 'generate plain.fmt', 'tex-full.js not compiled (mem_top=30000)')
      if (!ctx.texFull?.pool)
        return skippedStage('15', 'generate plain.fmt', 'no TEX.POOL available')

      const t0 = now()
      let debugLog: string[] = []
      let stackTrace: string[] = []
      let output = ''
      let status = 'unknown'
      let steps = 0

      try {
        // INITEX 模式：加载 plain.tex 后 \dump 生成 plain.fmt
        // 使用默认内存版本（mem_top=30000），TRIP 版本的 mem_top=3000 内存不足。
        // tex.web 默认 init/tini 为空（INITEX 模式），store_fmt_file 已编译
        // 输入：第一行 'plain' → TeX 加载 plain.tex；第二行 '\dump' → 生成 fmt
        const r = runTeXCompiled(ctx.texCompiledJsFull, {
          input: ['plain', '\\dump'],
          files: {
            'plain.tex': ctx.plainTex,
            'hyphen.tex': ctx.hyphenTex,
            'TeXformats:TEX.POOL': ctx.texFull.pool,
            ...ctx.cmFonts,
          },
          maxSteps: 5e9,
          plugins: [pascalHPlugin],
        })
        debugLog.push(...(r.debugLog ?? []))
        output = r.output
        status = r.state.status
        const error = r.state.error?.message
        steps = r.state.steps
        if (r.state.error?.stackTrace) stackTrace = r.state.error.stackTrace

        // 查找生成的 plain.fmt
        const fmt = findFile(r.files, 'plain.fmt')
        ctx.plainFmt = fmt

        const fatalFmt = output.includes('Fatal format file error')
        const emergencyStop = output.includes('! Emergency stop.')
        const hasMissingFile = output.includes("I can't find file")
        const hasCapacity = output.includes('TeX capacity exceeded')

        // 从输出提取错误行（以 "! " 开头的行）
        const errorLines = output
          .split('\n')
          .filter((l) => l.startsWith('! ') && !l.startsWith('! Emergency stop'))
          .slice(0, 10)
          .join(' | ')

        // INITEX dump 后有 "Beginning to dump on file plain.fmt" 提示
        const beginDump = output.includes('Beginning to dump on file plain.fmt')
        // dump 完成后打印 "X memory locations dumped"（X 为数字）
        const dumpedMem = /^\d+ memory locations dumped/m.test(output)
        // 字体/连字统计行，表明 plain.tex 各阶段都跑完了
        const hasHyphen = output.includes('Hyphenation trie of length')

        debugLog.push(
          `[s15] status=${status} steps=${steps} fmtFound=${!!fmt} fmtSize=${fmt?.length ?? 0} beginDump=${beginDump} dumpedMem=${dumpedMem} hyphen=${hasHyphen} fatal=${fatalFmt} emergency=${emergencyStop} missingFile=${hasMissingFile} capacity=${hasCapacity} errors=${errorLines || '(none)'}`
        )

        const assertions = [
          assert('no fatal format error', !fatalFmt, `${fatalFmt}`, 'false'),
          assert('no emergency stop', !emergencyStop, `${emergencyStop}`, 'false'),
          assert('no missing file', !hasMissingFile, `${hasMissingFile}`, 'false'),
          assert('no capacity exceeded', !hasCapacity, `${hasCapacity}`, 'false'),
          assert('no error lines', errorLines === '', errorLines || '(none)', '(none)'),
          assert(
            'plain.fmt generated',
            !!fmt && fmt.length > 0,
            fmt ? formatBytes(fmt.length) : '(none)',
            '> 0 bytes'
          ),
          assert('begin dump message', beginDump, `${beginDump}`, 'true'),
          assert(
            'memory dumped',
            dumpedMem,
            output.match(/^\d+ memory locations dumped/m)?.[0] ?? '(none)',
            'N memory locations dumped'
          ),
          assert('hyphenation trie built', hasHyphen, `${hasHyphen}`, 'true'),
        ]

        const ok =
          !!fmt &&
          fmt.length > 0 &&
          !fatalFmt &&
          !emergencyStop &&
          !hasMissingFile &&
          !hasCapacity &&
          errorLines === '' &&
          beginDump &&
          dumpedMem &&
          hasHyphen

        const commonArtifacts = [
          artifact('plain.fmt.log', output),
          artifact('plain.fmt.debug.txt', debugLog.join('\n')),
          ...(fmt ? [binaryArtifact('plain.fmt', fmt)] : []),
        ]

        if (!ok) {
          return failedStage(
            '15',
            'generate plain.fmt',
            now() - t0,
            error ?? 'plain.fmt not generated or has errors',
            {
              metrics: {
                status,
                steps,
                fmtSize: fmt?.length ?? 0,
                outputLen: output.length,
                fatalFmt,
                emergencyStop,
                hasMissingFile,
                hasCapacity,
              },
              artifacts: commonArtifacts,
              consoleLogs: output.split('\n').slice(-50),
              debugLogs: debugLog,
              stackTrace,
              assertions,
            }
          )
        }

        return successStage('15', 'generate plain.fmt', now() - t0, {
          metrics: {
            status,
            steps,
            fmtSize: fmt!.length,
            fmtSizeFmt: formatBytes(fmt!.length),
            outputLen: output.length,
          },
          artifacts: commonArtifacts,
          consoleLogs: output.split('\n').slice(-30),
          debugLogs: debugLog,
          assertions,
        })
      } catch (e: any) {
        const error = e?.message || String(e)
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
        return failedStage('15', 'generate plain.fmt', now() - t0, error, {
          artifacts: [artifact('plain.fmt.log', output)],
          debugLogs: debugLog,
          stackTrace,
        })
      }
    },
  },

  {
    id: 16,
    title: 'compile tripman.tex',
    run: (ctx) => {
      if (!ctx.texCompileOk)
        return skippedStage('16', 'compile tripman.tex', 'tex.pas compile failed')
      if (!ctx.texCompiledJsFull)
        return skippedStage('16', 'compile tripman.tex', 'tex-full.js not compiled')
      if (!ctx.plainFmt) return skippedStage('16', 'compile tripman.tex', 'plain.fmt not generated')

      const t0 = now()
      let debugLog: string[] = []
      let stackTrace: string[] = []
      let output = ''
      let status = 'unknown'
      let steps = 0
      let resultFiles: Map<string, Uint8Array> = new Map()

      try {
        // 用 &plain 加载 plain.fmt，然后编译 tripman.tex
        // 使用默认内存版本（mem_top=30000），与 plain.fmt 生成版本一致。
        // 输入 ' &plain  tripman ' 模拟终端：先加载格式，再处理文档。
        // tripman.tex 有多个 \verbatim{...} → \input，需注入 trip.tex/pl/log/typ/fot 等：
        //   l.347 trip.tex, l.361 trip.pl, l.370 tripin.log, l.380 trip.log,
        //   l.392 trip.typ, l.403 tripos.tex, l.411 trip.fot
        const r = runTeXCompiled(ctx.texCompiledJsFull, {
          input: [' &plain  tripman '],
          files: {
            'tripman.tex': ctx.tripmanTex,
            'trip.tex': readResource('trip.tex'),
            'trip.pl': readResource('trip.pl'),
            'tripin.log': readResource('tripin.log'),
            'trip.log': readResource('trip.log'),
            'trip.typ': readResource('trip.typ'),
            'tripos.tex': readResource('tripos.tex'),
            'trip.fot': readResource('trip.fot'),
            'plain.fmt': ctx.plainFmt,
            'TeXformats:TEX.POOL': ctx.texFull!.pool,
            ...ctx.cmFonts,
          },
          maxSteps: 5e9,
          plugins: [pascalHPlugin],
        })
        debugLog.push(...(r.debugLog ?? []))
        output = r.output
        status = r.state.status
        const error = r.state.error?.message
        steps = r.state.steps
        resultFiles = r.files
        if (r.state.error?.stackTrace) stackTrace = r.state.error.stackTrace

        ctx.tripman = {
          output,
          status,
          error,
          steps,
          files: resultFiles,
        }

        // 验证 DVI 输出
        const dvi = findDviFile(resultFiles)
        const dviValid = dvi ? validateDvi(dvi.data) : null
        const dviExtract = dvi && dviValid?.valid ? extractDviText(dvi.data) : null
        const dviTextLen = dviExtract?.pages.reduce((s, p) => s + p.length, 0) ?? 0
        const hasOutputLine = output.includes('Output written on')
        const fatalFmt = output.includes('Fatal format file error')
        const emergencyStop = output.includes('! Emergency stop.')
        const hasMissingFile = output.includes("I can't find file")
        const hasCapacity = output.includes('TeX capacity exceeded')

        // 从输出提取错误行（以 "! " 开头的行）
        const errorLines = output
          .split('\n')
          .filter((l) => l.startsWith('! ') && !l.startsWith('! Emergency stop'))
          .slice(0, 10)
          .join(' | ')

        debugLog.push(
          `[s16] status=${status} steps=${steps} dviFound=${!!dvi} dviValid=${dviValid?.valid} dviContent=${dviValid?.hasContent} dviTextLen=${dviTextLen} pages=${dviExtract?.pages.length ?? 0} fonts=${dviExtract?.fonts.size ?? 0} hasOutput=${hasOutputLine} fatal=${fatalFmt} emergency=${emergencyStop} missingFile=${hasMissingFile} capacity=${hasCapacity} errors=${errorLines || '(none)'}`
        )

        const assertions = [
          assert('no fatal format error', !fatalFmt, `${fatalFmt}`, 'false'),
          assert('no emergency stop', !emergencyStop, `${emergencyStop}`, 'false'),
          assert('no missing file', !hasMissingFile, `${hasMissingFile}`, 'false'),
          assert('no capacity exceeded', !hasCapacity, `${hasCapacity}`, 'false'),
          assert('no error lines', errorLines === '', errorLines || '(none)', '(none)'),
          assert('DVI file generated', !!dvi, dvi ? dvi.name : '(none)', 'tripman.dvi'),
          assert('DVI valid', dviValid?.valid ?? false, dviValid?.reason ?? '(no dvi)', 'valid'),
          assert(
            'DVI has content',
            dviValid?.hasContent ?? false,
            `${dviValid?.hasContent}`,
            'true'
          ),
          assert('DVI has text', dviTextLen > 0, `${dviTextLen} chars`, '> 0 chars'),
          assert('output written', hasOutputLine, `${hasOutputLine}`, 'true'),
        ]

        const ok =
          !fatalFmt &&
          !emergencyStop &&
          !hasMissingFile &&
          !hasCapacity &&
          errorLines === '' &&
          !!dvi &&
          dviValid?.valid &&
          dviValid.hasContent &&
          dviTextLen > 0 &&
          hasOutputLine

        const commonArtifacts = [
          artifact('tripman.log', output),
          ...(dvi ? [binaryArtifact('tripman.dvi', dvi.data)] : []),
          ...(dviExtract ? [artifact('tripman-dvi.txt', dviExtract.text)] : []),
          // 生成 DVI → HTML 预览，便于在浏览器中查看排版结果
          ...(dvi ? [artifact('tripman.dvi.html', dviToHtml(dvi.data))] : []),
          // 生成 DVI → JSON 数据树，便于调试解析过程
          ...(dvi ? [artifact('tripman.dvi.json', dviToJson(dvi.data))] : []),
        ]

        if (!ok) {
          return failedStage(
            '16',
            'compile tripman.tex',
            now() - t0,
            error ?? 'DVI not generated or has errors',
            {
              metrics: {
                status,
                steps,
                dviSize: dvi?.data.length ?? 0,
                dviTextLen,
                dviPages: dviExtract?.pages.length ?? 0,
                dviFonts: dviExtract?.fonts.size ?? 0,
                outputLen: output.length,
                fatalFmt,
                emergencyStop,
                hasMissingFile,
                hasCapacity,
              },
              artifacts: commonArtifacts,
              consoleLogs: output.split('\n').slice(-80),
              debugLogs: debugLog,
              stackTrace,
              assertions,
            }
          )
        }

        return successStage('16', 'compile tripman.tex', now() - t0, {
          metrics: {
            status,
            steps,
            dviSize: dvi!.data.length,
            dviTextLen,
            dviPages: dviExtract!.pages.length,
            dviFonts: dviExtract!.fonts.size,
            outputLen: output.length,
          },
          artifacts: commonArtifacts,
          consoleLogs: output.split('\n').slice(-50),
          debugLogs: debugLog,
          assertions,
        })
      } catch (e: any) {
        const error = e?.message ?? String(e)
        stackTrace = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
        return failedStage('16', 'compile tripman.tex', now() - t0, error, {
          artifacts: [artifact('tripman.log', output)],
          debugLogs: debugLog,
          stackTrace,
        })
      }
    },
  },

  // ============================================================
  // XeTeX 流水线（编译 xetex.pas）
  //   参照 web2c/xetexdir/am/xetex.am 的编译流水线：
  //     1. tie 合并 tangle.web + tangle-xetex.ch → tangle-final.web
  //     2. TANGLE 编译 tangle-final.web → tangle.pas (v4，支持大文件)
  //     3. tie 合并 xetex.web + 11 个 ch → xetex-final.web
  //     4. TANGLE v4 编译 xetex-final.web → xetex.pas
  //   stage 17 完成步骤 1-2，stage 18 完成步骤 3-4。
  // ============================================================

  {
    id: 17,
    title: 'tie 合并 tangle.web + tangle-xetex.ch → TANGLE v4 (大文件支持)',
    run: runTangleStage({
      id: '17', title: 'compile TANGLE v4',
      failId: '17',
      prepare: (ctx) => {
        if (!ctx.tanglePas || !ctx.tangleWeb)
          return { skip: 'tanglePas/tangleWeb missing (stage 1)' }
        // 1. 读取 tangle-xetex.ch（调整 TANGLE 内部常量以支持大文件）
        //    - buf_size: 100 → 1000  （xetex.web 有 109 字符的长行）
        //    - max_bytes/max_toks: → 65535
        //    - max_names/max_texts: → 10239
        //    - hash_size: → 8501
        //    - zz: 3 → 5  （token 容量 3*65536 → 5*65536）
        //    - equiv: sixteen_bits → integer  （支持 32 位大整数）
        //    - @'100000 → @'10000000000  （数值宏偏移 2^15 → 2^30）
        ctx.tangleXetexCh = readResource('tangle-xetex.ch')
        const dl: string[] = [
          `[s17] tangle-xetex.ch: ${formatBytes(ctx.tangleXetexCh.length)}`,
        ]
        // 2. tie 合并 tangle.web + tangle-xetex.ch
        const finalWeb = tieMerge(ctx.tangleWeb, [
          { filename: 'tangle-xetex.ch', content: ctx.tangleXetexCh },
        ], dl, 's17')
        // 3. 用 tangle-official.pas (v2.8, buf_size=100) 编译 tangle-final.web
        //    tangle.web 本身没有长行，v2.8 的 buf_size=100 足够。
        return { pas: ctx.tanglePas, web: finalWeb, debugLog: dl }
      },
      commit: (ctx, res) => { ctx.tangleV4 = res },
      metrics: (ctx, res, webInput) => {
        const hasBufSize1000 = res.pascal.includes('BUFSIZE=1000')
        const hasZz5 =
          res.pascal.includes('ARRAY[0..4,0..MAXTOKS]') ||
          res.pascal.includes('ARRAY[0..4,0..65535')
        const hasMaxToks65535 = res.pascal.includes('MAXTOKS=65535')
        return {
          chInput: formatBytes(ctx.tangleXetexCh.length),
          webInput: formatBytes(webInput),
          status: res.status,
          pascalOut: formatBytes(res.pascal.length),
          poolOut: formatBytes(res.pool.length),
          banner: firstLine(res.output),
          hasBufSize1000,
          hasZz5,
          hasMaxToks65535,
          noErrors: res.output.includes('(No errors were found.)'),
          hasDone: res.output.includes('Done.'),
        }
      },
      assertions: (_, res) => {
        const hasBufSize1000 = res.pascal.includes('BUFSIZE=1000')
        const hasZz5 =
          res.pascal.includes('ARRAY[0..4,0..MAXTOKS]') ||
          res.pascal.includes('ARRAY[0..4,0..65535')
        return [
          assert('run ok', res.status === 'terminated', res.status, 'terminated'),
          assert('pascalOut > 40KB', res.pascal.length > 40000,
            formatBytes(res.pascal.length), '> 40 KB'),
          assert('output has Done.', res.output.includes('Done.'), undefined, 'contains'),
          assert('buf_size=1000 (长行支持)', hasBufSize1000,
            hasBufSize1000 ? 'found' : 'missing', 'BUF_SIZE=1000'),
          assert('zz=5 (token 容量 5*65536)', hasZz5,
            hasZz5 ? 'found' : 'missing', 'zz=5'),
        ]
      },
      artifacts: (ctx, res) => res.pascal ? [
        artifact('tangle.pas.v4', res.pascal),
        artifact('tangle.pool.v4', res.pool),
        artifact('tangle.v4.out', res.output),
        artifact('tangle-xetex.ch', ctx.tangleXetexCh),
      ] : [],
      logs: (_, res) => [
        `banner: ${firstLine(res.output)}`,
        `pascal first: ${previewLine(res.pascal)}`,
        ...tailLines(res.output, 5).map(
          (l, i, arr) => `tail[${arr.length - i}]: ${JSON.stringify(l)}`
        ),
      ],
    }),
  },

  {
    id: 18,
    title: 'tie 合并 xetex.web + 11 ch → 编译 xetex.pas',
    run: runTangleStage({
      id: '18', title: 'compile xetex.pas',
      failId: '18',
      prepare: (ctx) => {
        if (!ctx.tangleV4 || ctx.tangleV4.status !== 'terminated')
          return { skip: 'TANGLE v4 not available (stage 17)' }
        // 1. 读取 xetex.web 和 11 个 change file
        //    change file 顺序参照 web2c/xetexdir/am/xetex.am 的 xetex_ch_srcs：
        //      xetex.web, xetex-tex.ch0, tex.ch, tracingstacklevels.ch,
        //      partoken-102.ch, partoken.ch, locnull-optimize.ch,
        //      unbalanced-braces.ch, showstream.ch, xetex.ch,
        //      char-warning-xetex.ch, tex-binpool.ch
        //    （跳过 synctex 相关 ch，因为我们的 TANGLE 不支持 synctex 扩展）
        ctx.xetexWeb = readResource('xetex.web')
        const chFiles = [
          'xetex-tex.ch0', 'xetex-tex.ch', 'xetex-tracingstacklevels.ch',
          'xetex-partoken-102.ch', 'xetex-partoken.ch', 'xetex-locnull-optimize.ch',
          'xetex-unbalanced-braces.ch', 'xetex-showstream.ch', 'xetex.ch',
          'xetex-char-warning-xetex.ch', 'xetex-tex-binpool.ch',
        ]
        ctx.xetexChanges = chFiles.map((f) => ({ filename: f, content: readResource(f) }))
        const dl: string[] = [
          `[s18] xetex.web: ${formatBytes(ctx.xetexWeb.length)}, ${chFiles.length} ch files: ` +
            ctx.xetexChanges.map((c) => `${c.filename}=${formatBytes(c.content.length)}`).join(', '),
        ]
        // 2. tie 合并 xetex.web + 11 ch → xetex-final.web
        const finalWeb = tieMerge(ctx.xetexWeb, ctx.xetexChanges, dl, 's18')
        dl.push(`[s18] xetex-final.web: ${formatBytes(finalWeb.length)}`)
        // 3. 用 TANGLE v4 (buf_size=1000, zz=5) 编译
        return { pas: ctx.tangleV4.pascal, web: finalWeb, debugLog: dl }
      },
      commit: (ctx, res) => { ctx.xetex = res },
      metrics: (ctx, res, webInput) => {
        const hasEmergencyStop = res.output.includes('(That was a fatal error, my friend.)')
        const hasTokenExceeded = res.output.includes('token capacity exceeded')
        const hasInputLineTooLong = res.output.includes('Input line too long')
        const hasValueTooBig = res.output.includes('Value too big')
        const errorLines = tangleErrorLines(res.output, 5)
        const modules = extractModuleNumbers(res.output)
        const chTotal = ctx.xetexChanges.reduce((s, c) => s + c.content.length, 0)
        return {
          webInput: formatBytes(webInput),
          chCount: ctx.xetexChanges.length,
          chTotalSize: formatBytes(chTotal),
          status: res.status,
          pascalOut: formatBytes(res.pascal.length),
          poolOut: formatBytes(res.pool.length),
          banner: firstLine(res.output),
          modules,
          hasBanner: res.output.includes('This is TANGLE, Version 4.6'),
          hasDone: res.output.includes('Done.'),
          noErrors: res.output.includes('(No errors were found.)'),
          hasProgramXetex: res.pascal.includes('PROGRAM XETEX'),
          hasEmergencyStop,
          hasTokenExceeded,
          hasInputLineTooLong,
          hasValueTooBig,
          errorLines: errorLines.length,
        }
      },
      assertions: (_, res) => {
        const hasBanner = res.output.includes('This is TANGLE, Version 4.6')
        const hasProgramXetex = res.pascal.includes('PROGRAM XETEX')
        const hasDone = res.output.includes('Done.')
        const hasEmergencyStop = res.output.includes('(That was a fatal error, my friend.)')
        const hasTokenExceeded = res.output.includes('token capacity exceeded')
        const hasInputLineTooLong = res.output.includes('Input line too long')
        return [
          assert('run ok', res.status === 'terminated', res.status, 'terminated'),
          assert('banner v4.6', hasBanner,
            hasBanner ? 'found' : 'missing', 'This is TANGLE, Version 4.6'),
          assert('pascalOut > 500KB', res.pascal.length > 500000,
            formatBytes(res.pascal.length), '> 500 KB'),
          assert('pascal has PROGRAM XETEX', hasProgramXetex,
            hasProgramXetex ? 'found' : 'missing', 'PROGRAM XETEX'),
          assert('output has Done.', hasDone, undefined, 'contains'),
          assert('no fatal error', !hasEmergencyStop,
            hasEmergencyStop ? 'fatal' : 'ok', 'no fatal error'),
          assert('no token capacity exceeded', !hasTokenExceeded,
            hasTokenExceeded ? 'exceeded' : 'ok', 'no token overflow'),
          assert('no input line too long', !hasInputLineTooLong,
            hasInputLineTooLong ? 'too long' : 'ok', 'no long line'),
        ]
      },
      artifacts: (_, res) => res.pascal ? [
        artifact('xetex.pas', res.pascal),
        artifact('xetex.pool', res.pool),
        artifact('xetex.tangle.out', res.output),
      ] : [],
      logs: (_, res) => {
        const modules = extractModuleNumbers(res.output)
        return [
          `banner: ${firstLine(res.output)}`,
          `modules: ${modules.slice(0, 80)}...`,
          `pascal first: ${previewLine(res.pascal)}`,
          ...tailLines(res.output, 5).map(
            (l, i, arr) => `tail[${arr.length - i}]: ${JSON.stringify(l)}`
          ),
        ]
      },
    }),
  },
]

// ============================================================
// 主执行器
// ============================================================

export async function runE2E(opts: CliOptions): Promise<void> {
  console.log(`\n${'='.repeat(70)}`)
  console.log('E2E 测试运行器')
  console.log(`时间: ${timestamp()}`)
  console.log(
    `参数: ${opts.stages ? `--stage=${opts.stages.join(',')}` : 'all'}${opts.noCache ? ' --fresh' : ''}`
  )
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
      const stackLines: string[] = e?.stack ? String(e.stack).split('\n').slice(0, 40) : []
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
        consoleLogs:
          report.consoleLogs.length > 0 ? [...report.consoleLogs, ...consoleBuffer] : consoleBuffer,
      }
    }

    printStageProgress(report, now() - stageStart)
    stageReports.push(report)
  }

  const totalDuration = now() - totalStart
  const success = stageReports.every((s) => s.status !== 'failed')

  const report = createReport(
    timestamp(),
    success,
    totalDuration,
    stageReports,
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
    try {
      return JSON.stringify(arg)
    } catch {
      return String(arg)
    }
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
