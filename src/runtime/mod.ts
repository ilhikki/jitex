// @jitex/runtime - Pascal 编译产物的执行层（浏览器 / Deno / Node 通用，零依赖）
//
// 与 @jitex/pascal-to-js 的分工：编译器只负责 transform（源码 → ESM 源码字符串），
// runtime 只负责执行该产物。二者唯一契约是本包导出的 rtKeys。
//
// 导出面 = 跨包消费面：只有被其它包（compiler / boot-tex / tests）实际引用的名字
// 才在此导出。包内部件——ctx 构造、syscall 表合成、三段式的 loadFactory /
// injectSyscalls / executeProgram / createRunner——留在各自模块里，等真有跨包
// 使用方时再导出。

export { rtKeys } from './keys.ts'
export { runJs, toErrorState } from './exec.ts'
export { createMemoryFileStore } from './sys/memory-text-file.ts'
export { encodeUtf8 } from './runtime-util.ts'
export type { ByteHost, PascalFile, PascalFileStore, SyscallHandler } from './runtime-type.ts'
export type { RunState } from './run-state.ts'
