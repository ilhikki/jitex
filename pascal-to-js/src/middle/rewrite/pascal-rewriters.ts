/*
 * pascal-to-js 编译器自带的 syscall 重写表。
 *
 * 这里是编译期优化、指令展开等变换逻辑的归属点。
 * 例如：常量折叠、运算符展开、io 重定向、未来的 runtime 前缀改名等。
 *
 * 每轮调用返回新表，无共享 mutable state。
 * 初始为空表 —— 后续逐步填入具体规则。
 */

import type { SyscallRewriteTable } from './rewrite.ts'

/**
 * 构造 pascal-to-js 内置的 syscall 重写表。
 *
 * 与用户传入的 syscallRewriter 合并（用户表同 key 覆盖本表），
 * 再经 composeMapping 合成为单一映射函数，交给 rewrite() 执行。
 */
export function buildPascalRewriteTable(): SyscallRewriteTable {
  return {}
}
