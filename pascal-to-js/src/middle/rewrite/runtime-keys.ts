/*
 * runtime syscall key 常量。
 *
 * 由 rewrite 产出、runtime handler 消费。命名约定：
 *   - 一律 'runtime.' 前缀；
 *   - 段名一律写完整单词，不用 i32 / f32 / arr / rec / mem / num / ptr 之类缩写；
 *   - 结构为 runtime.<域>.<动作>[.<限定>]。
 *
 * 与本文件对应的 lowering 侧 key（'lowering.' 前缀）定义在
 * src/middle/lowering/helpers.ts。lowering 产泛型 key + type 参数，
 * rewrite 消费 type 后产出这里的终态 key。
 */

import type { ScalarKind } from './type-layout.ts'

export const rtKeys = {
  // 整数运算
  int32Add: 'runtime.int32.add',
  int32Subtract: 'runtime.int32.subtract',
  int32Multiply: 'runtime.int32.multiply',
  int32Divide: 'runtime.int32.divide',
  int32Modulo: 'runtime.int32.modulo',
  int32Negate: 'runtime.int32.negate',
  int32Absolute: 'runtime.int32.absolute',
  int32Odd: 'runtime.int32.odd',
  int32And: 'runtime.int32.and',
  int32Or: 'runtime.int32.or',
  int32Not: 'runtime.int32.not',

  // 实数运算（单精度）
  float32Add: 'runtime.float32.add',
  float32Subtract: 'runtime.float32.subtract',
  float32Multiply: 'runtime.float32.multiply',
  float32Divide: 'runtime.float32.divide',
  float32Negate: 'runtime.float32.negate',
  float32Absolute: 'runtime.float32.absolute',
  float32SquareRoot: 'runtime.float32.squareRoot',
  float32Sine: 'runtime.float32.sine',
  float32Cosine: 'runtime.float32.cosine',
  float32Exponential: 'runtime.float32.exponential',
  float32Logarithm: 'runtime.float32.logarithm',
  float32Arctangent: 'runtime.float32.arctangent',

  // 布尔运算
  booleanAnd: 'runtime.boolean.and',
  booleanOr: 'runtime.boolean.or',
  booleanNot: 'runtime.boolean.not',

  // 比较
  compareEqual: 'runtime.compare.equal',
  compareNotEqual: 'runtime.compare.notEqual',
  compareLess: 'runtime.compare.less',
  compareLessOrEqual: 'runtime.compare.lessOrEqual',
  compareGreater: 'runtime.compare.greater',
  compareGreaterOrEqual: 'runtime.compare.greaterOrEqual',

  // 集合
  setUnion: 'runtime.set.union',
  setIntersection: 'runtime.set.intersection',
  setDifference: 'runtime.set.difference',
  setEqual: 'runtime.set.equal',
  setNotEqual: 'runtime.set.notEqual',
  setSubset: 'runtime.set.subset',
  setSuperset: 'runtime.set.superset',
  setContains: 'runtime.set.contains',
  setRange: 'runtime.set.range',
  setSingleton: 'runtime.set.singleton',
  setLiteral: 'runtime.set.literal',

  // 值表示转换
  castCharToInt32: 'runtime.cast.char.to.int32',
  castBooleanToInt32: 'runtime.cast.boolean.to.int32',
  castInt32ToChar: 'runtime.cast.int32.to.char',
  castFloat32ToInt32: 'runtime.cast.float32.to.int32',
  castFloat32ToInt32Round: 'runtime.cast.float32.to.int32.round',

  // 指针
  pointerDereference: 'runtime.pointer.dereference',
  pointerAssign: 'runtime.pointer.assign',
  pointerDisposeCheck: 'runtime.pointer.disposeCheck',

  rangeCheck: 'runtime.range.check',

  // 文件
  fileReset: 'runtime.file.reset',
  fileRewrite: 'runtime.file.rewrite',
  fileGet: 'runtime.file.get',
  filePeek: 'runtime.file.peek',
  filePut: 'runtime.file.put',
  // 文本文件的 `f^ := ch`：char 以 ord 值承载，需转回字符写（由 rewrite 按元素类型选定）
  filePutCharacter: 'runtime.file.putCharacter',
  fileReadCharacter: 'runtime.file.readCharacter',
  fileReadToken: 'runtime.file.readToken',
  fileWrite: 'runtime.file.write',
  fileReadln: 'runtime.file.readln',
  fileWriteln: 'runtime.file.writeln',
  fileEof: 'runtime.file.eof',
  fileEoln: 'runtime.file.eoln',
  filePage: 'runtime.file.page',
  fileCreate: 'runtime.file.create',
  fileProgramUrl: 'runtime.file.programUrl',

  // 值 ↔ 文件单位转换
  convertInt32ToText: 'runtime.convert.int32.to.text',
  convertInt32ToBytes: 'runtime.convert.int32.to.bytes',
  convertInt32ToChar: 'runtime.convert.int32.to.char',
  convertBytesToTextField: 'runtime.convert.bytes.to.text.field',
  convertFloat32ToText: 'runtime.convert.float32.to.text',
  convertFloat32ToBytes: 'runtime.convert.float32.to.bytes',
  convertBooleanToText: 'runtime.convert.boolean.to.text',
  convertBooleanToBytes: 'runtime.convert.boolean.to.bytes',
  convertTextToInt32: 'runtime.convert.text.to.int32',
  convertTextToFloat32: 'runtime.convert.text.to.float32',
  convertTextToBoolean: 'runtime.convert.text.to.boolean',
  convertBytesToInt32: 'runtime.convert.bytes.to.int32',
  convertBytesToFloat32: 'runtime.convert.bytes.to.float32',
  convertBytesToBoolean: 'runtime.convert.bytes.to.boolean',
  convertCharToInt32: 'runtime.convert.char.to.int32',

  // 内存与视图
  memoryNew: 'runtime.memory.new',
  memoryCopy: 'runtime.memory.copy',
  memoryClone: 'runtime.memory.clone',
  viewSubarray: 'runtime.view.subarray',

  // 字节视图上的标量读写：每个 key 固定一种标量种类，无运行期类型分派
  bytesGetInt8: 'runtime.bytes.get.int8',
  bytesGetUint8: 'runtime.bytes.get.uint8',
  bytesGetInt16: 'runtime.bytes.get.int16',
  bytesGetUint16: 'runtime.bytes.get.uint16',
  bytesGetInt32: 'runtime.bytes.get.int32',
  bytesGetFloat32: 'runtime.bytes.get.float32',
  bytesSetInt8: 'runtime.bytes.set.int8',
  bytesSetUint8: 'runtime.bytes.set.uint8',
  bytesSetInt16: 'runtime.bytes.set.int16',
  bytesSetUint16: 'runtime.bytes.set.uint16',
  bytesSetInt32: 'runtime.bytes.set.int32',
  bytesSetFloat32: 'runtime.bytes.set.float32',

  // 数组（object 表示：元素是 file / pointer 等 JS 值）
  arrayGetObject: 'runtime.array.get.object',
  arraySetObject: 'runtime.array.set.object',
  // 部分下标视图（a[i] 对二维数组返回子数组视图，而非元素）
  arraySublist: 'runtime.array.sublist',
  arrayPack: 'runtime.array.pack',
  arrayUnpack: 'runtime.array.unpack',

  // 记录（object 表示）
  recordGetField: 'runtime.record.get.field',
  recordSetField: 'runtime.record.set.field',
  recordClone: 'runtime.record.clone',

  // object 表示的默认值构造：字段名 / 元素值由 rewrite 在编译期展开为实参
  objectNewRecord: 'runtime.object.new.record',
  objectNewArray: 'runtime.object.new.array',

  cellNew: 'runtime.cell.new',
  cellGet: 'runtime.cell.get',
  cellSet: 'runtime.cell.set',

  // 间接调用：args = [callee, ...actualArgs]，callee 为函数值
  callIndirect: 'runtime.call.indirect',
} as const

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
