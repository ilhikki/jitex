/*
 * 标量种类 → 字节视图读写 key 的映射。
 *
 * 依赖 rewrite 的类型布局概念 ScalarKind，属 compiler 内部；key 本身来自
 * runtime 契约（@jitex/runtime 的 rtKeys）。
 */

import { rtKeys } from '@jitex/runtime'
import type { ScalarKind } from './type-layout.ts'

/** 标量种类 → 字节视图读取 key */
export const bytesGetKey: Record<ScalarKind, string> = {
  int8: rtKeys.bytesGetInt8,
  uint8: rtKeys.bytesGetUint8,
  int16: rtKeys.bytesGetInt16,
  uint16: rtKeys.bytesGetUint16,
  int32: rtKeys.bytesGetInt32,
  float32: rtKeys.bytesGetFloat32,
}

/** 标量种类 → 字节视图写入 key */
export const bytesSetKey: Record<ScalarKind, string> = {
  int8: rtKeys.bytesSetInt8,
  uint8: rtKeys.bytesSetUint8,
  int16: rtKeys.bytesSetInt16,
  uint16: rtKeys.bytesSetUint16,
  int32: rtKeys.bytesSetInt32,
  float32: rtKeys.bytesSetFloat32,
}
