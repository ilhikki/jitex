// ============================================================
// RuntimeContext
// ============================================================

/** 类型描述符（compiler.ts serializeTypeInfo 生成的序列化 TypeInfo，runtime 消费） */
export interface TypeDescriptor {
  tag: string
  low?: number
  high?: number
  dims?: Array<{ low: number; high: number }>
  elem?: TypeDescriptor
  fields?: Array<{ name: string; type: TypeDescriptor }>
}

// 注：文件状态作为 PascalFile 句柄的一部分（见 file-model.ts），不再放在 ctx 中。

/** 可增长的字节缓冲（文件内容）。
 *  data.length 即容量（limit），length 为已用字节数；容量不足时翻倍扩容。
 *  工具函数见 runtime-util.ts（createFileBuffer / appendFileBytes / fileBufferView）。 */
export interface FileBuffer {
  /** 底层存储；data.length 即容量（limit） */
  data: Uint8Array
  /** 已用字节数 */
  length: number
}

// ============================================================
// 读取状态（维护当前行 tokens）
// ============================================================

export interface ReadState {
  tokens: string[]
  tokenIdx: number
}

export interface RuntimeContext {
  outputBuffer: string[]
  inputQueue: string[]
  files: Map<string, FileBuffer>
  readState: ReadState
  steps: number
  maxSteps: number
  programFileUrls: Record<string, string>
  /** 非标特性扩展列表（见 AGENTS.md 原则 A 标准锚定）。
   * 默认未启用的非标特性遇到即抛错。
   */
  extensions: Set<string>
  /** 调试日志（e2e 报告消费，不写入临时文件）。
   * file.ts 不再使用；transform.ts 在编译/运行出错时追加诊断信息。 */
  debugLog: string[]
  jsCode: string | undefined
}

export interface RuntimeOptions {
  input?: string[]
  files?: Map<string, Uint8Array>
  programFileUrls?: Record<string, string>
  maxSteps?: number
  /** 非标特性扩展列表 */
  extensions?: string[]
  /** 额外 syscall 实现（key=syscallName，value=SyscallHandler；与编译期 extraCallables 的 sysCallName 对应） */
  extraSyscalls?: Record<string, SyscallHandler>
}

/** 单个 syscall 处理器：接收 ctx 与参数列表，返回结果 */
export type SyscallHandler = (ctx: RuntimeContext, args: unknown[]) => unknown
