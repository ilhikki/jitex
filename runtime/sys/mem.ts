/*
 * 内存原语：字节宿主（ByteHost）与 JS 对象（object 表示）上的操作。
 *
 * 值的表示由 rewrite 在编译期判定（见 isObjectRepr）：
 *   - 不含 file / pointer 的 array / record / set → 字节宿主（不带类型），
 *     类型译成「偏移 + 具体 key」，运行期只剩标量常量；
 *   - 含 file / pointer 的 array / record → JS 普通对象 / {base, offset} 视图。
 *
 * 多字节标量一律大端。
 *
 * 已被 codegen 内联为宿主表达式（见 @jitex/pascal-to-js 的 backend/codegen/semantic-compiler.ts
 * 的 inlineSyscalls）
 * 的 key 不在此实现：bytes.alloc / bytes.clone / bytes.copy、cell.new / cell.get /
 * cell.set、objectarray.get / objectarray.set / objectarray.sublist。
 */

import { rtKeys } from '../keys.ts'
import type { ByteHost, SyscallHandler } from '../runtime-type.ts'

/**
 * object 数组的统一表示：所有含 object 元素（file / pointer / 含它们的 record）
 * 的数组都用视图承载，下标 = base[offset + idx]。
 */
interface ObjArrView {
  base: unknown[]
  offset: number
}

/**
 * 由字节视图构造宿主。
 *
 * DataView 的读写偏移是相对其视图窗口的；本模型里 offset 由编译期算出、
 * 运行时叠加 bytes.byteOffset 得到绝对位置，因此窗口参数不承载语义——
 * 一个覆盖整个 ArrayBuffer 的 DataView 即可。
 */
export function makeByteHost(bytes: Uint8Array): ByteHost {
  return { bytes, dv: new DataView(bytes.buffer) }
}

/** 宿主参数校验：把「拿标量当字节宿主用」这类建模错误暴露在出错点 */
function assertView(view: unknown, what: string): asserts view is ByteHost {
  const h = view as ByteHost | null
  if (h === null || typeof h !== 'object' || !(h.bytes instanceof Uint8Array) || !(h.dv instanceof DataView)) {
    throw new Error(`${what}: expected a byte host, got ${view === null ? 'null' : typeof view}`)
  }
}

/**
 * 字节宿主上的标量读写。
 *
 * 每个 key 固定一种标量种类，handler 直接调用对应的 DataView 方法——
 * 运行期既没有类型参数，也没有分支。
 *
 * 实参的宿主断言不在这里做：它由 rewrite 在 debug 构建下包一层
 * `runtime.debug.assert.view`（见 assertViewSyscall），非 debug 构建
 * 完全不生成，两个 handler 便都不含检查。
 *
 * 暂不内联：内联需保证 view 表达式单次求值（宿主在偏移算式里出现两次）。
 */
function bytesAccessSyscalls(): Record<string, SyscallHandler> {
  const reader = (
    read: (data: DataView, offset: number) => number,
  ): SyscallHandler =>
  (_ctx, view, offset) => {
    const h = view as ByteHost
    return read(h.dv, h.bytes.byteOffset + (offset as number))
  }

  const writer = (
    write: (data: DataView, offset: number, value: number) => void,
  ): SyscallHandler =>
  (_ctx, view, offset, value) => {
    const h = view as ByteHost
    write(h.dv, h.bytes.byteOffset + (offset as number), value as number)
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
  a: ByteHost,
  b: ByteHost,
  size: number,
  op: (x: number, y: number) => number,
): ByteHost {
  const x = a.bytes
  const y = b.bytes
  const out = new Uint8Array(size)
  for (let i = 0; i < size; i++) {
    out[i] = op(x[i] ?? 0, y[i] ?? 0) & 0xff
  }
  return makeByteHost(out)
}

/** a ⊆ b ⇔ a & ~b 全 0 */
function subset(a: ByteHost, b: ByteHost, size: number): boolean {
  const x = a.bytes
  const y = b.bytes
  for (let i = 0; i < size; i++) {
    if (((x[i] ?? 0) & ~(y[i] ?? 0)) & 0xff) {
      return false
    }
  }
  return true
}

function bitEquals(a: ByteHost, b: ByteHost, size: number): boolean {
  const x = a.bytes
  const y = b.bytes
  for (let i = 0; i < size; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) {
      return false
    }
  }
  return true
}

function withBit(bits: number[], size: number): ByteHost {
  const out = new Uint8Array(size)
  for (const bit of bits) {
    if (bit >= 0 && bit < size * 8) {
      out[bit >> 3] |= 1 << (bit & 7)
    }
  }
  return makeByteHost(out)
}

