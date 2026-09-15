/*
 * 阶段1（算术 / 逻辑 / 比较 / 转换 / 指针）rewrite 产出的 runtime syscall handler。
 *
 * 这些 handler 的语义原先是 codegen 里 inline 生成的 JS 表达式
 * （见 pascal-semantic-compiler.ts 的 syscallToJs）。阶段1 重构后不再 inline，
 * 统一走 dispatcher 调用本文件的 handler；后续优化阶段再考虑重新 inline。
 */

import { rtKeys } from '@/middle/rewrite/runtime-keys.ts'
import type { PascalCell, SyscallHandler } from '../runtime-type.ts'

export function arithSyscalls(): Record<string, SyscallHandler> {
  return {
    [rtKeys.int32Add]: (_ctx, a, b) => ((a as number) + (b as number)) | 0,
    [rtKeys.int32Subtract]: (_ctx, a, b) => ((a as number) - (b as number)) | 0,
    [rtKeys.int32Multiply]: (_ctx, a, b) => ((a as number) * (b as number)) | 0,
    [rtKeys.int32Divide]: (_ctx, a, b) => {
      const d = b as number
      if (d === 0) {
        throw new Error('JS VM: division by zero')
      }
      return Math.trunc((a as number) / d) | 0
    },
    [rtKeys.int32Modulo]: (_ctx, a, b) => {
      const m = b as number
      // ISO 7185 6.7.2.2: i mod j 在 j 为 0 或负数时为 error
      if (m <= 0) {
        throw new Error(`JS VM: i mod j requires j > 0 (ISO 7185 6.7.2.2), got ${m}`)
      }
      const l = a as number
      // ISO 7185 6.7.2.2: i mod j = i - k*j，其中 k 使 0 <= i mod j < j（floor 语义）
      return (l - Math.floor(l / m) * m) | 0
    },
    [rtKeys.int32Negate]: (_ctx, a) => -(a as number) | 0,
    [rtKeys.int32And]: (_ctx, a, b) => ((a as number) & (b as number)) | 0,
    [rtKeys.int32Or]: (_ctx, a, b) => ((a as number) | (b as number)) | 0,
    [rtKeys.int32Not]: (_ctx, a) => ~(a as number) | 0,
    [rtKeys.int32Absolute]: (_ctx, a) => Math.abs(a as number) | 0,
    [rtKeys.int32Odd]: (_ctx, a) => (((a as number) % 2) !== 0 ? 1 : 0),

    [rtKeys.float32Add]: (_ctx, a, b) => Math.fround((a as number) + (b as number)),
    [rtKeys.float32Subtract]: (_ctx, a, b) => Math.fround((a as number) - (b as number)),
    [rtKeys.float32Multiply]: (_ctx, a, b) => Math.fround((a as number) * (b as number)),
    [rtKeys.float32Divide]: (_ctx, a, b) => Math.fround((a as number) / (b as number)),
    [rtKeys.float32Negate]: (_ctx, a) => Math.fround(-(a as number)),
    [rtKeys.float32Absolute]: (_ctx, a) => Math.fround(Math.abs(a as number)),
    [rtKeys.float32SquareRoot]: (_ctx, a) => {
      const x = a as number
      // ISO 7185 6.6.6.2: "It shall be an error if such a value does not exist"
      if (!(x >= 0)) {
        throw new Error('sqrt: domain error (x < 0)')
      }
      return Math.sqrt(x)
    },
    [rtKeys.float32Sine]: (_ctx, a) => Math.sin(a as number),
    [rtKeys.float32Cosine]: (_ctx, a) => Math.cos(a as number),
    [rtKeys.float32Exponential]: (_ctx, a) => Math.exp(a as number),
    [rtKeys.float32Logarithm]: (_ctx, a) => {
      const x = a as number
      // ISO 7185 6.6.6.2: "It shall be an error if such a value does not exist"
      if (!(x > 0)) {
        throw new Error('ln: domain error (x <= 0)')
      }
      return Math.log(x)
    },
    [rtKeys.float32Arctangent]: (_ctx, a) => Math.atan(a as number),

    // and / or 用 && / ||：对 0/1 输入结果仍是 0/1，且保短路
    [rtKeys.booleanAnd]: (_ctx, a, b) => (a as number) && (b as number),
    [rtKeys.booleanOr]: (_ctx, a, b) => (a as number) || (b as number),
    [rtKeys.booleanNot]: (_ctx, a) => ((a as number) ? 0 : 1),

    [rtKeys.compareEqual]: (_ctx, a, b) => (a === b ? 1 : 0),
    [rtKeys.compareNotEqual]: (_ctx, a, b) => (a !== b ? 1 : 0),
    [rtKeys.compareLess]: (_ctx, a, b) => ((a as number) < (b as number) ? 1 : 0),
    [rtKeys.compareLessOrEqual]: (_ctx, a, b) => ((a as number) <= (b as number) ? 1 : 0),
    [rtKeys.compareGreater]: (_ctx, a, b) => ((a as number) > (b as number) ? 1 : 0),
    [rtKeys.compareGreaterOrEqual]: (_ctx, a, b) => ((a as number) >= (b as number) ? 1 : 0),

    [rtKeys.castFloat32ToInt32]: (_ctx, a) => Math.trunc(a as number),
    // ISO 7185 6.6.6.3: round(x) = trunc(x+0.5) if x>=0, trunc(x-0.5) if x<0
    // （JS Math.round 对 -3.5 返回 -3，不符合 ISO 的 -4）
    [rtKeys.castFloat32ToInt32Round]: (_ctx, a) => {
      const x = a as number
      return Math.trunc(x >= 0 ? x + 0.5 : x - 0.5) | 0
    },
    [rtKeys.castCharToInt32]: (_ctx, a) => typeof a === 'string' ? a.charCodeAt(0) : (a as number),
    [rtKeys.castBooleanToInt32]: (_ctx, a) => (a ? 1 : 0),
    [rtKeys.castInt32ToChar]: (_ctx, a) => String.fromCharCode(a as number),

    // ISO 7185 6.5.4: 指针解引用 p^ — nil 解引用是 error (6.4.4)
    [rtKeys.pointerDereference]: (_ctx, p) => {
      if (p === undefined) {
        throw new Error('dereference of nil pointer (ISO 7185 6.4.4)')
      }
      return (p as PascalCell).value
    },
    [rtKeys.pointerAssign]: (_ctx, p, v) => {
      if (p === undefined) {
        throw new Error('dereference of nil pointer (ISO 7185 6.4.4)')
      }
      ;(p as PascalCell).value = v
      return undefined
    },
    // dispose(p) 前置检查：p 为 nil 是 error (ISO 7185 6.6.5.3)
    [rtKeys.pointerDisposeCheck]: (_ctx, p) => {
      if (p === undefined) {
        throw new Error('dispose of nil-value (ISO 7185 6.6.5.3)')
      }
      return undefined
    },
  }
}
