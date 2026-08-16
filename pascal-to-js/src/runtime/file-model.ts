/**
 * Pascal 文件模型（ISO 7185 6.4.3.5 / 6.6.5.2 / 6.10）。
 *
 * 设计原则（用户指示）：
 *   - 文件状态是句柄的一部分，不放在 ctx 中。
 *   - 底层存储用 bytes（ctx.files 的 value，Uint8Array），不用 string 拼接。
 *
 * 一个 PascalFile 实例 = 一个文件句柄（file-variable 的运行时表示）。
 * reset/rewrite/get/put/read/write 等操作直接读写句柄上的状态字段，
 * 并把外部内容同步到 ctx.files.get(url)。
 *
 * file of record 的记录列表、缓冲区也作为句柄字段，避免引入额外的状态表。
 * recTypeDesc 用 unknown 避免 file-model ↔ runtime-type 循环依赖，
 * 实际类型为 TypeDescriptor（由 compiler 传入，runtime 消费）。
 */
export interface PascalFile {
  /** 外部文件绑定名（ISO 6.10：impl-defined binding；本工程用 ctx.files 的 key） */
  url: string
  /** 当前读位置（字节偏移） */
  offset: number
  /** 是否到达文件末尾 */
  eof: boolean
  /** 是否处于 generation 状态（rewrite 后为 true） */
  writable: boolean

  // ---- file of record（ISO 7185 6.4.3.5）----
  /** 记录列表（文件内容的反序列化形式） */
  recList?: unknown[]
  /** 当前读取位置（index into recList） */
  recPos?: number
  /** 当前缓冲区 (f^) */
  recBuffer?: unknown
  /** 元素类型描述（TypeDescriptor；unknown 避免循环依赖） */
  recTypeDesc?: unknown
}
