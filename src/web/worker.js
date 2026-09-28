import { createTexEngine } from './jitex.js'

/*
 * 渲染 Worker：装载一次引擎复用，主线程 render 请求在此跑（同步阻塞但不阻塞主线程）。
 * 资产在 worker 内装一次；主线程 stop = terminate，下次 run 重建 worker 重装资产。
 *
 * 消息协议：
 *   主→工  { type: 'render', id, tex }
 *   工→主  { type: 'ready' }                 装载完成
 *           { type: 'console', chunk }       流式 console 输出
 *           { type: 'done', id, result }     render 结束（result: TexRenderResult）
 */
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
