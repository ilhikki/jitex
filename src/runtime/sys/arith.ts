import { rtKeys } from '../keys.ts'
import type { PascalCell, SyscallHandler } from '../runtime-type.ts'

export function arithSyscalls(): Record<string, SyscallHandler> {
  return {
    [rtKeys.int32Divide]: (_ctx, a, b) => Math.trunc((a as number) / (b as number)) | 0,
    [rtKeys.int32Modulo]: (_ctx, a, b) => {
      const l = a as number
      const m = b as number
      return (l - Math.floor(l / m) * m) | 0
    },

    [rtKeys.debugDivideCheck]: (_ctx, b) => {
      const d = b as number
      if (d === 0) {
        throw new Error('JS VM: division by zero')
      }
      return d
    },
    [rtKeys.debugModuloCheck]: (_ctx, b) => {
      const m = b as number
      if (m <= 0) {
        throw new Error(`JS VM: i mod j requires j > 0 (ISO 7185 6.7.2.2), got ${m}`)
      }
      return m
    },

    [rtKeys.float32SquareRoot]: (_ctx, a) => {
      const x = a as number

      if (!(x >= 0)) {
        throw new Error('sqrt: domain error (x < 0)')
      }
      return Math.sqrt(x)
    },
    [rtKeys.float32Logarithm]: (_ctx, a) => {
      const x = a as number

      if (!(x > 0)) {
        throw new Error('ln: domain error (x <= 0)')
      }
      return Math.log(x)
    },

    [rtKeys.castFloat32ToInt32Round]: (_ctx, a) => {
      const x = a as number
      return Math.trunc(x >= 0 ? x + 0.5 : x - 0.5) | 0
    },
    [rtKeys.castCharToInt32]: (_ctx, a) => (a as number) & 0xff,

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
    [rtKeys.pointerDisposeCheck]: (_ctx, p) => {
      if (p === undefined) {
        throw new Error('dispose of nil-value (ISO 7185 6.6.5.3)')
      }
      return undefined
    },
  }
}
