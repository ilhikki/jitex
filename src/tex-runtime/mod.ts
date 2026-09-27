// @jitex/tex-runtime —— TeX 侧运行时，两层各自成面：
//
//   render/ 纯渲染：DVI → SVG + plain 的字体/编码映射。零依赖、无宿主假设，
//           谁只要"把 DVI 画出来"就用它。
//   tex/    TeX 运行驱动：终端（TTY）、文件区约定、引擎装配。依赖 @jitex/runtime，
//           用来真正跑一个 TeX82 程序。
//
// 两层各自成面：把"运行一个程序"混进"纯渲染"的入口，会让只要渲染的人顺手拿到
// 宿主驱动。
//
// 公共面只出现纯数据：不导出 DviConfig / PascalFileStore / RuntimeContext 这类可被
// 当成契约使用的对象图。

export { UnmappedFontError } from './render/mod.ts'
export {
  ConsoleFile,
  createTexEngine,
  TexError,
  texFontKey,
  texFormatKey,
  texOpenKeys,
  texRuntimeSyscalls,
} from './tex/mod.ts'
export type { TexEngine, TexEngineAssets, TexRenderOptions, TexRenderResult } from './tex/mod.ts'
