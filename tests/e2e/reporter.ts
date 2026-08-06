/**
 * E2E 测试报告生成器。
 *
 * 报告目录结构（位于项目根目录 `reports/`）：
 *   reports/
 *     index.html                  顶级导航（列出所有历史测试）
 *     {timestamp-id}/             每次测试一个文件夹
 *       index.html                本次测试详情页（overview）
 *       overview.json             完整数据（含所有日志/堆栈）
 *       logs.txt                  所有 stage 普通日志（合并）
 *       console.txt               所有 stage 控制台输出（合并）
 *       debug.txt                 所有 stage 调试日志（合并）
 *       stack.txt                 所有 stage 错误堆栈（合并）
 *       stages/                   每个阶段一个子目录
 *         1/
 *           tangle-official.pas
 *           logs.txt              该阶段独立日志
 *         8/
 *           tex.pas
 *           tex.pool
 *           ...
 *
 * 设计原则：
 *   - HTML 纯原生标签（h1-h6/p/ul/li/a/code/pre），无任何样式/CSS/inline style。
 *   - 报告生成与测试内容解耦：HTML 中的文件链接通过遍历 stages/ 目录生成，
 *     不写死任何文件名。
 *   - 保留所有历史测试文件夹，顶级 index.html 列出全部。
 *   - 错误堆栈/控制台输出/调试日志全部写入文本文件和 overview.json。
 */
import * as fs from 'fs'
import * as path from 'path'

// ============================================================
// 类型定义
// ============================================================

export type StageStatus = 'success' | 'failed' | 'skipped'

export interface StageArtifact {
  /** 文件名（如 "tangle.pas"） */
  name: string
  /** 文件内容（运行时写入磁盘，文本文件用 content，二进制文件用 binary） */
  content: string
  /** 二进制内容（可选，dvi/tfm 等二进制产物用此字段；设置后 content 被忽略） */
  binary?: Uint8Array
  /** 字节大小 */
  size: number
  /** 行数（二进制文件为 0） */
  lines: number
}

export interface Assertion {
  name: string
  passed: boolean
  actual?: string
  expected?: string
}

export interface StageReport {
  id: string
  title: string
  status: StageStatus
  duration: number
  /** key 必须是合法 JS 变量名（如 inputSize, lineCount） */
  metrics: Record<string, string | number | boolean>
  artifacts: StageArtifact[]
  /** 普通日志（运行过程的高层信息，如 banner、产物首行） */
  logs: string[]
  /** 控制台输出（运行期 console.log/error 等，原样保留） */
  consoleLogs: string[]
  /** 调试日志（运行期诊断信息，如 pool 文件读取追踪） */
  debugLogs: string[]
  /** 错误堆栈（异常时保存，便于离线排查） */
  stackTrace: string[]
  error?: string
  assertions: Assertion[]
}

export interface TestReport {
  /** 文件夹名（如 "2026-08-04_14-13-09_001"） */
  id: string
  timestamp: string
  success: boolean
  duration: number
  stages: StageReport[]
  env: { node: string; platform: string; arch: string }
  args: string[]
}

// ============================================================
// 报告目录
// ============================================================

export const REPORT_DIR = path.join(process.cwd(), 'reports')

/** 生成测试 id：时间戳 + 序号 */
function makeReportId(timestamp: string): string {
  const d = new Date(timestamp)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  let seq = 1
  let id = `${date}_${time}_${String(seq).padStart(3, '0')}`
  while (fs.existsSync(path.join(REPORT_DIR, id))) {
    seq++
    id = `${date}_${time}_${String(seq).padStart(3, '0')}`
  }
  return id
}

// ============================================================
// 写入报告
// ============================================================

/**
 * 写入报告：创建子文件夹，per-stage 子目录保存产物，生成极简 HTML。
 *
 * 文件结构：
 *   {dir}/index.html       overview 页（关键信息 + 文件链接）
 *   {dir}/overview.json    完整数据
 *   {dir}/logs.txt         所有 stage 日志合并
 *   {dir}/console.txt      所有 stage 控制台合并
 *   {dir}/debug.txt        所有 stage 调试日志合并
 *   {dir}/stack.txt        所有 stage 堆栈合并
 *   {dir}/stages/{id}/     每个阶段一个子目录，存放该阶段产物 + 独立日志
 */
