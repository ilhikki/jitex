/*
 * 内存原语：Uint8Array 视图上的操作。
 *
 * 值的表示：array / record / set 都是裸 Uint8Array（不带类型）；
 * 类型信息只在 get / set 那一刻由 rewrite 传入（offset + codec / size）。
 *
 * codec 的字节序与 boot-tex 一致（big-endian）。
 */

import { rtKeys } from '@/middle/rewrite/runtime-keys.ts'
import { arrayCount, isObjectRepr, setSize, sizeOf } from '@/middle/rewrite/type-layout.ts'
import type { Codec } from '@/middle/rewrite/type-layout.ts'
import type { TypeDescriptor } from '@/middle/lowering/type.ts'
import type { PascalCell, SyscallHandler } from '../runtime-type.ts'

/**
 * object 数组的统一表示：所有含 object 元素（file / pointer / 含它们的 record）
 * 的数组都用视图承载，下标 = base[offset + idx]。
 * 部分下标（a[i] on 二维数组）只是在视图上叠加 offset，共享同一 base，
 * 因此 arrGet / arrSet 对「完整数组」和「子数组视图」一视同仁，无需分支。
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

/** 按 codec 读标量 */
function getNum(view: Uint8Array, offset: number, codec: Codec): number {
  assertView(view, 'num.get')
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
  assertView(view, 'num.set')
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
    [rtKeys.memNew]: (_ctx, size) => new Uint8Array(size as number),
    [rtKeys.memClone]: (_ctx, src, size) => (src as Uint8Array).slice(0, size as number),
    [rtKeys.memCopy]: (_ctx, dst, dstOff, src, size) => {
      const d = dst as Uint8Array
      const s = src as Uint8Array
      d.set(s.subarray(0, size as number), dstOff as number)
      return undefined
    },
    [rtKeys.viewSub]: (_ctx, view, offset, size) => {
      const v = view as Uint8Array
      const off = offset as number
      return v.subarray(off, off + (size as number))
    },

    [rtKeys.numGet]: (_ctx, view, offset, codec) => getNum(view as Uint8Array, offset as number, codec as Codec),
    [rtKeys.numSet]: (_ctx, view, offset, codec, v) => {
      setNum(view as Uint8Array, offset as number, codec as Codec, v as number)
      return undefined
    },

    [rtKeys.cellNew]: (_ctx, v): PascalCell => ({ kind: 'cell', value: v }),
    [rtKeys.cellGet]: (_ctx, c) => (c as PascalCell).value,
    [rtKeys.cellSet]: (_ctx, c, v) => {
      ;(c as PascalCell).value = v
      return undefined
    },

    // 所有 object 数组，无论是否部分下标，都表示为视图；arrGet/arrSet/arrSublist 无需分支
    [rtKeys.arrNew]: (_ctx, count, elemType): ObjArrView => {
      const n = count as number
      const base = new Array<unknown>(n)
      for (let i = 0; i < n; i++) {
        base[i] = { kind: 'file', value: undefined, type: elemType }
      }
      return { base, offset: 0 }
    },
    [rtKeys.arrGet]: (_ctx, arr, idx) => {
      const v = arr as ObjArrView
      return v.base[v.offset + (idx as number)]
    },
    [rtKeys.arrSet]: (_ctx, arr, idx, val) => {
      const v = arr as ObjArrView
      v.base[v.offset + (idx as number)] = val
      return undefined
    },
    // 部分下标：在已有视图上叠加偏移，共享同一 base（同一分量）
    [rtKeys.arrSublist]: (_ctx, arr, offset) => {
      const v = arr as ObjArrView
      return { base: v.base, offset: v.offset + (offset as number) }
    },

    [rtKeys.packArray]: (_ctx, src, srcLow, elemSize, start, dst, count) => {
      const s = src as Uint8Array
      const d = dst as Uint8Array
      const size = elemSize as number
      const from = ((start as number) - (srcLow as number)) * size
      d.set(s.subarray(from, from + (count as number) * size), 0)
      return undefined
    },
    [rtKeys.unpackArray]: (_ctx, src, dst, dstLow, elemSize, start, count) => {
      const s = src as Uint8Array
      const d = dst as Uint8Array
      const size = elemSize as number
      const to = ((start as number) - (dstLow as number)) * size
      d.set(s.subarray(0, (count as number) * size), to)
      return undefined
    },

    [rtKeys.objNew]: (_ctx, td) => defaultValueOf(td as TypeDescriptor),
    [rtKeys.recGetField]: (_ctx, obj, name) => (obj as Record<string, unknown>)[name as string],
    [rtKeys.recSetField]: (_ctx, obj, name, v) => {
      ;(obj as Record<string, unknown>)[name as string] = v
      return undefined
    },
    [rtKeys.recClone]: (_ctx, v) => cloneValue(v),
  }
}

