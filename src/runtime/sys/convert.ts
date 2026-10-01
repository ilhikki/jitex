import { rtKeys } from '../keys.ts'
import type { ByteHost, SyscallHandler } from '../runtime-type.ts'
import { bytesToString, formatField, formatReal } from '../runtime-util.ts'
import { makeByteHost } from './mem.ts'

function pad(s: string, w: unknown): string {
  return w === undefined ? s : formatField(s, w as number)
}

export function convertSyscalls(): Record<string, SyscallHandler> {
  return {
    [rtKeys.convertInt32ToText]: (_ctx, n, w) => pad(String(n), w),
    [rtKeys.convertFloat32ToText]: (_ctx, n, w, p) => {
      const x = n as number
      const text = p === undefined ? formatReal(x) : x.toFixed(p as number)
      return pad(text, w)
    },
    [rtKeys.convertBooleanToText]: (_ctx, b, w) => pad(b ? 'TRUE' : 'FALSE', w),
    [rtKeys.convertInt32ToChar]: (_ctx, n, w) => pad(String.fromCharCode((n as number) & 0xff), w),
    [rtKeys.convertBytesToTextField]: (_ctx, bytes, w) => {
      const text = bytesToString((bytes as ByteHost).bytes)
      const width = w as number
      if (width < 1) {
        throw new Error(`write field width shall be >= 1 (ISO 7185 6.9.3.1), got ${width}`)
      }
      if (width > text.length) {
        return ' '.repeat(width - text.length) + text
      }
      return text.slice(0, width)
    },

    [rtKeys.convertInt32ToBytes]: (_ctx, n) => {
      const h = makeByteHost(new Uint8Array(4))
      h.dv.setInt32(0, (n as number) | 0, false)
      return h
    },
    [rtKeys.convertFloat32ToBytes]: (_ctx, n) => {
      const h = makeByteHost(new Uint8Array(4))
      h.dv.setFloat32(0, n as number, false)
      return h
    },
    [rtKeys.convertBooleanToBytes]: (_ctx, b) => makeByteHost(new Uint8Array([b ? 1 : 0])),

    [rtKeys.convertTextToInt32]: (_ctx, s) => {
      const text = String(s).trim()
      return text ? parseInt(text, 10) | 0 : 0
    },
    [rtKeys.convertTextToFloat32]: (_ctx, s) => {
      const text = String(s).trim()
      return text ? Math.fround(parseFloat(text)) : 0
    },
    [rtKeys.convertTextToBoolean]: (_ctx, s) => {
      const t = String(s).trim().toLowerCase()
      return t === 'true' || t === 't' ? 1 : 0
    },

    [rtKeys.convertBytesToInt32]: (_ctx, b) => {
      const h = b as ByteHost
      return h.dv.getInt32(h.bytes.byteOffset, false)
    },
    [rtKeys.convertBytesToFloat32]: (_ctx, b) => {
      const h = b as ByteHost
      return h.dv.getFloat32(h.bytes.byteOffset, false)
    },
    [rtKeys.convertBytesToBoolean]: (_ctx, b) => ((b as ByteHost).bytes[0] ? 1 : 0),

    [rtKeys.convertCharToInt32]: (_ctx, c) => (c as number) & 0xff,
  }
}
