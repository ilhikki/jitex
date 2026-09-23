/*
 * 运行期基础设施：debug 检查 / 函数进入钩子。
 *
 * 这些 key 由 rewrite 只在 debug 构建下产出（见 compiler 的 TransformOptions.debug）。
 */

import { rtKeys } from './keys.ts'
import type { SyscallHandler } from './runtime-type.ts'

export function basicSyscall(): Record<string, SyscallHandler> {
  // subrange 边界检查（rewrite 只在 debug 构建产出 runtime.debug.range.check）。
  // 必须回传被检查的值：rewrite 既把它当语句（赋值前的校验），也把它当表达式
  // （pred / succ 的结果包裹，ISO 6.6.6.4）。
  const debugRangeCheck: SyscallHandler = (_ctx, index, min, max) => {
    if ((index as number) < (min as number) || (index as number) > (max as number)) {
      throw new Error(`subrange value ${index} out of range ${min}..${max}`)
    }
    return index
  }

  // 循环步数限制（rewrite 只在 debug 构建产出 runtime.debug.steps.check）
  const debugStepsCheck: SyscallHandler = (ctx, _args) => {
    if (++ctx.steps > ctx.maxSteps) {
      throw new Error('step limit exceeded')
    }
    return undefined
  }

  return {
    [rtKeys.debugStepsCheck]: debugStepsCheck,
    [rtKeys.hookFunctionEnter]: () => undefined,
    [rtKeys.debugRangeCheck]: debugRangeCheck,
  }
}
