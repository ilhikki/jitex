// 演示页的驱动：三面板 UI + Worker 生命周期。
//
// 这里没有一行 TeX 逻辑——装载、执行、渲染都在 jitex.js 里，本文件只用它的
// 结果（svgs / console / status）。Worker 与中断方式也由这里决定，属于适配层。

const DEFAULT_SOURCE = String.raw`% 改这里，然后按 Ctrl/⌘ + Enter
\noindent Hello, \TeX!  This page is running the real \TeX82 in your browser.

\medskip
\noindent Math: $\int_0^1 x^2 \, dx = {1 \over 3}$, and
$$\sum_{n=1}^{\infty} {1 \over n^2} = {\pi^2 \over 6}.$$

\medskip
\noindent {\bf Bold}, {\it italic}, {\tt typewriter}, and a big one:
{\font\bigfont=cmr10 at 24pt \bigfont 24pt}
`

const sourceEl = document.getElementById('source')
const pagesEl = document.getElementById('pages')
const pagesInfoEl = document.getElementById('pages-info')
const consoleEl = document.getElementById('console')
const statusEl = document.getElementById('status')
const runButton = document.getElementById('run')

let worker = null
let busy = false
let nextId = 1
let pendingId = 0
let startedAt = 0

sourceEl.value = DEFAULT_SOURCE

function setStatus(text, kind = '') {
  statusEl.textContent = text
  statusEl.className = kind === '' ? 'status' : `status ${kind}`
}

function logLines(lines) {
  consoleEl.textContent = lines.join('\n')
  consoleEl.scrollTop = consoleEl.scrollHeight
}

function startWorker() {
  // type: 'module' —— jitex.js 是标准 ESM，Worker 里直接 import 即可
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = onWorkerMessage
  worker.onerror = (event) => {
    finish()
    setStatus('Worker 出错', 'error')
    logLines([`! ${event.message ?? 'unknown worker error'}`])
  }
}

function finish() {
  busy = false
  runButton.textContent = '运行 (Ctrl/⌘ + Enter)'
}

function run() {
  if (busy) {
    // 中断：TeX 同步执行停不下来，只能杀掉 Worker 再重建
    worker.terminate()
    startWorker()
    finish()
    setStatus('已停止', 'error')
    return
  }
  busy = true
  runButton.textContent = '停止'
  setStatus('运行中…', 'busy')
  startedAt = performance.now()
  pendingId = nextId++
  worker.postMessage({ id: pendingId, tex: sourceEl.value })
}

function onWorkerMessage(event) {
  const message = event.data
  if (message.id !== pendingId) {
    return
  }
  finish()
  const ms = Math.round(performance.now() - startedAt)

  if (!message.ok) {
    setStatus('装载失败', 'error')
    logLines([`! ${message.error}`])
    return
  }

  const result = message.result
  renderPages(result.svgs)

  const lines = []
  if (result.error) {
    lines.push(`! ${result.error.message}`)
    for (const line of result.error.stackTrace ?? []) {
      lines.push(`  ${line}`)
    }
  }
  if (result.missingFonts.length > 0) {
    lines.push(`warning: 没有字符映射的字体（已退化渲染）: ${result.missingFonts.join(', ')}`)
  }
  if (result.console) {
    lines.push(result.console.replace(/\n+$/, ''))
  }
  logLines(lines.length > 0 ? lines : ['（无输出）'])

  const ok = result.status === 'terminated'
  setStatus(`${result.status} · ${result.svgs.length} 页 · ${result.steps} 步 · ${ms} ms`, ok ? '' : 'error')
  pagesInfoEl.textContent = result.svgs.length > 0 ? `${result.svgs.length} 页 · ${ms} ms` : ''
}

function renderPages(svgs) {
  pagesEl.textContent = ''
  if (svgs.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = '没有页面输出（看下方控制台里的报错）'
    pagesEl.appendChild(empty)
    return
  }
  for (const svg of svgs) {
    const page = document.createElement('div')
    page.className = 'page'
    // svg 由 jitex.js 的渲染器产出，文本已经过 XML 转义
    page.innerHTML = svg
    pagesEl.appendChild(page)
  }
}

runButton.addEventListener('click', run)
sourceEl.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    run()
  }
})

startWorker()
run()