export function writeReport(report: TestReport): void {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true })
  }

  const id = report.id || makeReportId(report.timestamp)
  const dir = path.join(REPORT_DIR, id)

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const stagesDir = path.join(dir, 'stages')

  // 1. per-stage 子目录：保存产物 + 该阶段独立日志
  for (const stage of report.stages) {
    const stageDir = path.join(stagesDir, stage.id)
    if (!fs.existsSync(stageDir)) {
      fs.mkdirSync(stageDir, { recursive: true })
    }
    // 产物文件（文本用 content，二进制用 binary）
    for (const art of stage.artifacts) {
      if (art.binary) {
        fs.writeFileSync(path.join(stageDir, art.name), Buffer.from(art.binary))
      } else if (art.content) {
        fs.writeFileSync(path.join(stageDir, art.name), art.content, 'utf-8')
      }
    }
    // 该阶段独立日志
    if (stage.logs.length > 0) {
      fs.writeFileSync(path.join(stageDir, 'logs.txt'), stage.logs.join('\n') + '\n', 'utf-8')
    }
    if (stage.consoleLogs.length > 0) {
      fs.writeFileSync(path.join(stageDir, 'console.txt'), stage.consoleLogs.join('\n') + '\n', 'utf-8')
    }
    if (stage.debugLogs.length > 0) {
      fs.writeFileSync(path.join(stageDir, 'debug.txt'), stage.debugLogs.join('\n') + '\n', 'utf-8')
    }
    if (stage.stackTrace.length > 0) {
      fs.writeFileSync(path.join(stageDir, 'stack.txt'), stage.stackTrace.join('\n') + '\n', 'utf-8')
    }
  }

  // 2. 合并各 stage 的日志为顶级文本文件
  const sections = (selector: (s: StageReport) => string[]) => report.stages
    .map((s) => {
      const lines = selector(s)
      if (lines.length === 0) return null
      return `=== [stage ${s.id}] ${s.title} (${s.status}) ===\n${lines.join('\n')}`
    })
    .filter((x): x is string => x !== null)
  const logsTxt = sections((s) => s.logs)
  const consoleTxt = sections((s) => s.consoleLogs)
  const debugTxt = sections((s) => s.debugLogs)
  const stackTxt = sections((s) => s.stackTrace)
  if (logsTxt.length) fs.writeFileSync(path.join(dir, 'logs.txt'), logsTxt.join('\n\n') + '\n', 'utf-8')
  if (consoleTxt.length) fs.writeFileSync(path.join(dir, 'console.txt'), consoleTxt.join('\n\n') + '\n', 'utf-8')
  if (debugTxt.length) fs.writeFileSync(path.join(dir, 'debug.txt'), debugTxt.join('\n\n') + '\n', 'utf-8')
  if (stackTxt.length) fs.writeFileSync(path.join(dir, 'stack.txt'), stackTxt.join('\n\n') + '\n', 'utf-8')

  // 3. 写入 overview.json（完整数据）
  const overview = {
    id,
    timestamp: report.timestamp,
    success: report.success,
    duration: report.duration,
    env: report.env,
    args: report.args,
    stages: report.stages.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      duration: s.duration,
      metrics: s.metrics,
      artifacts: s.artifacts.map((a) => ({ name: a.name, size: a.size, lines: a.lines })),
      logs: s.logs,
      consoleLogs: s.consoleLogs,
      debugLogs: s.debugLogs,
      stackTrace: s.stackTrace,
      error: s.error,
      assertions: s.assertions,
    })),
  }
  fs.writeFileSync(path.join(dir, 'overview.json'), JSON.stringify(overview, null, 2), 'utf-8')

  // 4. 生成子文件夹的 index.html（通过遍历目录发现文件，与测试内容解耦）
  fs.writeFileSync(path.join(dir, 'index.html'), generateRunHtml(dir, id, overview), 'utf-8')

  // 5. 更新顶级 index.html
  fs.writeFileSync(path.join(REPORT_DIR, 'index.html'), generateIndexHtml(), 'utf-8')

  // 6. 清理旧报告：默认保留最近 5 次（按目录修改时间排序）
  pruneOldReports(5)
}

