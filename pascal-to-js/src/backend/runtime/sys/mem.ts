/*
 * 内存原语：Uint8Array 视图上的操作。
 *
 * 值的表示：array / record / set 都是裸 Uint8Array（不带类型）；
 * 类型信息只在 get / set 那一刻由 rewrite 传入（offset + codec / size）。
 *
 * codec 的字节序与 boot-tex 一致（big-endian）。
 */

import { rtKeys } from '@/middle/rewrite/runtime-keys.ts'
import type { Codec } from '@/middle/rewrite/type-layout.ts'
import type { PascalCell, SyscallHandler } from '../runtime-type.ts'

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

/** 按 codec 读标量 */
function getNum(view: Uint8Array, offset: number, codec: Codec): number {
  const d = dv(view.buffer)
  const o = view.byteOffset + offset
  switch (codec) {
    case 'i8':
      return d.getInt8(o)
    case 'u8':
      return d.getUint8(o)
    case 'i16':
      return d.getInt16(o, false)
    case 'u16':
      return d.getUint16(o, false)
    case 'i32':
      return d.getInt32(o, false)
    case 'f64':
      return d.getFloat64(o, false)
  }
}

/** 按 codec 写标量 */
function setNum(view: Uint8Array, offset: number, codec: Codec, v: number): void {
  const d = dv(view.buffer)
  const o = view.byteOffset + offset
  switch (codec) {
    case 'i8':
      d.setInt8(o, v)
      return
    case 'u8':
      d.setUint8(o, v)
      return
    case 'i16':
      d.setInt16(o, v, false)
      return
    case 'u16':
      d.setUint16(o, v, false)
      return
    case 'i32':
      d.setInt32(o, v | 0, false)
      return
    case 'f64':
      d.setFloat64(o, v, false)
      return
  }
}

// ============================================================
// 位图集合运算
// ============================================================

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

// ============================================================

export function memSyscalls(): Record<string, SyscallHandler> {
  return {
    // ---------- 分配 / 拷贝 / 视图 ----------
    [rtKeys.memNew]: (_ctx, [size]) => new Uint8Array(size as number),
    [rtKeys.memClone]: (_ctx, [src, size]) => (src as Uint8Array).slice(0, size as number),
    [rtKeys.memCopy]: (_ctx, [dst, dstOff, src, size]) => {
      const d = dst as Uint8Array
      const s = src as Uint8Array
      d.set(s.subarray(0, size as number), dstOff as number)
      return undefined
    },
    [rtKeys.viewSub]: (_ctx, [view, offset, size]) => {
      const v = view as Uint8Array
      const off = offset as number
      return v.subarray(off, off + (size as number))
    },

    // ---------- 标量读写（codec 即类型）----------
    [rtKeys.numGet]: (_ctx, [view, offset, codec]) => getNum(view as Uint8Array, offset as number, codec as Codec),
    [rtKeys.numSet]: (_ctx, [view, offset, codec, v]) => {
      setNum(view as Uint8Array, offset as number, codec as Codec, v as number)
      return undefined
    },

    // ---------- cell（var 参数传递）----------
    [rtKeys.cellNew]: (_ctx, [v]): PascalCell => ({ kind: 'cell', value: v }),
    [rtKeys.cellGet]: (_ctx, [c]) => (c as PascalCell).value,
    [rtKeys.cellSet]: (_ctx, [c, v]) => {
      ;(c as PascalCell).value = v
      return undefined
    },

    // ---------- object 数组（元素是 object，如 file；用 JS Array 承载）----------
    [rtKeys.arrNew]: (_ctx, [count, elemType]): unknown[] => {
      const n = count as number
      const out = new Array<unknown>(n)
      for (let i = 0; i < n; i++) {
        out[i] = { kind: 'file', value: undefined, type: elemType }
      }
      return out
    },
    [rtKeys.arrGet]: (_ctx, [arr, idx]) => (arr as unknown[])[idx as number],
    [rtKeys.arrSet]: (_ctx, [arr, idx, v]) => {
      ;(arr as unknown[])[idx as number] = v
      return undefined
    },
  }
}

/**
 * set 的位图运算。
 *
 * bit i ↔ ord 值 (low + i)；由 rewrite 在产出时减去 low，
 * 因此这里只接收「位下标」，不需要知道类型。
 *
 * 注：Step 2 期间不与旧 PascalSet 版本同时注册（由 runtime.ts 控制），
 * 待 Step 3 lowering 全面改产新 key 后启用。
 */
export function setSyscalls(): Record<string, SyscallHandler> {
  return {
    [rtKeys.setUnion]: (_ctx, [a, b, size]) =>
      bitmapOp(a as Uint8Array, b as Uint8Array, size as number, (x, y) => x | y),
    [rtKeys.setIntersect]: (_ctx, [a, b, size]) =>
      bitmapOp(a as Uint8Array, b as Uint8Array, size as number, (x, y) => x & y),
    [rtKeys.setDiff]: (_ctx, [a, b, size]) =>
      bitmapOp(a as Uint8Array, b as Uint8Array, size as number, (x, y) => x & ~y),
    [rtKeys.setEq]: (_ctx, [a, b, size]) => bitEquals(a as Uint8Array, b as Uint8Array, size as number) ? 1 : 0,
    [rtKeys.setNe]: (_ctx, [a, b, size]) => bitEquals(a as Uint8Array, b as Uint8Array, size as number) ? 0 : 1,
    [rtKeys.setLe]: (_ctx, [a, b, size]) => subset(a as Uint8Array, b as Uint8Array, size as number) ? 1 : 0,
    [rtKeys.setGe]: (_ctx, [a, b, size]) => subset(b as Uint8Array, a as Uint8Array, size as number) ? 1 : 0,
    [rtKeys.setIn]: (_ctx, [bit, s, size]) => {
      const bmp = s as Uint8Array
      const i = bit as number
      if (i < 0 || i >= (size as number) * 8) {
        return 0
      }
      return ((bmp[i >> 3] ?? 0) >> (i & 7)) & 1
    },
    [rtKeys.setElem]: (_ctx, [bit, size]) => withBit([bit as number], size as number),
    [rtKeys.setRange]: (_ctx, [lo, hi, size]) => {
      const bits: number[] = []
      for (let i = lo as number; i <= (hi as number); i++) {
        bits.push(i)
      }
      return withBit(bits, size as number)
    },
  }
}