/** 类型的默认值：能字节化的用 Uint8Array，含 file / pointer 的用 JS 对象 / object[] */
function defaultValueOf(td: TypeDescriptor): unknown {
  switch (td.tag) {
    case 'i32':
      // 子界型取上界…取下界（ISO 7185 6.4.2.4 的变量初始值约定）
      return td.low ?? 0
    case 'enum':
    case 'bool':
      return 0
    case 'f64':
      return 0
    case 'char':
      return '\x00'
    case 'set':
      return new Uint8Array(setSize(td))
    case 'pointer':
      // ISO 7185 6.4.4: 未初始化的指针为 nil-value
      return undefined
    case 'file':
      return { kind: 'file', value: undefined, type: td }
    case 'array':
      if (isObjectRepr(td)) {
        const base = Array.from({ length: arrayCount(td) }, () => defaultValueOf(td.elem!))
        return { base, offset: 0 } satisfies ObjArrView
      }
      return new Uint8Array(sizeOf(td))
    case 'rec':
      return isObjectRepr(td) ? newRecordValue(td) : new Uint8Array(sizeOf(td))
    default:
      return 0
  }
}

function newRecordValue(td: TypeDescriptor): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of td.fields ?? []) {
    out[f.name] = defaultValueOf(f.type)
  }
  // variant 各分支的字段一并预置（union 语义由赋值方负责）
  for (const b of td.variant?.branches ?? []) {
    for (const f of b.fields) {
      out[f.name] = defaultValueOf(f.type)
    }
  }
  return out
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
    [rtKeys.setUnion]: (_ctx, a, b, size) =>
      bitmapOp(a as Uint8Array, b as Uint8Array, size as number, (x, y) => x | y),
    [rtKeys.setIntersect]: (_ctx, a, b, size) =>
      bitmapOp(a as Uint8Array, b as Uint8Array, size as number, (x, y) => x & y),
    [rtKeys.setDiff]: (_ctx, a, b, size) =>
      bitmapOp(a as Uint8Array, b as Uint8Array, size as number, (x, y) => x & ~y),
    [rtKeys.setEq]: (_ctx, a, b, size) => bitEquals(a as Uint8Array, b as Uint8Array, size as number) ? 1 : 0,
    [rtKeys.setNe]: (_ctx, a, b, size) => bitEquals(a as Uint8Array, b as Uint8Array, size as number) ? 0 : 1,
    [rtKeys.setLe]: (_ctx, a, b, size) => subset(a as Uint8Array, b as Uint8Array, size as number) ? 1 : 0,
    [rtKeys.setGe]: (_ctx, a, b, size) => subset(b as Uint8Array, a as Uint8Array, size as number) ? 1 : 0,
    [rtKeys.setIn]: (_ctx, bit, s, size) => {
      const bmp = s as Uint8Array
      const i = bit as number
      if (i < 0 || i >= (size as number) * 8) {
        return 0
      }
      return ((bmp[i >> 3] ?? 0) >> (i & 7)) & 1
    },
    [rtKeys.setElem]: (_ctx, bit, size) => withBit([bit as number], size as number),
    [rtKeys.setRange]: (_ctx, lo, hi, size) => {
      const bits: number[] = []
      for (let i = lo as number; i <= (hi as number); i++) {
        bits.push(i)
      }
      return withBit(bits, size as number)
    },
  }
}
