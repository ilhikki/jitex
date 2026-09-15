/*
 * 内存原语：Uint8Array 视图上的操作。
 *
 * 值的表示：array / record / set 都是裸 Uint8Array（不带类型）；
 * 类型由 rewrite 在编译期译成「偏移 + 具体 key」，运行期只剩标量常量，
 * 没有任何类型参数或类型分派。
 *
 * 多字节标量一律大端。
 *
 * 已被 codegen 内联为宿主表达式（见 sys/pascal-semantic-compiler.ts 的 inlineSyscalls）
 * 的 key 不在此实现：memory.new / memory.clone / memory.copy、cell.new / cell.get /
 * cell.set、array.get.object / array.set.object / array.sublist。
 */

import { rtKeys } from '@/middle/rewrite/runtime-keys.ts'
import type { SyscallHandler } from '../runtime-type.ts'

/**
 * object 数组的统一表示：所有含 object 元素（file / pointer / 含它们的 record）
 * 的数组都用视图承载，下标 = base[offset + idx]。
 */
interface ObjArrView {
  base: unknown[]
  offset: number
}

/**
 * DataView 缓存：按底层 ArrayBuffer 复用一个 DataView。
 *
 * DataView 的读写偏移是相对其视图窗口的；本模型里 offset 由编译期算出、
 * 运行时叠加视图的 byteOffset 得到绝对位置，因此窗口参数不承载语义——
 * 一个覆盖整个 ArrayBuffer 的 DataView 即可，无需每次构造。
 */
const dvCache = new WeakMap<ArrayBufferLike, DataView>()

function dv(buffer: ArrayBufferLike): DataView {
  let d = dvCache.get(buffer)
  if (d === undefined) {
    d = new DataView(buffer)
    dvCache.set(buffer, d)
  }
  return d
}

/** 视图参数校验：把「拿标量当视图用」这类建模错误暴露在出错点 */
function assertView(view: unknown, what: string): asserts view is Uint8Array {
  if (!(view instanceof Uint8Array)) {
    throw new Error(`${what}: expected a byte view, got ${view === null ? 'null' : typeof view}`)
  }
}

/**
 * 字节视图上的标量读写。
 *
 * 每个 key 固定一种标量种类，handler 直接调用对应的 DataView 方法——
 * 运行期既没有类型参数，也没有分支。
 *
 * 刻意不内联：内联版每次读写都要重新构造 DataView，
 * 而这里按底层 ArrayBuffer 复用（见 dv 的说明）。
 */
function bytesAccessSyscalls(): Record<string, SyscallHandler> {
  const reader = (
    read: (data: DataView, offset: number) => number,
  ): SyscallHandler =>
  (_ctx, view, offset) => {
    const v = view as Uint8Array
    assertView(v, 'bytes.get')
    return read(dv(v.buffer), v.byteOffset + (offset as number))
  }

  const writer = (
    write: (data: DataView, offset: number, value: number) => void,
  ): SyscallHandler =>
  (_ctx, view, offset, value) => {
    const v = view as Uint8Array
    assertView(v, 'bytes.set')
    write(dv(v.buffer), v.byteOffset + (offset as number), value as number)
    return undefined
  }

  return {
    [rtKeys.bytesGetInt8]: reader((d, o) => d.getInt8(o)),
    [rtKeys.bytesGetUint8]: reader((d, o) => d.getUint8(o)),
    [rtKeys.bytesGetInt16]: reader((d, o) => d.getInt16(o, false)),
    [rtKeys.bytesGetUint16]: reader((d, o) => d.getUint16(o, false)),
    [rtKeys.bytesGetInt32]: reader((d, o) => d.getInt32(o, false)),
    [rtKeys.bytesGetFloat32]: reader((d, o) => d.getFloat32(o, false)),

    [rtKeys.bytesSetInt8]: writer((d, o, v) => d.setInt8(o, v)),
    [rtKeys.bytesSetUint8]: writer((d, o, v) => d.setUint8(o, v)),
    [rtKeys.bytesSetInt16]: writer((d, o, v) => d.setInt16(o, v, false)),
    [rtKeys.bytesSetUint16]: writer((d, o, v) => d.setUint16(o, v, false)),
    [rtKeys.bytesSetInt32]: writer((d, o, v) => d.setInt32(o, v | 0, false)),
    [rtKeys.bytesSetFloat32]: writer((d, o, v) => d.setFloat32(o, v, false)),
  }
}

// 位图集合运算

function bitmapOp(
  a: Uint8Array,
  b: Uint8Array,
  size: number,
  op: (x: number, y: number) => number,
): Uint8Array {
  const out = new Uint8Array(size)
  for (let i = 0; i < size; i++) {
    out[i] = op(a[i] ?? 0, b[i] ?? 0) & 0xff
  }
  return out
}

/** a ⊆ b ⇔ a & ~b 全 0 */
function subset(a: Uint8Array, b: Uint8Array, size: number): boolean {
  for (let i = 0; i < size; i++) {
    if (((a[i] ?? 0) & ~(b[i] ?? 0)) & 0xff) {
      return false
    }
  }
  return true
}

function bitEquals(a: Uint8Array, b: Uint8Array, size: number): boolean {
  for (let i = 0; i < size; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) {
      return false
    }
  }
  return true
}

