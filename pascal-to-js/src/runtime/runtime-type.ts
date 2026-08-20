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
  files: Map<string, PascalFileStore>
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
  files?: Map<string, PascalFileStore>
  programFileUrls?: Record<string, string>
  maxSteps?: number
  /** 非标特性扩展列表 */
  extensions?: string[]
  /** 额外 syscall 实现（key=syscallName，value=SyscallHandler；与编译期 extraCallables 的 sysCallName 对应） */
  extraSyscalls?: Record<string, SyscallHandler>
}

/** 单个 syscall 处理器：接收 ctx 与参数列表，返回结果 */
export type SyscallHandler = (ctx: RuntimeContext, args: unknown[]) => unknown

export type PascalFile = {
  kind: 'file'
  value: PascalFileStore | undefined
}
export type PascalFileStore = TextFile | RecordFile

export interface TextFile {
  // 位置
  seek(pos: number): void

  // 读取（原子原语）
  peekByte(): number | undefined // 查看当前字节
  advance(): void // 推进一个字节

  // 写入
  writeByte(byte: number): void

  writeBytes(data: Uint8Array): void

  // 内容
  clear(): void

  // 模式
  setMode(mode: 'inspection' | 'generation'): void

  getMode(): 'inspection' | 'generation'

  // 查询
  hasMore(): boolean
}

export interface RecordFile {
  // 位置
  seek(pos: number): void

  // 读取（原子原语）
  peekRecord(): PascalRecord | undefined // 查看当前记录
  advance(): void // 推进一条记录

  // 写入
  writeRecord(): void // 将 buffer 写入文件
  setBuffer(record: PascalRecord): void // 设置 f^
  getBuffer(): PascalRecord | undefined
  // 内容
  clear(): void

  // 模式
  setMode(mode: 'inspection' | 'generation'): void

  getMode(): 'inspection' | 'generation'

  // 查询
  hasMore(): boolean

  getType(): unknown | undefined

  setType(type: unknown): void
}

export interface DimsLink {
  next?: DimsLink | undefined
  low: number
  high: number
  deep: number
}

export interface DimsLink {
  next?: DimsLink | undefined
  low: number
  high: number
  deep: number
}

export type PascalObject = PascalArray | PascalRecord | PascalCell | PascalSet

export type PascalArray = {
  kind: 'array'
  value: {
    array: unknown[]
    dims: DimsLink
    elementType?: TypeDescriptor | undefined
  }
}

export type PascalRecord = {
  kind: 'record'
  value: Record<string, unknown>
}

export type PascalCell = {
  kind: 'cell'
  value: unknown
}

export type PascalSet = {
  kind: 'set'
  value: Set<number>
}
