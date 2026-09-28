// TeX 运行驱动层（宿主侧）：终端、文件区约定、引擎装配。依赖 @jitex/runtime。

export { createTexEngine } from './engine.ts'
export type { TexEngine, TexEngineAssets, TexRenderOptions, TexRenderResult } from './engine.ts'
export { ConsoleFile } from './console.ts'
export { texFontKey, texFormatKey } from './files.ts'
export { texOpenKeys, texRuntimeSyscalls } from './syscalls.ts'
export type { TexRuntimeSyscallOptions } from './syscalls.ts'
