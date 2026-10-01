import { rtKeys } from '../keys.ts'
import type { ByteHost, SyscallHandler } from '../runtime-type.ts'

interface ObjArrView {
  base: unknown[]
  offset: number
}

export function makeByteHost(bytes: Uint8Array): ByteHost {
  return { bytes, dv: new DataView(bytes.buffer) }
}

function assertView(view: unknown, what: string): asserts view is ByteHost {
  const h = view as ByteHost | null
  if (h === null || typeof h !== 'object' || !(h.bytes instanceof Uint8Array) || !(h.dv instanceof DataView)) {
    throw new Error(`${what}: expected a byte host, got ${view === null ? 'null' : typeof view}`)
  }
}

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
    [rtKeys.debugAssertView]: (_ctx, view, label) => {
      assertView(view, label as string)
      return view
    },

    [rtKeys.bytesHost]: (_ctx, data) => makeByteHost(new Uint8Array(data as number[])),

    [rtKeys.bytesAlloc]: (_ctx, size) => makeByteHost(new Uint8Array(size as number)),

    [rtKeys.bytesClone]: (_ctx, host, size) => makeByteHost((host as ByteHost).bytes.slice(0, size as number)),

    [rtKeys.bytesCopy]: (_ctx, dst, offset, src, size) => {
      ;(dst as ByteHost).bytes.set((src as ByteHost).bytes.subarray(0, size as number), offset as number)
      return undefined
    },

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

    [rtKeys.objectNew]: (_ctx, ...pairs) => {
      const out: Record<string, unknown> = {}
      for (let i = 0; i < pairs.length; i += 2) {
        out[pairs[i] as string] = pairs[i + 1]
      }
      return out
    },
    [rtKeys.objectArrayNew]: (_ctx, ...elems): ObjArrView => ({ base: elems, offset: 0 }),

    [rtKeys.objectGet]: (_ctx, obj, name) => (obj as Record<string, unknown>)[name as string],
    [rtKeys.objectSet]: (_ctx, obj, name, v) => {
      ;(obj as Record<string, unknown>)[name as string] = v
      return undefined
    },
    [rtKeys.objectClone]: (_ctx, v) => cloneObject(v as Record<string, unknown>),
    [rtKeys.objectArrayClone]: (_ctx, v) => cloneObjectArray(v as ObjArrView),
  }
}

function cloneObject(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(src)) {
    out[k] = cloneField(src[k])
  }
  return out
}

function cloneObjectArray(view: ObjArrView): ObjArrView {
  return { base: view.base.map(cloneField), offset: view.offset }
}

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
