import { createTexEngine } from './jitex.js'

const engine = createTexEngine()

self.postMessage({ type: 'ready' })

self.onmessage = (e) => {
  if (e.data.type !== 'render') return
  const { id, tex } = e.data
  const result = engine.render(tex, {
    onConsole: (chunk) => self.postMessage({ type: 'console', chunk }),
  })
  self.postMessage({ type: 'done', id, result })
}
