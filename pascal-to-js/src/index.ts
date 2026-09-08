export { createOffsetToPosition, lex, tokenize } from '@/parsing/lexer/lexer.ts'
export type { LexerInput } from '@/parsing/types.ts'
export type { Position, Token } from '@/parsing/token.ts'

// ==========================================================================
// AST
// ==========================================================================

export type * from '@/parsing/types.ts'
export { nodeToCode } from '@/parsing/printer/printer.ts'

// ==========================================================================
// 编译与执行（IL 管线）
// ==========================================================================

export { executeCompiled, run, runJs, transform } from './compiler/transform.ts'
export type { RunOptions, TransformOptions } from './compiler/transform.ts'
export type { RunError, RunState } from './runtime/run-state.ts'
export type { ExtraCallable } from './compiler/analysis.ts'
export type * from './runtime/runtime-type.ts'
export * from './runtime/runtime-util.ts'
export { MemoryTextFile } from './runtime/sys/memory-text-file.ts'
export { MemoryRecordFile } from './runtime/sys/memory-record-file.ts'
