// @jitex/runtime - Pascal 编译产物的执行层（浏览器 / Deno / Node 通用，零依赖）
//
// 与 @jitex/pascal-to-js 的分工：编译器只负责 transform（源码 → ESM 源码字符串），
// runtime 只负责执行该产物。二者唯一契约是本包导出的 rtKeys。
//
// 导出面 = 跨包消费面：只有被其它包（compiler / boot-tex / tex-runtime / tests）
// 实际引用的名字才在此导出。包内部件——三段式的 loadFactory / injectSyscalls /
// executeProgram、syscall 表合成——留在各自模块里，等真有跨包使用方时再导出。
//
// 本包不再单独产出浏览器 bundle（原 dist/runtime.js 已删）：它作为 jitex 的一部分
// 由 build:jitex 流水线内联进 jitex.js。

export { rtKeys } from './keys.ts'
export { createRunnerFromFactory, runJs, toErrorState } from './exec.ts'
export { createMemoryFileStore } from './sys/memory-text-file.ts'
export { createRuntimeContext, toRunState } from './runtime.ts'
export { bytesToString, encodeUtf8 } from './runtime-util.ts'
export type {
  ByteHost,
  PascalFile,
  PascalFileStore,
  RuntimeContext,
  RuntimeOptions,
  SyscallHandler,
} from './runtime-type.ts'
export type { RunState } from './run-state.ts'
export type { CompiledFactory, ProgramRunner } from './exec.ts'
