// @jitex/runtime - Pascal 编译产物的执行层（浏览器 / Deno / Node 通用，零依赖）
//
// 与 @jitex/pascal-to-js 的分工：编译器只负责 transform（源码 → ESM 源码字符串），
// runtime 只负责执行该产物。二者唯一契约是本包导出的 rtKeys。

export { createDispatcher, createRuntimeContext, toRunState } from './runtime.ts'
export type {
  ByteHost,
  PascalCell,
  PascalFile,
  PascalFileStore,
  RuntimeContext,
  RuntimeOptions,
  Syscall,
  SyscallHandler,
} from './runtime-type.ts'
export type { RunError, RunState } from './run-state.ts'
export { bytesToString, encodeUtf8, formatField, formatReal } from './runtime-util.ts'
export { createMemoryFileStore } from './sys/memory-text-file.ts'
export { rtKeys } from './keys.ts'
export { loadFactory, runJs, toErrorState } from './exec.ts'
export type { CompiledFactory } from './exec.ts'
