import type { RunReport, StageRecord } from './runner.ts'

const enc = new TextEncoder()

function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`
  }
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(2)} s`
  }
  const s = ms / 1000
  const m = Math.floor(s / 60)
  const rs = (s - m * 60).toFixed(2)
  return `${m} m ${rs} s`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface WriteReportResult {
  runDir: string
}

export async function writeReport(
  reportDir: string,
  report: RunReport,
  stageArtifacts: Map<string, Array<{ name: string; bytes: Uint8Array }>>,
): Promise<WriteReportResult> {
  const runDir = `${reportDir}/${report.id}`
  await Deno.mkdir(runDir, { recursive: true })

  await Deno.writeFile(`${runDir}/overview.json`, enc.encode(JSON.stringify(report, undefined, 2)))

  const runHeader = report.runLogs.length ? [...report.runLogs, ''] : []
  const allLogs: string[] = [...runHeader]
  const allConsole: string[] = [...runHeader]
  const allDebug: string[] = [...runHeader]
  for (const s of report.stages) {
    if (s.logs.length) {
      allLogs.push(`[${s.id}] ${s.title}`, ...s.logs, '')
    }
    if (s.consoleLogs.length) {
      allConsole.push(`[${s.id}] ${s.title}`, ...s.consoleLogs, '')
    }
    if (s.debugLogs.length) {
      allDebug.push(`[${s.id}] ${s.title}`, ...s.debugLogs, '')
    }
  }
  await Deno.writeFile(`${runDir}/logs.txt`, enc.encode(allLogs.join('\n')))
  await Deno.writeFile(`${runDir}/console.txt`, enc.encode(allConsole.join('\n')))
  await Deno.writeFile(`${runDir}/debug.txt`, enc.encode(allDebug.join('\n')))

  for (const s of report.stages) {
    const stageDir = `${runDir}/stages/${s.id}`
    await Deno.mkdir(stageDir, { recursive: true })
    await Deno.writeFile(`${stageDir}/logs.txt`, enc.encode(s.logs.join('\n')))
    const arts = stageArtifacts.get(s.id) ?? []
    for (const a of arts) {
      const safe = sanitizeFilename(a.name)
      await Deno.writeFile(`${stageDir}/${safe}`, a.bytes)
    }
  }

  await writeRunIndex(runDir, report)

  await writeTopLevelIndex(reportDir)

  return { runDir }
}

function sanitizeFilename(name: string): string {
  const s = name.replace(/\\/g, '/')
  const base = s.split('/').pop() ?? name
  if (!base || base === '.' || base === '..') {
    return '__bad_name__'
  }
  return base
}

async function writeRunIndex(runDir: string, r: RunReport): Promise<void> {
  const status = r.success ? 'SUCCESS' : 'FAIL'
  const dur = formatDuration(r.duration)
  const argsText = r.args.length ? r.args.join(' ') : '(none)'

  const files = [
    { name: 'console.txt', path: `${runDir}/console.txt` },
    { name: 'debug.txt', path: `${runDir}/debug.txt` },
    { name: 'logs.txt', path: `${runDir}/logs.txt` },
    { name: 'overview.json', path: `${runDir}/overview.json` },
  ]
  const fileLi: string[] = []
  for (const f of files) {
    let size = 0
    try {
      const stat = Deno.statSync(f.path)
      size = stat.size ?? 0
    } catch {
      size = 0
    }
    fileLi.push(`<li><a href="${escapeHtml(f.name)}">${escapeHtml(f.name)}</a> - ${formatBytes(size)}</li>`)
  }

  const stageLi: string[] = []
  for (const s of r.stages) {
    const mark = s.status === 'success' ? (s.cached ? 'cached' : 'ok') : s.status
    const head = `<li>[${mark}] [${s.id}] ${escapeHtml(s.title)} - ${formatDuration(s.duration)}</li>`
    const artifacts = s.artifacts.map((a) => {
      const safe = sanitizeFilename(a.name)
      let size = 0
      try {
        const stat = Deno.statSync(`${runDir}/stages/${s.id}/${safe}`)
        size = stat.size ?? 0
      } catch {
        size = 0
      }
      return `<a href="stages/${s.id}/${escapeHtml(safe)}">${escapeHtml(a.name)}</a> - ${formatBytes(size)}`
    })
    const children: string[] = [`<a href="stages/${s.id}/logs.txt">logs.txt</a>`, ...artifacts]
    stageLi.push(`${head}<ul><li>${children.join(' ')}</li></ul>`)
  }

  const html = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    `<head><meta charset="UTF-8"><title>${escapeHtml(r.id)}</title></head>`,
    '<body>',
    `<h1>${escapeHtml(r.id)}</h1>`,
    `<p>${escapeHtml(r.timestamp)}</p>`,
    `<p>${status} - ${dur}</p>`,
    `<p>${escapeHtml(r.env.runtime)} / ${escapeHtml(r.env.platform)} / ${escapeHtml(r.env.arch)}</p>`,
    `<p>Args: ${escapeHtml(argsText)}</p>`,
    '<p><a href="../index.html">Back</a></p>',
    '<h2>Files</h2>',
    '<ul>',
    ...fileLi,
    '</ul>',
    '<h2>Stages</h2>',
    '<ul>',
    ...stageLi,
    '</ul>',
    '</body>',
    '</html>',
    '',
  ].join('\n')

  await Deno.writeFile(`${runDir}/index.html`, enc.encode(html))
}

