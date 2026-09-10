/*
 * 转换原语：值 ↔ 文件单位。
 *
 * 只服务「值参数类型多态」（write / read 的值参数），
 * 由 rewrite 按值类型 + 文件元素类型选择具体 key。
 * runtime 侧不含 Pascal 类型信息，只做纯粹的格式 / 字节转换。
 *
 * 文本文件：单位是字符串；二进制文件：单位是 Uint8Array。
 */

import { rtKeys } from '@/middle/rewrite/runtime-keys.ts'
import type { SyscallHandler } from '../runtime-type.ts'
import { formatField, formatReal } from '../runtime-util.ts'

function dataView(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength)
}

/** 按宽度右对齐（width 为 undefined 时原样返回） */
function pad(s: string, w: unknown): string {
  return w === undefined || w === null ? s : formatField(s, w as number)
}

export function convertSyscalls(): Record<string, SyscallHandler> {
  return {
    // ---------- 值 → 文本字符串 ----------
    [rtKeys.i32ToStr]: (_ctx, [n, w]) => pad(String(n), w),
    [rtKeys.f64ToStr]: (_ctx, [n, w, p]) => {
      const x = n as number
      const text = p === undefined || p === null ? formatReal(x) : x.toFixed(p as number)
      return pad(text, w)
    },
    [rtKeys.boolToStr]: (_ctx, [b, w]) => pad(b ? 'TRUE' : 'FALSE', w),
    [rtKeys.i32ToChar]: (_ctx, [n, w]) => pad(String.fromCharCode(n as number), w),

    // ---------- 值 → 字节 ----------
    [rtKeys.i32ToBytes]: (_ctx, [n]) => {
      const b = new Uint8Array(4)
      dataView(b).setInt32(0, (n as number) | 0, false)
      return b
    },
    [rtKeys.f64ToBytes]: (_ctx, [n]) => {
      const b = new Uint8Array(8)
      dataView(b).setFloat64(0, n as number, false)
      return b
    },
    [rtKeys.boolToBytes]: (_ctx, [b]) => new Uint8Array([b ? 1 : 0]),

    // ---------- 文本字符串 → 值 ----------
    [rtKeys.strToI32]: (_ctx, [s]) => {
      const text = String(s).trim()
      return text ? parseInt(text, 10) | 0 : 0
    },
    [rtKeys.strToF64]: (_ctx, [s]) => {
      const text = String(s).trim()
      return text ? parseFloat(text) : 0
    },
    [rtKeys.strToBool]: (_ctx, [s]) => {
      const t = String(s).trim().toLowerCase()
      return t === 'true' || t === 't' ? 1 : 0
    },

    // ---------- 字节 → 值 ----------
    [rtKeys.bytesToI32]: (_ctx, [b]) => dataView(b as Uint8Array).getInt32(0, false),
    [rtKeys.bytesToF64]: (_ctx, [b]) => dataView(b as Uint8Array).getFloat64(0, false),
    [rtKeys.bytesToBool]: (_ctx, [b]) => ((b as Uint8Array)[0] ? 1 : 0),

    // ---------- 字符单位 → 值 ----------
    [rtKeys.charToI32]: (_ctx, [c]) =>
      typeof c === 'string' ? (c.length > 0 ? c.charCodeAt(0) : 0) : (c as number),
  }
}
