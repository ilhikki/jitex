import { rtKeys } from './keys.ts'
import type { SyscallHandler } from './runtime-type.ts'

export function basicSyscall(): Record<string, SyscallHandler> {
  const debugRangeCheck: SyscallHandler = (_ctx, index, min, max) => {
    if ((index as number) < (min as number) || (index as number) > (max as number)) {
      throw new Error(`subrange value ${index} out of range ${min}..${max}`)
    }
    return index
  }

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
