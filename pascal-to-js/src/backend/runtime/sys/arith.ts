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
    // ---------- i32 ----------
    [rtKeys.i32Add]: (_ctx, [a, b]) => ((a as number) + (b as number)) | 0,
    [rtKeys.i32Sub]: (_ctx, [a, b]) => ((a as number) - (b as number)) | 0,
    [rtKeys.i32Mul]: (_ctx, [a, b]) => ((a as number) * (b as number)) | 0,
    [rtKeys.i32Div]: (_ctx, [a, b]) => {
      const d = b as number
      if (d === 0) {
        throw new Error('JS VM: division by zero')
      }
      return Math.trunc((a as number) / d) | 0
    },
    [rtKeys.i32Mod]: (_ctx, [a, b]) => {
      const m = b as number
      if (m === 0) {
        throw new Error('JS VM: division by zero')
      }
      const l = a as number
      return (l - Math.trunc(l / m) * m) | 0
    },
    [rtKeys.i32Neg]: (_ctx, [a]) => -(a as number) | 0,
    [rtKeys.i32And]: (_ctx, [a, b]) => ((a as number) & (b as number)) | 0,
    [rtKeys.i32Or]: (_ctx, [a, b]) => ((a as number) | (b as number)) | 0,
    [rtKeys.i32Not]: (_ctx, [a]) => ~(a as number) | 0,
    [rtKeys.i32Abs]: (_ctx, [a]) => Math.abs(a as number) | 0,
    [rtKeys.i32Odd]: (_ctx, [a]) => ((a as number) % 2) !== 0,

    // ---------- f32 ----------
    [rtKeys.f32Add]: (_ctx, [a, b]) => Math.fround((a as number) + (b as number)),
    [rtKeys.f32Sub]: (_ctx, [a, b]) => Math.fround((a as number) - (b as number)),
    [rtKeys.f32Mul]: (_ctx, [a, b]) => Math.fround((a as number) * (b as number)),
    [rtKeys.f32Div]: (_ctx, [a, b]) => Math.fround((a as number) / (b as number)),
    [rtKeys.f32Neg]: (_ctx, [a]) => Math.fround(-(a as number)),
    [rtKeys.f32Abs]: (_ctx, [a]) => Math.fround(Math.abs(a as number)),
    [rtKeys.f32Sqrt]: (_ctx, [a]) => {
      const x = a as number
      // ISO 7185 6.6.6.2: "It shall be an error if such a value does not exist"
      if (!(x >= 0)) {
        throw new Error('sqrt: domain error (x < 0)')
      }
      return Math.sqrt(x)
    },
    [rtKeys.f32Sin]: (_ctx, [a]) => Math.sin(a as number),
    [rtKeys.f32Cos]: (_ctx, [a]) => Math.cos(a as number),
    [rtKeys.f32Exp]: (_ctx, [a]) => Math.exp(a as number),
    [rtKeys.f32Ln]: (_ctx, [a]) => {
      const x = a as number
      // ISO 7185 6.6.6.2: "It shall be an error if such a value does not exist"
      if (!(x > 0)) {
        throw new Error('ln: domain error (x <= 0)')
      }
      return Math.log(x)
    },
    [rtKeys.f32Arctan]: (_ctx, [a]) => Math.atan(a as number),

    // ---------- bool（0/1 语义）----------
    // and / or 用 && / ||：对 0/1 输入结果仍是 0/1，且保短路
    [rtKeys.boolAnd]: (_ctx, [a, b]) => (a as number) && (b as number),
    [rtKeys.boolOr]: (_ctx, [a, b]) => (a as number) || (b as number),
    [rtKeys.boolNot]: (_ctx, [a]) => ((a as number) ? 0 : 1),

    // ---------- cmp ----------
    [rtKeys.cmpEq]: (_ctx, [a, b]) => a === b,
    [rtKeys.cmpNe]: (_ctx, [a, b]) => a !== b,
    [rtKeys.cmpLt]: (_ctx, [a, b]) => (a as number) < (b as number),
    [rtKeys.cmpLe]: (_ctx, [a, b]) => (a as number) <= (b as number),
    [rtKeys.cmpGt]: (_ctx, [a, b]) => (a as number) > (b as number),
    [rtKeys.cmpGe]: (_ctx, [a, b]) => (a as number) >= (b as number),

    // ---------- cast ----------
    [rtKeys.castF32ToI32]: (_ctx, [a]) => Math.trunc(a as number),
    // ISO 7185 6.6.6.3: round(x) = trunc(x+0.5) if x>=0, trunc(x-0.5) if x<0
    // （JS Math.round 对 -3.5 返回 -3，不符合 ISO 的 -4）
    [rtKeys.castF32ToI32Round]: (_ctx, [a]) => {
      const x = a as number
      return Math.trunc(x >= 0 ? x + 0.5 : x - 0.5) | 0
    },
    [rtKeys.castCharToI32]: (_ctx, [a]) => typeof a === 'string' ? a.charCodeAt(0) : (a as number),
    [rtKeys.castBoolToI32]: (_ctx, [a]) => (a ? 1 : 0),
    [rtKeys.castI32ToChar]: (_ctx, [a]) => String.fromCharCode(a as number),

    // ---------- ptr ----------
    // ISO 7185 6.5.4: 指针解引用 p^ — nil 解引用是 error (6.4.4)
    [rtKeys.ptrDeref]: (_ctx, [p]) => {
      if (p === null) {
        throw new Error('dereference of nil pointer (ISO 7185 6.4.4)')
      }
      return (p as PascalCell).value
    },
    [rtKeys.ptrAssign]: (_ctx, [p, v]) => {
      if (p === null) {
        throw new Error('dereference of nil pointer (ISO 7185 6.4.4)')
      }
      ;(p as PascalCell).value = v
      return undefined
    },
    // dispose(p) 前置检查：p 为 nil 是 error (ISO 7185 6.6.5.3)
    [rtKeys.ptrDisposeCheck]: (_ctx, [p]) => {
      if (p === null) {
        throw new Error('dispose of nil-value (ISO 7185 6.6.5.3)')
      }
      return undefined
    },
  }
}
