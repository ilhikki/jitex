import { createTexEngine } from './jitex.js'
import { INITIAL_TEX } from './initial-tex.js'
import { LOGO_DOC } from './logo-tex.js'

const sourceEl = document.getElementById('source')
const logoEl = document.getElementById('logo')
const runButton = document.getElementById('run')
const pagesEl = document.querySelector('#pages-area .pages')
const consoleEl = document.getElementById('console')
const rightEl = document.querySelector('.right')

const engine = createTexEngine()

const logoResult = engine.render(LOGO_DOC)
logoEl.innerHTML = logoResult.ok ? (logoResult.svgs[0] ?? '') : ''

sourceEl.value = INITIAL_TEX

function setActive(tab) {
  rightEl.dataset.active = tab
}

function getActive() {
  return rightEl.dataset.active
}

document.querySelectorAll('.tab-bar button').forEach((btn) => {
  btn.addEventListener('click', () => setActive(btn.dataset.tab))
})

function renderPages(svgs) {
  pagesEl.textContent = ''
  for (const svg of svgs) {
    const page = document.createElement('div')
    page.className = 'page'
    page.innerHTML = svg
    pagesEl.appendChild(page)
  }
}

function show(result) {
  if (result.ok) {
    renderPages(result.svgs)
  } else {
    pagesEl.textContent = ''
  }

  const lines = []
  if (!result.ok) {
    lines.push(`! ${result.error.message}`)
  }
  if (result.console) {
    lines.push(result.console.replace(/\n+$/, ''))
  }
  consoleEl.textContent = lines.length > 0 ? lines.join('\n') : '(no output)'
}

let busy = false

function run() {
  if (busy) return
  busy = true
  runButton.disabled = true

  const previous = getActive()
  setActive('console')

  setTimeout(() => {
    try {
      show(engine.render(sourceEl.value))
    } catch (error) {
      consoleEl.textContent = `! ${error instanceof Error ? error.message : String(error)}`
    } finally {
      setActive(previous)
      busy = false
      runButton.disabled = false
    }
  }, 0)
}

runButton.addEventListener('click', run)

sourceEl.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || event.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    run()
  }
})

run()