/**
 * 清理旧报告，只保留最近 N 次。
 *
 * 按 REPORT_DIR 下子目录的 mtime 降序排序，删除第 N+1 之后的目录。
 * 顶级 index.html 不算作报告，跳过。
 *
 * @param keep 保留的次数（默认 5）
 */
function pruneOldReports(keep: number = 5): void {
  if (!fs.existsSync(REPORT_DIR)) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(REPORT_DIR, { withFileTypes: true })
  } catch {
    return
  }
  // 收集所有子目录及其 mtime
  const runs: { name: string; mtime: number }[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const full = path.join(REPORT_DIR, e.name)
    try {
      const st = fs.statSync(full)
      runs.push({ name: e.name, mtime: st.mtimeMs })
    } catch {
      // 跳过无法读取的目录
    }
  }
  // 按 mtime 降序排序
  runs.sort((a, b) => b.mtime - a.mtime)
  // 删除超出 keep 的目录
  const toDelete = runs.slice(keep)
  for (const r of toDelete) {
    const full = path.join(REPORT_DIR, r.name)
    try {
      fs.rmSync(full, { recursive: true, force: true })
      console.log(`[reporter] pruned old report: ${r.name}`)
    } catch (e: any) {
      console.warn(`[reporter] failed to prune ${r.name}: ${e?.message || e}`)
    }
  }
}

/** 创建报告对象（分配 id） */
export function createReport(
  timestamp: string,
  success: boolean,
  duration: number,
  stages: StageReport[],
  env: TestReport['env'],
  args: string[]
): TestReport {
  const id = makeReportId(timestamp)
  return { id, timestamp, success, duration, stages, env, args }
}

// ============================================================
// 扫描所有历史报告
// ============================================================

interface RunSummary {
  id: string
  timestamp: string
  success: boolean
  duration: number
  stages: { id: string; title: string; status: string; duration: number }[]
}

function scanRuns(): RunSummary[] {
  if (!fs.existsSync(REPORT_DIR)) return []
  const entries = fs.readdirSync(REPORT_DIR, { withFileTypes: true })
  const runs: RunSummary[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const overviewPath = path.join(REPORT_DIR, e.name, 'overview.json')
    if (!fs.existsSync(overviewPath)) continue
    try {
      const data = JSON.parse(fs.readFileSync(overviewPath, 'utf-8'))
      runs.push({
        id: data.id || e.name,
        timestamp: data.timestamp,
        success: data.success,
        duration: data.duration,
        stages: (data.stages || []).map((s: any) => ({
          id: s.id,
          title: s.title,
          status: s.status,
          duration: s.duration,
        })),
      })
    } catch {
      // 跳过损坏的 overview.json
    }
  }
  runs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
  return runs
}

// ============================================================
// 目录遍历：发现实际文件（与测试内容解耦）
// ============================================================

interface DiscoveredFile {
  /** 相对于 run dir 的路径（用于 href），如 "stages/8/tex.pas" */
  href: string
  /** 文件名 */
  name: string
  /** 字节大小 */
  size: number
}

interface DiscoveredStage {
  /** stage id（目录名） */
  id: string
  /** 该 stage 目录下的文件 */
  files: DiscoveredFile[]
}

/**
 * 遍历 stages/ 目录，发现所有 stage 子目录及其文件。
 * 报告 HTML 基于此结果生成链接，不依赖测试内容。
 */
function discoverStageFiles(runDir: string): DiscoveredStage[] {
  const stagesDir = path.join(runDir, 'stages')
  if (!fs.existsSync(stagesDir)) return []
  const result: DiscoveredStage[] = []
  const entries = fs.readdirSync(stagesDir, { withFileTypes: true })
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const stageDir = path.join(stagesDir, e.name)
    const files: DiscoveredFile[] = []
    const fileEntries = fs.readdirSync(stageDir, { withFileTypes: true })
    for (const fe of fileEntries) {
      if (!fe.isFile()) continue
      const fullPath = path.join(stageDir, fe.name)
      const stat = fs.statSync(fullPath)
      files.push({
        href: `stages/${e.name}/${fe.name}`,
        name: fe.name,
        size: stat.size,
      })
    }
    files.sort((a, b) => a.name.localeCompare(b.name))
    result.push({ id: e.name, files })
  }
  result.sort((a, b) => {
    const an = parseInt(a.id, 10)
    const bn = parseInt(b.id, 10)
    if (isNaN(an) || isNaN(bn)) return a.id.localeCompare(b.id)
    return an - bn
  })
  return result
}

