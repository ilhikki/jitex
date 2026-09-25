// 官网逻辑：三面板 UI + 把 jitex 引擎跑在主线程上。
//
// 与 jitex.js 同目录（build:jitex 会把两者一起放进 dist/）：index.html 里
// `<script type="module" src="./app.js">`，这里再 import 同目录的 jitex.js。
//
// 为什么不用 Worker：官网要能直接双击打开（file://），而浏览器不允许 file:// 页面
// 构造 Worker（不透明源）。真项目应当把引擎放进 Worker——TeX 是同步执行、没有协作式
// 中断点，只能靠 terminate 停下；放哪个线程、怎么中断，是使用者适配层该决定的事。
import { createTexEngine } from './jitex.js'
import { INITIAL_TEX } from './initial-tex.js'

const sourceEl = document.getElementById('source')
const pagesEl = document.getElementById('pages')
const pagesInfoEl = document.getElementById('pages-info')
const consoleEl = document.getElementById('console')
const statusEl = document.getElementById('status')
const runButton = document.getElementById('run')

// 装载一次：jitex.js 里的 TeX82 程序有 MB 级，装载有成本；render 才是一次运行
const engine = createTexEngine()
let busy = false

sourceEl.value = INITIAL_TEX

function setStatus(text, kind = '') {
  statusEl.textContent = text
  statusEl.className = kind === '' ? 'status' : `status ${kind}`
}

function logLines(lines) {
  consoleEl.textContent = lines.join('\n')
  consoleEl.scrollTop = consoleEl.scrollHeight
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

function show(result, ms) {
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

function run() {
  if (busy) {
    return
  }
  busy = true
  runButton.disabled = true
  setStatus('运行中…', 'busy')
  // 先让浏览器把"运行中"画出来，再进入同步执行（主线程会被 TeX 占住）
  setTimeout(() => {
    const startedAt = performance.now()
    try {
      show(engine.render(sourceEl.value, { jobName: 'job' }), Math.round(performance.now() - startedAt))
    } catch (error) {
      // 只有装载期失败才抛；运行期错误都在 result.status / result.error 里
      setStatus('装载失败', 'error')
      logLines([`! ${error instanceof Error ? error.message : String(error)}`])
    } finally {
      busy = false
      runButton.disabled = false
    }
  }, 0)
}

runButton.addEventListener('click', run)
sourceEl.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    run()
  }
})

run()
