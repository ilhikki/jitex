/*
 * runtime syscall key 常量（runtime ↔ compiler 的公开契约）。
 *
 * 由 rewrite 产出、runtime handler 消费。命名约定：
 *   - 一律 'runtime.' 前缀；
 *   - 段名一律写完整单词，不用 i32 / f32 / arr / rec / mem / num / ptr 之类缩写；
 *   - 结构为 runtime.<域>.<动作>[.<限定>]。
 *
 * 两条比结构更要紧的约定（违反它们 = 把类型泄漏到运行期）：
 *
 *   1. **域 = 值的宿主表示，不是 Pascal 概念**。
 *      域描述的是「这个 key 操作哪种 JS 值」，不是「对应哪个 Pascal 类型」。
 *      Pascal 概念名（record / array / set / pointer / memory …）会让人误以为
 *      一个 key 承载了一整个 Pascal 类型，进而容忍它按 Pascal 类型在运行期分派。
 *      例：record.clone 的 record 是 Pascal 概念，而实参其实是 JS 普通对象，
 *      应叫 object.clone（= object.new 的对偶，见第 3 条）。
 *
 *   2. **一个 key 只对应一种宿主表示**。值的形态差异必须由 rewrite 选进 key，
 *      不能靠实参承载后由 handler 再判。
 *      例：file.write 的实参曾是 Uint8Array | string | number 三种，只能靠
 *      `instanceof` + `String()` 猜；拆成 write.text / .byte / .bytes / .block
 *      后每个 handler 的实参形态都是唯一确定的。
 *
 *   3. **clone 与 create 一一对应**。clone 的粒度必须与 create 一致：构造某种
 *      宿主表示有一个 key，深拷贝它就有一个同域 key。用一个泛型 clone 兜住
 *      所有表示，等于把「这个值是什么表示」的问题原样还给运行期。
 *      见 object.new/object.clone、objectarray.new/objectarray.clone、
 *      bytes.alloc/bytes.clone。
 *
 * 本文件是 runtime 与 compiler 之间唯一的依赖契约：compiler 的 rewrite 层产出
 * 这里的 key，runtime 的 handler 按 key 分派。与本文件对应的 lowering 侧 key
 * （'lowering.' 前缀）定义在 compiler 的 middle/lowering/helpers.ts：lowering
 * 产泛型 key + type 参数，rewrite 消费 type 后产出这里的终态 key。
 */

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

  // 位图集合运算（宿主表示：Uint8Array 位图）
  bitmapUnion: 'runtime.bitmap.union',
  bitmapIntersection: 'runtime.bitmap.intersection',
  bitmapDifference: 'runtime.bitmap.difference',
  bitmapEqual: 'runtime.bitmap.equal',
  bitmapNotEqual: 'runtime.bitmap.notEqual',
  bitmapSubset: 'runtime.bitmap.subset',
  bitmapSuperset: 'runtime.bitmap.superset',
  bitmapContains: 'runtime.bitmap.contains',
  bitmapRange: 'runtime.bitmap.range',
  bitmapSingleton: 'runtime.bitmap.singleton',

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

  hookFunctionEnter: 'runtime.debug.hook.function.enter',

  // debug 构建专属的检查原语。
  //
  // **只有 debug 构建才会产出这些 key**（见 compiler 的 TransformOptions.debug，
  // 默认 true）：非 debug 构建里 rewrite 根本不生成它们，运行期零开销；debug
  // 构建里它们是独立 syscall，不追求性能。
  //
  // 注意：非 debug 构建跳过这些检查时，ISO 7185 定为 error 的情形
  // （6.7.2.2 除数为 0 / 负数、6.4.2.4 子界越界）变为实现定义行为。
  debugRangeCheck: 'runtime.debug.range.check', // [v, lo, hi]
  debugStepsCheck: 'runtime.debug.steps.check', // []
  debugDivideCheck: 'runtime.debug.divide.check', // [divisor] → divisor
  debugModuloCheck: 'runtime.debug.modulo.check', // [divisor] → divisor
  debugAssertView: 'runtime.debug.assert.view', // [view, label] → view

  // 文件
  //
  // 多态边界：get / peek / read 按 fileKind（text / bytes / blocks）分派读写语义，
  // 但存储实现统一为 TextFile（连续字节流）；blocks 的 record size 由 rewriter
  // 内联到操作参数（sizeOf），不在文件对象上记录。f^ 写缓冲是 PascalFile 的属性。
  // 写入路径（write.* / put.buffer.*）不在此列：值的宿主表示已由 rewrite 选进 key，
  // handler 不再做任何类型判断。
  fileReset: 'runtime.file.reset',
  fileRewrite: 'runtime.file.rewrite',
  fileGet: 'runtime.file.get',
  filePeek: 'runtime.file.peek',
  /** put(f)：把缓冲区落盘；仅定长块存储需要 */
  filePut: 'runtime.file.put',
  /** `f^ := x`（blocks）：值是记录字节视图 */
  filePutBufferBlock: 'runtime.file.put.buffer.block',
  /** `f^ := x`（file of byte）：值是单个字节 */
  filePutBufferByte: 'runtime.file.put.buffer.byte',
  /** `f^ := x`（text，elem 为 char）：值是 1 字符 string */
  filePutBufferCharacter: 'runtime.file.put.buffer.character',
  /** `f^ := x`（text，elem 非 char）：值是格式化后的文本 */
  filePutBufferText: 'runtime.file.put.buffer.text',
  /** 读一个文本单位（含行结束符语义） */
  fileReadCharacter: 'runtime.file.read.character',
  /** 读一个 token（跳过前导空白，读到下一空白） */
  fileReadToken: 'runtime.file.read.token',
  /** 写文本单位：值是 string */
  fileWriteText: 'runtime.file.write.text',
  /** 写单个字节：值是 number（file of byte） */
  fileWriteByte: 'runtime.file.write.byte',
  /** 写字节序列：值是 Uint8Array（char 数组 / 二进制转换结果） */
  fileWriteBytes: 'runtime.file.write.bytes',
  /** 写一个定长块：值是 Uint8Array（file of record） */
  fileWriteBlock: 'runtime.file.write.block',
  fileReadln: 'runtime.file.readln',
  fileWriteln: 'runtime.file.writeln',
  fileEof: 'runtime.file.eof',
  fileEoln: 'runtime.file.eoln',
  filePage: 'runtime.file.page',
  fileCreate: 'runtime.file.create',
  fileProgramUrl: 'runtime.file.program.url',

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

  // 内存与视图（宿主表示：ByteHost = { bytes, dv }）
  bytesHost: 'runtime.bytes.host',
  bytesAlloc: 'runtime.bytes.alloc',
  bytesCopy: 'runtime.bytes.copy',
  bytesClone: 'runtime.bytes.clone',
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

  // 数组（object 表示：宿主是 {base, offset} 视图，元素为 file / pointer 等 JS 值）
  objectArrayGet: 'runtime.objectarray.get',
  objectArraySet: 'runtime.objectarray.set',
  // 部分下标视图（a[i] 对二维数组返回子数组视图，而非元素）
  objectArraySublist: 'runtime.objectarray.sublist',
  // 子数组 ↔ 字节视图的搬运
  bytesPack: 'runtime.bytes.pack',
  bytesUnpack: 'runtime.bytes.unpack',

  // 对象（object 表示：宿主是 JS 普通对象，字段名 → 值）
  objectGet: 'runtime.object.get',
  objectSet: 'runtime.object.set',

  // object 表示的构造 / 深拷贝。
  //
  // **clone 与 create 一一对应**：每个「构造某种宿主表示」的 key 都有一个同域的
  // 深拷贝 key，粒度必须一致 —— 不能用一个泛型 clone 兜住所有表示（那等于把
  // 「这个值是什么表示」重新丢给运行期判断）：
  //   object.new      ↔ object.clone        普通对象
  //   objectarray.new ↔ objectarray.clone   {base, offset} 视图
  //   bytes.alloc     ↔ bytes.clone         Uint8Array
  // file / cell 是引用语义（ISO 7185 拷 identifying-value），故无 clone。
  objectNew: 'runtime.object.new',
  objectClone: 'runtime.object.clone',
  objectArrayNew: 'runtime.objectarray.new',
  objectArrayClone: 'runtime.objectarray.clone',

  /**
   * 槽赋值：把值写入一个变量槽。
   *
   * **必须内联**（见 compiler 的 codegen：semantic-compiler.ts）：走 dispatcher
   * 时实参只能拿到槽的值而非引用，无法赋值。内联为 `(x = v)`，与直接的 JS 赋值等价。
   */
  assign: 'runtime.assign',

  /**
   * 求值序列（闭包）：`noValue(e1, …, en)` 顺序求值，交出 `undefined`。
   *
   * 给 rewrite 提供"在一个表达式里做多件事"的能力（如 write 的多项、readln 的多次
   * 写回）——这些语义在源语言里是过程（语句），出现在表达式位置时需要一个出口。
   *
   * **必须内联**为立即执行函数；参数 >= 2（只有一项时规则应直接返回该项，不必包裹）。
   */
  closureNoValue: 'runtime.closure.noValue',

  cellNew: 'runtime.cell.new',
  cellGet: 'runtime.cell.get',
  cellSet: 'runtime.cell.set',

  // 间接调用：args = [callee, ...actualArgs]，callee 为函数值
  callIndirect: 'runtime.call.indirect',
} as const
