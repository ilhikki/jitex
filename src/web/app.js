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
  timeCost: document.getElementById('time-cost'),
}

function createGutter(scroller, gutter, readText) {
  const syncScroll = () => { gutter.scrollTop = scroller.scrollTop }
  scroller.addEventListener('scroll', syncScroll)

  return function refresh() {
    const lineCount = readText().split('\n').length
    const numbers = Array.from({ length: lineCount }, (_, i) => i + 1)
    gutter.textContent = numbers.join('\n') + '\n'
    syncScroll()
  }
}

function createWorkerClient(url) {
  let worker = null
  let ready = null
  let readyReject = null
  let msgId = 0
  const pending = new Map()
  let onConsole = () => {}

  const failAll = (error) => {
    for (const { reject } of pending.values()) reject(error)
    pending.clear()
  }

  const spawn = () => {
    const w = new Worker(url, { type: 'module' })
    worker = w
    ready = new Promise((resolve, reject) => {
      readyReject = reject
      w.onmessage = (e) => {
        const d = e.data
        if (d.type === 'ready') resolve()
        else if (d.type === 'console') onConsole(d.chunk)
        else if (d.type === 'done') {
          const handler = pending.get(d.id)
          if (handler) {
            pending.delete(d.id)
            handler.resolve(d.result)
          }
        }
      }
      w.onerror = (e) => {
        const err = new Error(e.message || 'worker error')
        reject(err)
        failAll(err)
        if (worker === w) { worker = null; ready = null; readyReject = null }
      }
      w.onmessageerror = () => {
        const err = new Error('worker message error')
        reject(err)
        failAll(err)
        if (worker === w) { worker = null; ready = null; readyReject = null }
      }
    })
    ready.catch(() => {})
  }

  const ensure = () => {
    if (!worker) spawn()
    return ready
  }

  const render = async (tex) => {
    await ensure()
    const id = ++msgId
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      worker.postMessage({ type: 'render', tex, id })
    })
  }

  const terminate = (reason = new Error('stopped')) => {
    if (!worker) return
    const w = worker
    const rejectReady = readyReject
    worker = null
    ready = null
    readyReject = null
    w.terminate()
   
    if (rejectReady) rejectReady(reason)
    failAll(reason)
  }

  return {
    ensure,
    render,
    terminate,
    setConsoleHandler: (fn) => { onConsole = fn },
  }
}

function createApp(dom) {
  const refreshSourceGutter = createGutter(dom.source, dom.sourceGutter, () => dom.source.value)
  const refreshConsoleGutter = createGutter(dom.consoleOutput, dom.consoleGutter, () => dom.consoleOutput.textContent)

  const workerClient = createWorkerClient(new URL('./worker.js', import.meta.url))
  workerClient.setConsoleHandler((chunk) => {
    dom.consoleOutput.textContent += chunk
    refreshConsoleGutter()
  })


  let state = 'idle'
  let runToken = 0

  const setState = (next) => {
    state = next
    dom.runButton.textContent = next === 'running' ? 'Stop' : 'Run'
  }
  setState('idle')

  
  let stopTimer = () => {}
  const startTimer = () => {
    const startTime = performance.now()
    let rafHandle = null
    const tick = () => {
      dom.timeCost.textContent = ((performance.now() - startTime) / 1000).toFixed(2) + 's'
      rafHandle = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle)
        rafHandle = null
      }
    }
  }

  const getActive = () => dom.right.dataset.active

  const updateTabs = () => {
    const { title, label, next } = TABS[getActive()]
    dom.tabTitle.textContent = title
    dom.tabButton.textContent = label
    dom.tabButton.dataset.tab = next
  }

  const setActive = (tab) => {
    dom.right.dataset.active = tab
    updateTabs()
  }

  const renderPages = (svgs) => {
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

  const appendConsole = (text) => {
    dom.consoleOutput.textContent += text
    refreshConsoleGutter()
  }

  const stop = () => {
    if (state !== 'running') return
    runToken++
    workerClient.terminate()
    stopTimer()
    appendConsole('! stopped')
    setState('idle')
  }

  const run = () => {
    if (state !== 'idle') return
    setState('running')
    const token = ++runToken

    setActive('console')
    dom.consoleOutput.textContent = ''
    dom.pages.textContent = ''
    refreshConsoleGutter()
    dom.timeCost.textContent = '0.00s'
    stopTimer = startTimer()

    ;(async () => {
      try {
        await workerClient.ensure()
        if (token !== runToken) return
        const result = await workerClient.render(dom.source.value)
        if (token !== runToken) return
        stopTimer()
        const svgs = result.status === 'completed' ? result.svgs : []
        renderPages(svgs)
        if (result.status === 'interrupted') {
          appendConsole(`! ${result.error.message}`)
        }
        setActive(svgs.length > 0 ? 'pages' : 'console')
      } catch (error) {
        if (token !== runToken) return
        stopTimer()
        const message = error instanceof Error ? error.message : String(error)
        appendConsole(`! ${message}`)
      } finally {
        if (token === runToken) setState('idle')
      }
    })()
  }

  const bindEvents = () => {
    dom.tabButton.addEventListener('click', () => setActive(dom.tabButton.dataset.tab))

    dom.source.addEventListener('input', refreshSourceGutter)
    dom.source.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        run()
      }
    })

    dom.runButton.addEventListener('click', () => {
      if (state === 'running') stop()
      else run()
    })
  }

  const start = async () => {
    try {
      await workerClient.ensure()
      const logoResult = await workerClient.render(LOGO_DOC)
      dom.logo.innerHTML = logoResult.status === 'completed' ? logoResult.svgs[0] || '' : ''
    } catch {
      dom.logo.innerHTML = ''
    }

    dom.source.value = INITIAL_TEX
    bindEvents()
    updateTabs()
    refreshSourceGutter()
    run()
  }

  return { run, start }
}

const app = createApp(dom)
app.start()