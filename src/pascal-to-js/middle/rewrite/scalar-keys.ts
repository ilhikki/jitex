import { rtKeys } from '@jitex/runtime'
import type { ScalarKind } from './type-layout.ts'

export const bytesGetKey: Record<ScalarKind, string> = {
  int8: rtKeys.bytesGetInt8,
  uint8: rtKeys.bytesGetUint8,
  int16: rtKeys.bytesGetInt16,
  uint16: rtKeys.bytesGetUint16,
  int32: rtKeys.bytesGetInt32,
  float32: rtKeys.bytesGetFloat32,
}

export const bytesSetKey: Record<ScalarKind, string> = {
  int8: rtKeys.bytesSetInt8,
  uint8: rtKeys.bytesSetUint8,
  int16: rtKeys.bytesSetInt16,
  uint16: rtKeys.bytesSetUint16,
  int32: rtKeys.bytesSetInt32,
  float32: rtKeys.bytesSetFloat32,
}