/** 发现 run dir 顶级的文本文件（logs.txt 等） */
function discoverTopFiles(runDir: string): DiscoveredFile[] {
  const result: DiscoveredFile[] = []
  const entries = fs.readdirSync(runDir, { withFileTypes: true })
  for (const e of entries) {
    if (!e.isFile()) continue
    if (e.name === 'index.html') continue
    const fullPath = path.join(runDir, e.name)
    const stat = fs.statSync(fullPath)
    result.push({ href: e.name, name: e.name, size: stat.size })
  }
  result.sort((a, b) => a.name.localeCompare(b.name))
  return result
}

// ============================================================
// HTML 生成（纯原生标签，无任何样式/CSS）
// ============================================================

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtDur(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 顶级 index.html：列出所有测试结果。
 * 纯原生标签，每行只展示：时间、耗时、结果、链接。
 */
function generateIndexHtml(): string {
  const runs = scanRuns()

  const items = runs
    .map((r) => {
      const statusText = r.success ? 'SUCCESS' : 'FAILED'
      return `<li><a href="${esc(r.id)}/index.html">${esc(r.id)}</a> - ${esc(r.timestamp)} - ${statusText} - ${fmtDur(r.duration)}</li>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>E2E</title></head>
<body>
<h1>E2E</h1>
<p>${runs.length} runs</p>
<ul>
${items}
</ul>
</body>
</html>`
}

/**
 * 单次测试的 index.html（overview 页）。
 * 通过遍历 stages/ 目录发现文件生成链接，与测试内容解耦。
 * 只展示关键信息：时间、耗时、结果、产物链接。
 */
function generateRunHtml(runDir: string, runId: string, overview: any): string {
  // 顶部信息
  const header = `<h1>${esc(runId)}</h1>
<p>${esc(overview.timestamp)}</p>
<p>${overview.success ? 'SUCCESS' : 'FAILED'} - ${fmtDur(overview.duration)}</p>
<p>${esc(overview.env.node)} / ${esc(overview.env.platform)} / ${esc(overview.env.arch)}</p>
<p>Args: ${esc((overview.args || []).join(' ') || '(none)')}</p>`

  // 顶级文件链接（overview.json, logs.txt, ...）通过遍历目录发现
  const topFiles = discoverTopFiles(runDir)
  const topFileItems = topFiles
    .map((f) => `<li><a href="${esc(f.href)}">${esc(f.name)}</a> - ${fmtBytes(f.size)}</li>`)
    .join('\n')
  const topFileSection = topFiles.length > 0
    ? `<h2>Files</h2>\n<ul>\n${topFileItems}\n</ul>`
    : ''

  // stage 列表：从 overview 拿状态信息，从目录遍历拿文件链接
  const discoveredStages = discoverStageFiles(runDir)
  const stageMap = new Map<string, any>()
  for (const s of (overview.stages || [])) {
    stageMap.set(String(s.id), s)
  }

  const stageRows = discoveredStages
    .map((ds) => {
      const s = stageMap.get(ds.id)
      const status = s?.status ?? 'unknown'
      const title = s?.title ?? ''
      const duration = s?.duration ?? 0
      const error = s?.error
      const statusMark = status === 'success' ? '[ok]' : status === 'failed' ? '[X]' : '[-]'
      const errorLine = error ? ` - <code>! ${esc(String(error).slice(0, 120))}</code>` : ''
      // 文件链接（遍历目录发现，不写死）
      const fileLinks = ds.files
        .map((f) => `<a href="${esc(f.href)}">${esc(f.name)}</a>`)
        .join(' ')
      const fileList = fileLinks ? `<ul><li>${fileLinks}</li></ul>` : ''
      return `<li>${statusMark} [${esc(ds.id)}] ${esc(title)} - ${fmtDur(duration)}${errorLine}</li>${fileList}`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${esc(runId)}</title></head>
<body>
${header}
<p><a href="../index.html">Back</a></p>
${topFileSection}
<h2>Stages</h2>
<ul>
${stageRows}
</ul>
</body>
</html>`
}
