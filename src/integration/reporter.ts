import type { Artifact } from './context.ts'
import type { RunReport } from './runner.ts'

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

function sanitizeFilename(name: string): string {
  const s = name.replace(/\\/g, '/')
  const base = s.split('/').pop() ?? name
  if (!base || base === '.' || base === '..') {
    return '__bad_name__'
  }
  return base
}

export interface ReportNode {
  record: RunReport['stages'][number]
  logs: string[]
  artifacts: Artifact[]
  dir: string
}

export interface WriteReportResult {
  runDir: string
}

export async function writeReport(
  reportDir: string,
  report: RunReport,
  nodes: ReportNode[],
): Promise<WriteReportResult> {
  const runDir = `${reportDir}/${report.id}`
  await Deno.mkdir(runDir, { recursive: true })

  await Deno.writeFile(`${runDir}/run.json`, enc.encode(JSON.stringify(report, undefined, 2)))

  for (const n of nodes) {
    const dir = `${runDir}/${n.dir}`
    await Deno.mkdir(dir, { recursive: true })
    await Deno.writeFile(`${dir}/logs.txt`, enc.encode(n.logs.join('\n')))
    if (n.artifacts.length) {
      const attachDir = `${dir}/attachments`
      await Deno.mkdir(attachDir, { recursive: true })
      for (const a of n.artifacts) {
        await Deno.writeFile(`${attachDir}/${sanitizeFilename(a.name)}`, a.bytes)
      }
    }
  }

  await writeRunIndex(runDir, report, nodes)

  await writeTopLevelIndex(reportDir)

  return { runDir }
}

async function writeRunIndex(runDir: string, r: RunReport, nodes: ReportNode[]): Promise<void> {
  const status = r.success ? 'SUCCESS' : 'FAIL'
  const dur = formatDuration(r.duration)
  const argsText = r.args.length ? r.args.join(' ') : '(none)'

  const nodeLi: string[] = []
  for (const n of nodes) {
    const rec = n.record
    const mark = rec.status === 'success' ? 'ok' : rec.status
    const skip = rec.skipReason ? ` (${escapeHtml(rec.skipReason)})` : ''
    const artifacts = rec.artifacts.map((a) => {
      const safe = sanitizeFilename(a.name)
      let size = 0
      try {
        const stat = Deno.statSync(`${runDir}/${n.dir}/attachments/${safe}`)
        size = stat.size ?? 0
      } catch {
        size = 0
      }
      return `<a href="${n.dir}/attachments/${escapeHtml(safe)}">${escapeHtml(a.name)}</a> - ${formatBytes(size)}`
    })
    const children = [`<a href="${n.dir}/logs.txt">logs.txt</a>`, ...artifacts]
    nodeLi.push(
      `<li>[${mark}] [${escapeHtml(rec.id)}] ${escapeHtml(rec.name)} - ${formatDuration(rec.duration)}${skip}` +
        `<ul><li>${children.join(' ')}</li></ul></li>`,
    )
  }

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    `<head><meta charset="UTF-8"><title>${escapeHtml(r.id)}</title></head>`,
    '<body>',
    `<h1>${escapeHtml(r.id)}</h1>`,
    `<p>${escapeHtml(r.timestamp)}</p>`,
    `<p>${status} - ${dur}</p>`,
    `<p>${escapeHtml(r.env.runtime)} / ${escapeHtml(r.env.platform)} / ${escapeHtml(r.env.arch)}</p>`,
    `<p>Args: ${escapeHtml(argsText)}</p>`,
    '<p><a href="../index.html">Back</a></p>',
    '<h2>Nodes</h2>',
    '<ul>',
    ...nodeLi,
    '</ul>',
    '</body>',
    '</html>',
    '',
  ].join('\n')

  await Deno.writeFile(`${runDir}/index.html`, enc.encode(html))
}

async function writeTopLevelIndex(reportDir: string): Promise<void> {
  const runs: Array<{ id: string; summary?: { timestamp: string; success: boolean; duration: number } }> = []
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
    let summary: { timestamp: string; success: boolean; duration: number } | undefined
    try {
      const buf = Deno.readFileSync(`${reportDir}/${e.name}/run.json`)
      const obj = JSON.parse(new TextDecoder().decode(buf)) as {
        timestamp?: string
        success?: boolean
        duration?: number
      }
      if (typeof obj.timestamp === 'string' && typeof obj.success === 'boolean' && typeof obj.duration === 'number') {
        summary = { timestamp: obj.timestamp, success: obj.success, duration: obj.duration }
      }
    } catch {
      // Incomplete run directory: list the name only
    }
    runs.push({ id: e.name, summary })
  }
  runs.sort((a, b) => a.id.localeCompare(b.id))

  const li = runs.map((r) => {
    const ts = r.summary?.timestamp ?? '(unknown)'
    const status = r.summary ? (r.summary.success ? 'SUCCESS' : 'FAIL') : '(no run.json)'
    const dur = r.summary ? formatDuration(r.summary.duration) : ''
    return `<li><a href="${escapeHtml(r.id)}/index.html">${escapeHtml(r.id)}</a> - ${escapeHtml(ts)} - ${
      escapeHtml(status)
    }${dur ? ' - ' + dur : ''}</li>`
  })

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
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
