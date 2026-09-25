// 适配层：把 jitex.js 放进 Worker。
//
// 线程模型是使用者的事——库只提供"环境无关的引擎"，谁来驱动它、放在哪个线程、
// 怎么中断，都由这里决定：
//   - 引擎只装载一次（jitex.js 里内联的 TeX82 程序约 1.5MB，装载有成本）；
//   - 每次运行只调 render，引擎内部自造运行期状态，互不污染；
//   - TeX 是同步执行、没有协作式中断点，所以"停止"只能 terminate 掉整个 Worker
//     再由页面重建（见 app.js）。
import { createTexEngine } from './jitex.js'

const engine = createTexEngine()

self.onmessage = (event) => {
  const { id, tex } = event.data
  try {
    const result = engine.render(tex, { jobName: 'job' })
    self.postMessage({
      id,
      ok: true,
      result: {
        svgs: result.svgs,
        console: result.console,
        log: result.log,
        status: result.status,
        steps: result.steps,
        error: result.error,
        missingFonts: result.missingFonts,
      },
    })
  } catch (error) {
    // 装载期失败（资产/程序）才会走到这里；运行期错误都在 result.status 里
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
