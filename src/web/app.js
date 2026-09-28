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

function createApp(dom) {
  const syncSourceGutter = createGutterSync(dom.source, dom.sourceGutter)
  const syncConsoleGutter = createGutterSync(dom.consoleOutput, dom.consoleGutter)

  // 两态：idle（按钮 Run，可点启动）/ running（按钮 Stop，可点 terminate）
  let state = 'idle'
  // runToken：每次 run 自增，stop 也自增；让被 stop 的旧 async 在 await 醒来后能识别自己已失效
  let runToken = 0
  let worker = null
  let readyPromise = null
  let readyResolve = null
  let readyReject = null
  let msgId = 0
  const pending = new Map() // id -> { resolve, reject }
  let rafHandle = null
  let startTime = 0

  const setButton = () => {
    dom.runButton.textContent = state === 'running' ? 'Stop' : 'Run'
  }
  setButton()

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

  // 装载 Worker（若已存在直接返回 readyPromise）；resolve 后引擎已就绪
  const ensureWorker = () => {
    if (worker) return readyPromise
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    readyPromise = new Promise((resolve, reject) => {
      readyResolve = resolve
      readyReject = reject
    })
    worker.onmessage = (e) => {
      const data = e.data
      if (data.type === 'ready') {
        readyResolve?.()
      } else if (data.type === 'console') {
        dom.consoleOutput.textContent += data.chunk
        syncOutputGutter()
      } else if (data.type === 'done') {
        const handler = pending.get(data.id)
        if (handler) {
          pending.delete(data.id)
          handler.resolve(data.result)
        }
      }
    }
    return readyPromise
  }

  const renderInWorker = (tex) => {
    const id = ++msgId
    const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    worker.postMessage({ type: 'render', tex, id })
    return promise
  }

  const stopRaf = () => {
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle)
      rafHandle = null
    }
  }

  // time-cost 动画：每帧写 (now-start)/1000，保留 2 位小数 + 's'
  const startTimer = () => {
    startTime = performance.now()
    const tick = () => {
      dom.timeCost.textContent = ((performance.now() - startTime) / 1000).toFixed(2) + 's'
      rafHandle = requestAnimationFrame(tick)
    }
    tick()
  }

  // 硬停止：terminate worker + reject 所有 pending；下次 run 重建
  const stop = () => {
    if (state !== 'running') return
    runToken++
    if (worker) {
      worker.terminate()
      worker = null
      readyReject?.(new Error('stopped'))
      readyResolve = null
      readyReject = null
      readyPromise = null
      for (const { reject } of pending.values()) {
        reject(new Error('stopped'))
      }
      pending.clear()
    }
    stopRaf()
    dom.consoleOutput.textContent += '! stopped'
    syncOutputGutter()
    state = 'idle'
    setButton()
  }

  const run = () => {
    if (state !== 'idle') return
    state = 'running'
    setButton()
    const token = ++runToken

    const previous = getActive()
    setActive('console')
    dom.consoleOutput.textContent = ''
    dom.pages.textContent = ''
    syncOutputGutter()
    dom.timeCost.textContent = '0.00s'
    startTimer()

    ;(async () => {
      try {
        await ensureWorker()
        if (token !== runToken) return
        const result = await renderInWorker(dom.source.value)
        if (token !== runToken) return
        stopRaf()
        renderPages(result.status === 'completed' ? result.svgs : [])
        if (result.status === 'interrupted') {
          dom.consoleOutput.textContent += `! ${result.error.message}`
          syncOutputGutter()
        }
        setActive(previous)
      } catch (error) {
        if (token !== runToken) return
        stopRaf()
        const message = error instanceof Error ? error.message : String(error)
        dom.consoleOutput.textContent += `! ${message}`
        syncOutputGutter()
      } finally {
        if (token === runToken) {
          state = 'idle'
          setButton()
        }
      }
    })()
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

    dom.runButton.addEventListener('click', () => {
      if (state === 'running') stop()
      else run()
    })
  }

  const start = async () => {
    await ensureWorker()
    const logoResult = await renderInWorker(LOGO_DOC)
    dom.logo.innerHTML = logoResult.status === 'completed' ? logoResult.svgs[0] || '' : ''

    dom.source.value = INITIAL_TEX

    bindEvents()
    updateTabs()
    syncEditorGutter()
    run()
  }

  return { run, start }
}

const app = createApp(dom)
app.start()
