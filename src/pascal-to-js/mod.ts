// 对外导出 = 跨包消费面：只有被其它项目（boot-tex / tests）实际引用的名字才在此导出。
// 包内部件（lex / parseProgram / AST 节点类型 / syscallKeys / TransformOptions 等）留在
// 各自模块里，包内文件经 `@/` 别名直接引用，不走本入口。

export { parse, transform } from '@/run.ts'
export { nodeToCode } from '@/frontend/printer/printer.ts'
export type { ExtraCallable } from '@/middle/analysis/analysis-type.ts'
export type { SyscallRewriteTable } from '@/middle/rewrite/rewrite.ts'
