import { createTexEngine } from './jitex.js'

const LOOP_LIMIT = 1e8

const engine = createTexEngine()

self.postMessage({ type: 'ready' })

self.onmessage = (e) => {
  if (e.data.type !== 'render') return
  const { id, tex } = e.data
  const result = engine.render(tex, {
    loopLimit: LOOP_LIMIT,
    onConsole: (chunk) => self.postMessage({ type: 'console', chunk }),
  })
  self.postMessage({ type: 'done', id, result })
}
