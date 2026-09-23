/*
 * 算术 / 逻辑 / 比较 / 转换 / 指针的 runtime syscall handler。
 *
 * 这一组 key 绝大多数已由 codegen 内联为宿主表达式
 * （见 @jitex/pascal-to-js 的 backend/codegen/semantic-compiler.ts 的 inlineSyscalls），不会经过 dispatcher。
 * 本文件只保留无法内联的 handler：
 *   - 带前置条件检查的：除零、mod 的正数要求、sqrt / ln 的定义域；
 *   - 内联会导致实参重复求值的：char → int32、round；
 *   - 带 error 语义的指针操作。
 */

import { rtKeys } from '../keys.ts'
import type { PascalCell, SyscallHandler } from '../runtime-type.ts'

export function arithSyscalls(): Record<string, SyscallHandler> {
  return {
    // 纯运算。除数检查由 rewrite 在 debug 构建下包一层 runtime.debug.*.check：
    // 非 debug 构建不检查，ISO 7185 6.7.2.2 的 error 条款变为实现定义行为。
    [rtKeys.int32Divide]: (_ctx, a, b) => Math.trunc((a as number) / (b as number)) | 0,
    [rtKeys.int32Modulo]: (_ctx, a, b) => {
      const l = a as number
      const m = b as number
      // ISO 7185 6.7.2.2: i mod j = i - k*j，其中 k 使 0 <= i mod j < j（floor 语义）
      return (l - Math.floor(l / m) * m) | 0
    },

    // debug 构建专属：除数检查。返回被检查的值本身，以便作为实参包裹在
    // runtime.int32.divide/modulo 的除数位置上（实参仍只求值一次）。
    [rtKeys.debugDivideCheck]: (_ctx, b) => {
      const d = b as number
      if (d === 0) {
        throw new Error('JS VM: division by zero')
      }
      return d
    },
    [rtKeys.debugModuloCheck]: (_ctx, b) => {
      const m = b as number
      // ISO 7185 6.7.2.2: i mod j 在 j 为 0 或负数时为 error
      if (m <= 0) {
        throw new Error(`JS VM: i mod j requires j > 0 (ISO 7185 6.7.2.2), got ${m}`)
      }
      return m
    },

    [rtKeys.float32SquareRoot]: (_ctx, a) => {
      const x = a as number
      // ISO 7185 6.6.6.2: "It shall be an error if such a value does not exist"
      if (!(x >= 0)) {
        throw new Error('sqrt: domain error (x < 0)')
      }
      return Math.sqrt(x)
    },
    [rtKeys.float32Logarithm]: (_ctx, a) => {
      const x = a as number
      // ISO 7185 6.6.6.2: "It shall be an error if such a value does not exist"
      if (!(x > 0)) {
        throw new Error('ln: domain error (x <= 0)')
      }
      return Math.log(x)
    },

    // ISO 7185 6.6.6.3: round(x) = trunc(x+0.5) if x>=0, trunc(x-0.5) if x<0
    // （JS Math.round 对 -3.5 返回 -3，不符合 ISO 的 -4）
    [rtKeys.castFloat32ToInt32Round]: (_ctx, a) => {
      const x = a as number
      return Math.trunc(x >= 0 ? x + 0.5 : x - 0.5) | 0
    },
    // char 的宿主表示统一为字节值（number），无类型分派
    [rtKeys.castCharToInt32]: (_ctx, a) => (a as number) & 0xff,

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
