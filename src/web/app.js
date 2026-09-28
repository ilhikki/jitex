import { createTexEngine } from './jitex.js'
import { INITIAL_TEX } from './initial-tex.js'
import { LOGO_DOC } from './logo-tex.js'

const TABS = {
  pages: { title: 'Pages', label: 'Console', next: 'console' },
  console: { title: 'Console', label: 'Pages', next: 'pages' },
}

const dom = {
  logo: document.querySelector('.logo'),
  source: document.getElementById('source'),
  runButton: document.querySelector('.run-btn'),
  pages: document.querySelector('.pages'),
  consoleOutput: document.getElementById('console'),
  right: document.getElementById('right'),
  sourceGutter: document.querySelector('.source-panel .gutter'),
  consoleGutter: document.querySelector('#console-area .gutter'),
  tabTitle: document.getElementById('tab-title'),
  tabButton: document.getElementById('tab-button'),
}

/* 一行号栏的同步器：把「滚动容器 + 行号栏」封成一个闭包，
   之后再喂给它任意一个「读取文本」的函数即可。 */
function createGutterSync(scroller, gutter) {
  return function sync(readText) {
    const lineCount = readText().split('\n').length
    const numbers = Array.from({ length: lineCount }, (_, index) => index + 1)
    gutter.textContent = numbers.join('\n') + '\n'
    gutter.scrollTop = scroller.scrollTop
  }
}

function createApp(dom, engine) {
  const syncSourceGutter = createGutterSync(dom.source, dom.sourceGutter)
  const syncConsoleGutter = createGutterSync(dom.consoleOutput, dom.consoleGutter)

  let busy = false

  const getActive = () => dom.right.dataset.active

  const updateTabs = () => {
    const { title, label, next } = TABS[getActive()]
    dom.tabTitle.textContent = title
    dom.tabButton.textContent = label
    dom.tabButton.dataset.tab = next
  }

  const setActive = tab => {
    dom.right.dataset.active = tab
    updateTabs()
  }

  const syncEditorGutter = () => syncSourceGutter(() => dom.source.value)

  const syncOutputGutter = () => syncConsoleGutter(() => dom.consoleOutput.textContent)

  const renderPages = svgs => {
    const fragment = document.createDocumentFragment()
    for (const svg of svgs) {
      const page = document.createElement('div')
      page.className = 'page'
      page.innerHTML = svg
      fragment.appendChild(page)
    }
    dom.pages.textContent = ''
    dom.pages.appendChild(fragment)
  }

  const show = result => {
    renderPages(result.ok ? result.svgs : [])

    const lines = []
    if (!result.ok) {
      lines.push(`! ${result.error.message}`)
    }
    if (result.console) {
      lines.push(result.console.replace(/\n+$/, ''))
    }
    dom.consoleOutput.textContent = lines.length > 0 ? lines.join('\n') : '(no output)'
    syncOutputGutter()
  }

  const run = () => {
    if (busy) return
    busy = true
    dom.runButton.disabled = true

    const previous = getActive()
    setActive('console')

    setTimeout(() => {
      try {
        show(engine.render(dom.source.value))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        dom.consoleOutput.textContent = `! ${message}`
      } finally {
        setActive(previous)
        busy = false
        dom.runButton.disabled = false
      }
    }, 0)
  }

  const bindEvents = () => {
    dom.tabButton.addEventListener('click', () => setActive(dom.tabButton.dataset.tab))

    dom.source.addEventListener('input', syncEditorGutter)
    dom.source.addEventListener('scroll', syncEditorGutter)
    dom.source.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        run()
      }
    })

    dom.runButton.addEventListener('click', run)
  }

  const start = () => {
    const logoResult = engine.render(LOGO_DOC)
    dom.logo.innerHTML = logoResult.ok ? logoResult.svgs[0] || '' : ''

    dom.source.value = INITIAL_TEX

    bindEvents()
    updateTabs()
    syncEditorGutter()
    run()
  }

  return { run, start }
}

const app = createApp(dom, createTexEngine())
app.start()