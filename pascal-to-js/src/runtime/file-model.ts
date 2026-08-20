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