function withBit(bits: number[], size: number): Uint8Array {
  const out = new Uint8Array(size)
  for (const bit of bits) {
    if (bit >= 0 && bit < size * 8) {
      out[bit >> 3] |= 1 << (bit & 7)
    }
  }
  return out
}

export function memSyscalls(): Record<string, SyscallHandler> {
  return {
    // 视图切分。codegen 仅在 offset 为简单表达式时内联（避免重复求值），
    // 其余情形仍走 dispatcher，故保留本 handler。
    [rtKeys.viewSubarray]: (_ctx, view, offset, size) => {
      const v = view as Uint8Array
      const off = offset as number
      return v.subarray(off, off + (size as number))
    },

    ...bytesAccessSyscalls(),

    [rtKeys.bytesPack]: (_ctx, src, srcLow, elemSize, start, dst, count) => {
      const s = src as Uint8Array
      const d = dst as Uint8Array
      const size = elemSize as number
      const from = ((start as number) - (srcLow as number)) * size
      d.set(s.subarray(from, from + (count as number) * size), 0)
      return undefined
    },
    [rtKeys.bytesUnpack]: (_ctx, src, dst, dstLow, elemSize, start, count) => {
      const s = src as Uint8Array
      const d = dst as Uint8Array
      const size = elemSize as number
      const to = ((start as number) - (dstLow as number)) * size
      d.set(s.subarray(0, (count as number) * size), to)
      return undefined
    },

    // object 表示的默认值构造：字段名与元素值均已由 rewrite 在编译期展开
    [rtKeys.objectNew]: (_ctx, ...pairs) => {
      const out: Record<string, unknown> = {}
      for (let i = 0; i < pairs.length; i += 2) {
        out[pairs[i] as string] = pairs[i + 1]
      }
      return out
    },
    [rtKeys.objectArrayNew]: (_ctx, ...elems): ObjArrView => ({ base: elems, offset: 0 }),

    // JS 普通对象上的字段读写（object 表示的 record / 数组元素）
    [rtKeys.objectGet]: (_ctx, obj, name) => (obj as Record<string, unknown>)[name as string],
    [rtKeys.objectSet]: (_ctx, obj, name, v) => {
      ;(obj as Record<string, unknown>)[name as string] = v
      return undefined
    },
    // 值语义深拷贝：实参是 object 表示的任意 JS 值
    [rtKeys.valueClone]: (_ctx, v) => cloneValue(v),
  }
}

/**
 * 值语义拷贝：字节视图拷字节；对象表示的 record / 数组递归拷贝；
 * pointer 的 identifying-value 与 file 句柄拷引用（ISO 7185 的值语义要求如此）。
 */
function cloneValue(v: unknown): unknown {
  if (v instanceof Uint8Array) {
    return v.slice()
  }
  if (Array.isArray(v)) {
    return v.map(cloneValue)
  }
  if (v !== null && typeof v === 'object') {
    const kind = (v as { kind?: string }).kind
    if (kind === 'file' || kind === 'cell') {
      return v
    }
    const src = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src)) {
      out[k] = cloneValue(src[k])
    }
    return out
  }
  return v
}

/**
 * 位图运算（宿主表示：Uint8Array 位图）。
 *
 * bit i ↔ ord 值 (low + i)；由 rewrite 在产出时减去 low，
 * 因此这里只接收「位下标」，不需要知道类型。
 */
export function setSyscalls(): Record<string, SyscallHandler> {
  return {
    [rtKeys.bitmapUnion]: (_ctx, a, b, size) =>
      bitmapOp(a as Uint8Array, b as Uint8Array, size as number, (x, y) => x | y),
    [rtKeys.bitmapIntersection]: (_ctx, a, b, size) =>
      bitmapOp(a as Uint8Array, b as Uint8Array, size as number, (x, y) => x & y),
    [rtKeys.bitmapDifference]: (_ctx, a, b, size) =>
      bitmapOp(a as Uint8Array, b as Uint8Array, size as number, (x, y) => x & ~y),
    [rtKeys.bitmapEqual]: (_ctx, a, b, size) => bitEquals(a as Uint8Array, b as Uint8Array, size as number) ? 1 : 0,
    [rtKeys.bitmapNotEqual]: (_ctx, a, b, size) => bitEquals(a as Uint8Array, b as Uint8Array, size as number) ? 0 : 1,
    [rtKeys.bitmapSubset]: (_ctx, a, b, size) => subset(a as Uint8Array, b as Uint8Array, size as number) ? 1 : 0,
    [rtKeys.bitmapSuperset]: (_ctx, a, b, size) => subset(b as Uint8Array, a as Uint8Array, size as number) ? 1 : 0,
    [rtKeys.bitmapContains]: (_ctx, bit, s, size) => {
      const bmp = s as Uint8Array
      const i = bit as number
      if (i < 0 || i >= (size as number) * 8) {
        return 0
      }
      return ((bmp[i >> 3] ?? 0) & (1 << (i & 7))) !== 0
    },
    [rtKeys.bitmapSingleton]: (_ctx, bit, size) => withBit([bit as number], size as number),
    [rtKeys.bitmapRange]: (_ctx, lo, hi, size) => {
      const bits: number[] = []
      for (let i = lo as number; i <= (hi as number); i++) {
        bits.push(i)
      }
      return withBit(bits, size as number)
    },
  }
}
