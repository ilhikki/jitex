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
import { LOGO_DOC } from './logo-tex.js'

const sourceEl = document.getElementById('source')
const gutterEl = document.getElementById('gutter')
const consoleGutterEl = document.getElementById('console-gutter')
const pagesEl = document.getElementById('pages')
const consoleEl = document.getElementById('console')
const runInfoEl = document.getElementById('run-info')
const logoEl = document.getElementById('logo')
const runButton = document.getElementById('run')

/**
 * 给一块文本配一条行号栏：内容变了重画，滚动时只跟纵向（文本不折行，横向自己滚）。
 * 两侧的字体与行高由 CSS 保证一致，行号才对得上字。
 */
function attachGutter(scroller, gutter, read) {
  let lines = 0
  const sync = () => {
    const count = read().split('\n').length
    if (count !== lines) {
      lines = count
      let text = ''
      for (let i = 1; i <= count; i++) {
        text += `${i}\n`
      }
      gutter.textContent = text
    }
    gutter.scrollTop = scroller.scrollTop
  }
  scroller.addEventListener('scroll', sync)
  return sync
}

const syncSourceGutter = attachGutter(sourceEl, gutterEl, () => sourceEl.value)
const syncConsoleGutter = attachGutter(consoleEl, consoleGutterEl, () => consoleEl.textContent)
sourceEl.addEventListener('input', syncSourceGutter)

// 装载一次：jitex.js 里的 TeX82 程序有 MB 级，装载有成本；render 才是一次运行
const engine = createTexEngine()

// 左上角那个标志不是画出来的，是**排出来的**：把 logo-tex.js 里那段渲染文档交给引擎
// 跑一遍，用它输出的 SVG。那段文档内插的就是正文用的同一个宏，所以改了定义两处一起变。
// 放大一倍也是 TeX 说的（cmr10 at 20pt，正文是 10pt），CSS 不掺和尺寸。
logoEl.innerHTML = engine.render(LOGO_DOC).svgs[0] ?? ''

let busy = false

sourceEl.value = INITIAL_TEX
syncSourceGutter()

// 一次运行的结果只报在一处：控制台标题行最右端。页头不报，Pages 标题也不报
// ——同一个数字出现在三处是没必要的。
function reportRun(text) {
  runInfoEl.textContent = text
}

function renderPages(svgs) {
  pagesEl.textContent = ''
  if (svgs.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'No pages were produced (see the console below).'
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
    lines.push(`warning: no character mapping for ${result.missingFonts.join(', ')}`)
  }
  if (result.console) {
    lines.push(result.console.replace(/\n+$/, ''))
  }
  consoleEl.textContent = lines.length > 0 ? lines.join('\n') : '(no output)'
  consoleEl.scrollTop = consoleEl.scrollHeight
  syncConsoleGutter()

  const pages = result.svgs.length
  reportRun(`${pages} ${pages === 1 ? 'page' : 'pages'} · ${ms} ms`)
}

function run() {
  if (busy) {
    return
  }
  busy = true
  runButton.disabled = true
  reportRun('running…')
  // 先让浏览器把"运行中"画出来，再进入同步执行（主线程会被 TeX 占住）
  setTimeout(() => {
    const startedAt = performance.now()
    try {
      show(engine.render(sourceEl.value, { jobName: 'job' }), Math.round(performance.now() - startedAt))
    } catch (error) {
      // 只有装载期失败才抛；运行期错误都在 result.status / result.error 里
      reportRun('load failed')
      consoleEl.textContent = `! ${error instanceof Error ? error.message : String(error)}`
      syncConsoleGutter()
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