async function writeTopLevelIndex(reportDir: string): Promise<void> {
  const runs: Array<{ id: string; overview?: { timestamp: string; success: boolean; duration: number } }> = []
  let entries: Deno.DirEntry[] = []
  try {
    entries = Array.from(Deno.readDirSync(reportDir))
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      throw err
    }
    entries = []
  }
  for (const e of entries) {
    if (!e.isDirectory) {
      continue
    }
    if (e.name === '.cache') {
      continue
    }
    let overview: { timestamp: string; success: boolean; duration: number } | undefined
    try {
      const buf = Deno.readFileSync(`${reportDir}/${e.name}/overview.json`)
      const obj = JSON.parse(new TextDecoder().decode(buf)) as {
        timestamp?: string
        success?: boolean
        duration?: number
      }
      if (typeof obj.timestamp === 'string' && typeof obj.success === 'boolean' && typeof obj.duration === 'number') {
        overview = { timestamp: obj.timestamp, success: obj.success, duration: obj.duration }
      }
    } catch {
      // Incomplete run directory: list the name only
    }
    runs.push({ id: e.name, overview })
  }
  runs.sort((a, b) => a.id.localeCompare(b.id))

  const li = runs.map((r) => {
    const ts = r.overview?.timestamp ?? '(unknown)'
    const status = r.overview ? (r.overview.success ? 'SUCCESS' : 'FAIL') : '(no overview)'
    const dur = r.overview ? formatDuration(r.overview.duration) : ''
    return `<li><a href="${escapeHtml(r.id)}/index.html">${escapeHtml(r.id)}</a> - ${escapeHtml(ts)} - ${
      escapeHtml(status)
    }${dur ? ' - ' + dur : ''}</li>`
  })

  const html = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head><meta charset="UTF-8"><title>E2E</title></head>',
    '<body>',
    '<h1>E2E</h1>',
    `<p>${runs.length} runs</p>`,
    '<ul>',
    ...li,
    '</ul>',
    '</body>',
    '</html>',
    '',
  ].join('\n')

  await Deno.writeFile(`${reportDir}/index.html`, enc.encode(html))
}

export { writeRunIndex as _writeRunIndex, writeTopLevelIndex as _writeTopLevelIndex }

export function buildArtifactMap(
  stages: Array<{ id: string; artifacts: Array<{ name: string; bytes: Uint8Array }> }>,
): Map<string, Array<{ name: string; bytes: Uint8Array }>> {
  const m = new Map<string, Array<{ name: string; bytes: Uint8Array }>>()
  for (const s of stages) {
    if (s.artifacts.length) {
      m.set(s.id, s.artifacts.slice())
    }
  }
  return m
}

export type _StageRecord = StageRecord