export function memSyscalls(): Record<string, SyscallHandler> {
  return {
    // debug 构建专属：字节视图实参断言。rewrite 在 bytes.get.* / bytes.set.*
    // 的视图实参外包裹本 key；非 debug 构建不生成，故运行期零开销。
    [rtKeys.debugAssertView]: (_ctx, view, label) => {
      assertView(view, label as string)
      return view
    },

    // 由字节数组构造宿主：bytes 字面量（字符串常量）的宿主化入口
    [rtKeys.bytesHost]: (_ctx, data) => makeByteHost(new Uint8Array(data as number[])),

    // 分配新宿主
    [rtKeys.bytesAlloc]: (_ctx, size) => makeByteHost(new Uint8Array(size as number)),

    // 按值拷贝：前 size 个字节进新宿主
    [rtKeys.bytesClone]: (_ctx, host, size) => makeByteHost((host as ByteHost).bytes.slice(0, size as number)),

    // 把 src 前 size 个字节写入 dst 的 offset 处（非标量槽位的整体赋值）
    [rtKeys.bytesCopy]: (_ctx, dst, offset, src, size) => {
      ;(dst as ByteHost).bytes.set((src as ByteHost).bytes.subarray(0, size as number), offset as number)
      return undefined
    },

    // 视图切分：共享同一 dv，只换字节视图（其 byteOffset 承载新偏移）
    [rtKeys.viewSubarray]: (_ctx, view, offset, size) => {
      const h = view as ByteHost
      const off = offset as number
      return { bytes: h.bytes.subarray(off, off + (size as number)), dv: h.dv }
    },

    ...bytesAccessSyscalls(),

    [rtKeys.bytesPack]: (_ctx, src, srcLow, elemSize, start, dst, count) => {
      const s = (src as ByteHost).bytes
      const d = (dst as ByteHost).bytes
      const size = elemSize as number
      const from = ((start as number) - (srcLow as number)) * size
      d.set(s.subarray(from, from + (count as number) * size), 0)
      return undefined
    },
    [rtKeys.bytesUnpack]: (_ctx, src, dst, dstLow, elemSize, start, count) => {
      const s = (src as ByteHost).bytes
      const d = (dst as ByteHost).bytes
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
    // `object.new` 的对偶：普通对象的按值深拷贝
    [rtKeys.objectClone]: (_ctx, v) => cloneObject(v as Record<string, unknown>),
    // `objectarray.new` 的对偶：{base, offset} 视图的按值深拷贝（保留视图偏移）
    [rtKeys.objectArrayClone]: (_ctx, v) => cloneObjectArray(v as ObjArrView),
  }
}

/** `object.new` 的对偶：逐字段深拷贝普通对象 */
function cloneObject(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(src)) {
    out[k] = cloneField(src[k])
  }
  return out
}

/** `objectarray.new` 的对偶：拷贝 base 数组，保留视图偏移 */
function cloneObjectArray(view: ObjArrView): ObjArrView {
  return { base: view.base.map(cloneField), offset: view.offset }
}

/**
 * 字段 / 元素的按值深拷贝，按「该值自己的宿主表示」分派。
 *
 * 这一层分派暂时无法上移到 key：字段的宿主表示只有在运行期取到值才可见。
 * rewrite 其实知道静态类型，可以把 object 表示的 record 逐层展开成
 * object.new + object.clone 的构造树（与 defaultValueExpr 对称），属后续优化。
 *
 * 当前语义：字节宿主拷字节（重建宿主）；JS 数组逐元素；普通对象递归；
 * file / cell 拷引用（ISO 7185 值语义要求 identifying-value 保持同一）；标量原样。
 */
function cloneField(v: unknown): unknown {
  const h = v as ByteHost | null
  if (h !== null && typeof h === 'object' && h.bytes instanceof Uint8Array && h.dv instanceof DataView) {
    return makeByteHost(h.bytes.slice())
  }
  if (Array.isArray(v)) {
    return v.map(cloneField)
  }
  if (v !== null && typeof v === 'object') {
    const kind = (v as { kind?: string }).kind
    if (kind === 'file' || kind === 'cell') {
      return v
    }
    return cloneObject(v as Record<string, unknown>)
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
    [rtKeys.bitmapUnion]: (_ctx, a, b, size) => bitmapOp(a as ByteHost, b as ByteHost, size as number, (x, y) => x | y),
    [rtKeys.bitmapIntersection]: (_ctx, a, b, size) =>
      bitmapOp(a as ByteHost, b as ByteHost, size as number, (x, y) => x & y),
    [rtKeys.bitmapDifference]: (_ctx, a, b, size) =>
      bitmapOp(a as ByteHost, b as ByteHost, size as number, (x, y) => x & ~y),
    [rtKeys.bitmapEqual]: (_ctx, a, b, size) => bitEquals(a as ByteHost, b as ByteHost, size as number) ? 1 : 0,
    [rtKeys.bitmapNotEqual]: (_ctx, a, b, size) => bitEquals(a as ByteHost, b as ByteHost, size as number) ? 0 : 1,
    [rtKeys.bitmapSubset]: (_ctx, a, b, size) => subset(a as ByteHost, b as ByteHost, size as number) ? 1 : 0,
    [rtKeys.bitmapSuperset]: (_ctx, a, b, size) => subset(b as ByteHost, a as ByteHost, size as number) ? 1 : 0,
    [rtKeys.bitmapContains]: (_ctx, bit, s, size) => {
      const bmp = (s as ByteHost).bytes
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
