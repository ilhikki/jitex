/*
 * 运行时类型：上下文、值与存储接口。
 *
 * runtime 不认识 Pascal 类型：类型在 rewrite 阶段被译成标量常量
 * （偏移 / 宽度 / key / 存储形态），这里只描述运行期值的形状。
 */

export interface RuntimeContext {
  files: Map<string, PascalFileStore>
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
  files?: Map<string, PascalFileStore>
  programFileUrls?: Record<string, string>
  maxSteps?: number
  /** 非标特性扩展列表 */
  extensions?: string[]
  /** 额外 syscall 实现（key=syscallName，value=SyscallHandler；与编译期 extraCallables 的 sysCallName 对应） */
  extraSyscalls?: Record<string, SyscallHandler>
}

/** 单个 syscall 处理器：接收 ctx 与参数列表，返回结果 */
export type SyscallHandler = (ctx: RuntimeContext, ...args: unknown[]) => unknown
export type Syscall = (...args: unknown[]) => unknown

export type PascalFile = {
  kind: 'file'
  value: PascalFileStore | undefined
  /** 编译期算定的存储形态：text / bytes / blocks（由 rewrite 传入，不含 Pascal 类型语义） */
  fileKind: string
}
export type PascalFileStore = TextFile | BlockStore

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

  /** 当前行是否已有内容且以非 end-of-line 字符结尾（ISO 6.9.5 page 的隐式 writeln 判定） */
  currentLineHasContent(): boolean
}

/**
 * 定长字节块存储：单位是一段定长字节（每个块大小由编译期算定）。
 */
export interface BlockStore {
  // 位置
  seek(pos: number): void

  // 读取（原子原语）
  peekBlock(): Uint8Array | undefined // 查看当前块
  advance(): void // 推进一块

  // 写入
  writeBlock(): void // 将 buffer 写入
  setBuffer(block: Uint8Array): void // 设置 f^
  getBuffer(): Uint8Array | undefined

  // 内容
  clear(): void

  // 模式
  setMode(mode: 'inspection' | 'generation'): void

  getMode(): 'inspection' | 'generation'

  // 查询
  hasMore(): boolean

  /** 全部块（调试 / 产物导出用） */
  getBlocks(): Uint8Array[]
}

export type PascalCell = {
  kind: 'cell'
  value: unknown
}
