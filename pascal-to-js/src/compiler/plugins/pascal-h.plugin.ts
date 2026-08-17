/*
 * Pascal-H 插件 — Knuth 在 WEB/TeX 系统中使用的 Pascal 方言扩展。
 *
 * 违反 ISO 7185 章节（AGENTS.md 原则 A.8）：
 *   - break / break_in / breakin：非标过程，ISO 7185 6.9.8.2 未列出
 *     （标准过程只有 reset/rewrite/get/put/read/readln/write/writeln/page/new/dispose/pack/unpack）
 *   - erstat：非标函数，ISO 7185 6.9.8.2 未列出
 *
 * 行为说明：
 *   - break / break_in / breakin：清除终端输入缓冲区。模拟环境为空操作。
 *     TANGLE 会去除标识符下划线并将字母大写，故 break_in → BREAKIN → breakin。
 *   - erstat(f)：返回最近一次 reset/rewrite 的 I/O 错误状态（0=成功，非 0=失败）。
 *     TeX 用 erstat(f)=0 判断文件是否成功打开。
 *
 * 启用方式（AGENTS.md 原则 A.7 注入优先）：
 *   transform(source, { plugins: [pascalHPlugin] })
 *
 * 反测试（AGENTS.md 原则 A.9）：默认配置下（未启用插件），
 * 编译 break/break_in/breakin/erstat 应抛 "unknown procedure/function" 错误。
 */

import type { IlPlugin } from '../plugin.ts'
import type { RuntimeContext } from '@/runtime/runtime-type.ts'
import type { PascalFile } from '@/runtime/file-model.ts'

/**
 * 文件错误状态记录（按 PascalFile 引用）。
 * resetFile/rewriteFile 在 runtime.ts 中是私有的，无法直接修改，
 * 故插件自行维护错误状态表。
 *
 * reset(f, name, '/O') 后：若 ctx.files 中无 name → error=1，否则 error=0
 * rewrite(f, name, '/O') 后：通常 error=0
 */
const fileErrors = new WeakMap<PascalFile, number>()

/**
 * 在 reset/rewrite 后调用，记录文件错误状态。
 * 由插件 syscall 包装调用（见下文 pascalH.breakin 等）。
 */
function setFileError(file: PascalFile, error: number): void {
  fileErrors.set(file, error)
}

function getFileError(file: PascalFile | undefined): number {
  if (!file) {
    return 0
  }
  return fileErrors.get(file) ?? 0
}

/**
 * Pascal-H 插件。
 *
 * 颗粒度：涵盖 Knuth WEB 系统用到的所有非标过程/函数。
 * 未来如需更多 Pascal-H 特性（如 clock、memavail），可继续在此插件中添加。
 */
export const pascalHPlugin: IlPlugin = {
  name: 'pascalH',

  // 非标过程（ISO 7185 6.9.8.2 未列出）
  procedures: ['break', 'break_in', 'breakin', 'close'],

  // 非标函数（ISO 7185 6.9.8.2 未列出）
  functions: ['erstat'],

  syscalls: {
    /**
     * break / break_in / breakin：清除终端输入缓冲区。
     * 模拟环境为空操作（无真实终端）。
     */
    break: (_ctx: RuntimeContext, _args: unknown[]) => undefined,
    break_in: (_ctx: RuntimeContext, _args: unknown[]) => undefined,
    breakin: (_ctx: RuntimeContext, _args: unknown[]) => undefined,
    close: () => undefined,
    /**
     * erstat(f)：返回文件 f 最近一次 reset/rewrite 的错误状态。
     *
     * Pascal-H 语义：reset(f, name) 后若文件不存在，erstat 返回非 0。
     * TeX 的 BOPENIN/AOPENIN/WOPENIN 用 erstat(f)=0 判断文件是否成功打开。
     *
     * 实现方式：检查 ctx.files 中是否存在 file.url。
     * - rewrite 后文件一定存在（rewriteFile 会创建空文件），故 erstat=0
     * - reset 后若文件不存在，erstat 返回 1
     * - TTY 等特殊文件总是成功
     */
    erstat: (ctx: RuntimeContext, args: unknown[]) => {
      const file = args[0] as PascalFile
      if (!file) {
        return 0
      }
      // TTY 等特殊文件总是成功
      if (file.url === 'TTY:' || file.url === '') {
        return 0
      }
      // 检查文件是否存在
      return ctx.files.has(file.url) ? 0 : 1
    },
  },
}

// 导出文件错误状态辅助函数（供 runtime 或测试使用）
export { getFileError, setFileError }
