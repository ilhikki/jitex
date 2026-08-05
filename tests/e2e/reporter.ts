/**
 * E2E 测试报告生成器。
 *
 * 报告目录结构（位于项目根目录 `reports/`）：
 *   reports/
 *     index.html                  顶级导航（可提交到 git）
 *     {timestamp-id}/             每次测试一个文件夹
 *       overview.json             测试概览 + 中间文件清单
 *       index.html                本次测试详情页
 *       tangle-official.pas       中间文件
 *       tangle.js
 *       ...
 *
 * 设计原则：
 *   - HTML 极简：只用 div/span/h1-h6/p，分栏用 inline style 的 flex
 *   - metrics key 使用普通 JS 变量名（非中文、非用户可见英语）
 *   - 保留所有历史测试文件夹，顶级 index.html 列出全部
 *   - 对比：选两个测试，左右 iframe 分栏显示
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
  /** 文件内容（运行时写入磁盘） */
  content: string
  /** 字节大小 */
  size: number
  /** 行数 */
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
  metrics: Record<string, string | number>
  artifacts: StageArtifact[]
  logs: string[]
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
  // 序号：同秒内递增
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
 * 写入报告：创建子文件夹，保存中间文件，生成 HTML。
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

  // 1. 保存中间文件
  for (const stage of report.stages) {
    for (const art of stage.artifacts) {
      if (art.content) {
        fs.writeFileSync(path.join(dir, art.name), art.content, 'utf-8')
      }
    }
  }

  // 2. 写入 overview.json（不包含 content 以减小体积）
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
      error: s.error,
      assertions: s.assertions,
    })),
  }
  fs.writeFileSync(path.join(dir, 'overview.json'), JSON.stringify(overview, null, 2), 'utf-8')

  // 3. 生成子文件夹的 index.html（本次测试详情）
  fs.writeFileSync(path.join(dir, 'index.html'), generateRunHtml(overview, id), 'utf-8')

  // 4. 更新顶级 index.html
  fs.writeFileSync(path.join(REPORT_DIR, 'index.html'), generateIndexHtml(), 'utf-8')
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
  // 按时间戳降序（最新在前）
  runs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
  return runs
}

// ============================================================
// HTML 生成（极简：div/span/h/p，flex 用 inline style）
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
 * 顶级 index.html：列出所有测试结果，支持选两个对比。
 * 极简：只用 div/span/h/p，flex 用 inline style。
 */
function generateIndexHtml(): string {
  const runs = scanRuns()
  const runsJson = JSON.stringify(runs)

  const listItems = runs
    .map((r) => {
      const statusText = r.success ? 'SUCCESS' : 'FAILED'
      const stageSummary = r.stages
        .map((s) => {
          const ch = s.status === 'success' ? 'ok' : s.status === 'failed' ? 'X' : '-'
          return `<span> ${esc(s.id)}:${ch}</span>`
        })
        .join('')
      return `<div>
        <span onclick="nav('${esc(r.id)}')" style="cursor:pointer">${esc(r.id)}</span>
        <span onclick="toggle('${esc(r.id)}')" style="cursor:pointer"> [选]</span>
        <span> ${esc(r.timestamp)}</span>
        <span> ${statusText}</span>
        <span> ${fmtDur(r.duration)}</span>
        <div>${stageSummary}</div>
      </div>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>E2E</title></head>
<body>
<h1>E2E 测试报告</h1>
<p>共 ${runs.length} 次测试。点击 ID 进入详情，点击 [选] 选择两个对比。</p>
<div id="list">${listItems}</div>
<div id="cmp" style="display:none">
  <h2>对比</h2>
  <div style="display:flex">
    <div id="cmpL" style="flex:1"></div>
    <div id="cmpR" style="flex:1"></div>
  </div>
</div>
<script>
var runs = ${runsJson};
var sel = [];
function nav(id) { location.href = id + '/index.html'; }
function toggle(id) {
  var i = sel.indexOf(id);
  if (i >= 0) { sel.splice(i, 1); }
  else { sel.push(id); if (sel.length > 2) sel.shift(); }
  showCmp();
}
function renderRun(id) {
  var r = runs.find(function(x) { return x.id === id; });
  if (!r) return '<p>not found</p>';
  var h = '<h3>' + r.id + '</h3>';
  h += '<p>' + r.timestamp + ' ' + (r.success ? 'SUCCESS' : 'FAILED') + ' ' + r.duration + 'ms</p>';
  r.stages.forEach(function(s) {
    h += '<div><span>[' + s.id + ']</span> <span>' + s.title + '</span> <span>' + s.status + '</span></div>';
  });
  return h;
}
function showCmp() {
  var el = document.getElementById('cmp');
  if (sel.length === 2) {
    el.style.display = 'block';
    document.getElementById('cmpL').innerHTML = renderRun(sel[0]);
    document.getElementById('cmpR').innerHTML = renderRun(sel[1]);
  } else {
    el.style.display = 'none';
  }
}
</script>
</body>
</html>`
}

/**
 * 单次测试的 index.html：显示详情，链接到中间文件。
 * 极简：只用 div/span/h/p，flex 用 inline style。
 */
function generateRunHtml(overview: any, runId: string): string {
  const meta = `<div>
    <p>时间: ${esc(overview.timestamp)}</p>
    <p>结果: ${overview.success ? 'SUCCESS' : 'FAILED'}</p>
    <p>耗时: ${fmtDur(overview.duration)}</p>
    <p>环境: ${esc(overview.env.node)} / ${esc(overview.env.platform)} / ${esc(overview.env.arch)}</p>
    <p>参数: ${esc((overview.args || []).join(' ') || '(无)')}</p>
    <p onclick="location.href='../index.html'" style="cursor:pointer">返回列表</p>
  </div>`

  const stages = (overview.stages || [])
    .map((s: any) => {
      const metrics = Object.entries(s.metrics || {})
        .map(([k, v]) => `<span> ${esc(k)}: ${esc(String(v))}</span>`)
        .join('')
      const artifacts = (s.artifacts || [])
        .map((a: any) => `<span onclick="location.href='${esc(a.name)}'" style="cursor:pointer"> ${esc(a.name)}</span>`)
        .join('')
      const assertions = (s.assertions || [])
        .map((a: any) => {
          const ch = a.passed ? 'ok' : 'X'
          return `<div><span>${ch}</span> <span>${esc(a.name)}</span>${a.expected ? ' <span>exp: ' + esc(a.expected) + '</span>' : ''}${a.actual ? ' <span>act: ' + esc(a.actual) + '</span>' : ''}</div>`
        })
        .join('')
      const logs = (s.logs || [])
        .map((l: string) => `<div>${esc(l)}</div>`)
        .join('')
      return `<div>
        <h3>[${esc(s.id)}] ${esc(s.title)}</h3>
        <p>${esc(s.status)} ${fmtDur(s.duration)}</p>
        ${metrics ? `<p>${metrics}</p>` : ''}
        ${artifacts ? `<p>文件:${artifacts}</p>` : ''}
        ${s.error ? `<p>${esc(s.error)}</p>` : ''}
        ${assertions ? `<div>${assertions}</div>` : ''}
        ${logs ? `<div>${logs}</div>` : ''}
      </div>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${esc(runId)}</title></head>
<body>
<h1>${esc(runId)}</h1>
${meta}
<h2>阶段</h2>
${stages}
</body>
</html>`
}
