/*
 * IL Plugin — 非标特性插件接口（AGENTS.md 原则 A.7：注入优先）。
 *
 * 设计目标：
 *   - 让非标过程/函数（如 Pascal-H 的 break/erstat）通过插件注入，
 *     而非硬编码在 compiler.ts 中。
 *   - 编译期：插件声明它处理哪些过程/函数名（小写），编译器统一生成
 *     `plugin.{pluginName}.{procName}` syscall，原样传递参数表达式。
 *   - 运行期：插件提供 syscall 实现函数，由 runtime.ts dispatch。
 *
 * 接口刻意保持简单：不解析参数类型、不做语法检查，只做名称路由。
 * 这符合 AGENTS.md #7 "注入优先" 原则——非标行为通过插件注入，
 * 默认（无插件）遇到即抛错（#6）。
 *
 * 注：`extensions: string[]` 配置项机制保留用于纯运行时行为开关
 * （如 fileEofBufferSpace），这些无法用过程注入实现。
 *
 * ISO 章节引用：插件实现的具体非标特性应在注释中引用违反的 ISO 7185 章节（#8）。
 */

import type { RuntimeContext } from './runtime'

/**
 * IL 编译器插件接口。
 *
 * 颗粒度建议：一个插件涵盖一组相关的非标特性（如 Pascal-H 全套扩展）。
 */
export interface IlPlugin {
  /** 插件名（用作 syscall 前缀，如 'pascalH' → 'plugin.pascalH.breakin'） */
  name: string

  /**
   * 该插件处理的非标过程名列表（小写，无下划线）。
   * 过程调用 `foo(args)` 会编译为 `__sys('plugin.{name}.foo', [args])`。
   * 过程不返回值。
   */
  procedures?: string[]

  /**
   * 该插件处理的非标函数名列表（小写，无下划线）。
   * 函数调用 `foo(args)` 会编译为 `__sys('plugin.{name}.foo', [args])`，
   * 结果作为表达式值使用。
   */
  functions?: string[]

  /**
   * 运行期 syscall 实现。
   * key 格式：`{pluginName}.{procName}`（如 'pascalH.breakin'）
   * runtime 会自动加上 'plugin.' 前缀查找。
   */
  syscalls?: Record<string, (ctx: RuntimeContext, args: any[]) => any>
}

/**
 * 构造 syscall key（编译期使用）。
 * 例：pluginName='pascalH', procName='breakin' → 'plugin.pascalH.breakin'
 */
export function pluginSyscallKey(pluginName: string, procName: string): string {
  return `plugin.${pluginName}.${procName}`
}

/**
 * 在插件列表中查找处理该过程名的插件。
 * 返回 [插件, 规范化名] 或 undefined。
 */
export function findProcedurePlugin(
  plugins: IlPlugin[] | undefined,
  procName: string
): { plugin: IlPlugin; name: string } | undefined {
  if (!plugins) return undefined
  const name = procName.toLowerCase()
  for (const plugin of plugins) {
    if (plugin.procedures?.includes(name)) {
      return { plugin, name }
    }
  }
  return undefined
}

/**
 * 在插件列表中查找处理该函数名的插件。
 */
export function findFunctionPlugin(
  plugins: IlPlugin[] | undefined,
  funcName: string
): { plugin: IlPlugin; name: string } | undefined {
  if (!plugins) return undefined
  const name = funcName.toLowerCase()
  for (const plugin of plugins) {
    if (plugin.functions?.includes(name)) {
      return { plugin, name }
    }
  }
  return undefined
}
