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
  /** 调试日志（e2e 报告消费，不写入临时文件）。
   * file.ts 不再使用；transform.ts 在编译/运行出错时追加诊断信息。 */
  debugLog: string[]
  jsCode: string | undefined
}

export interface RuntimeOptions {
  files?: Map<string, PascalFileStore>
  programFileUrls?: Record<string, string>
  maxSteps?: number
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
  /** f^ 写缓冲（ISO 6.5.5 buffer variable）：仅 blocks 写模式使用；读模式 f^ 直接从 store 取视图 */
  buffer: ByteHost | undefined
}
export type PascalFileStore = TextFile

export interface TextFile {
  // 位置
  seek(pos: number): void

  // 读取（原子原语）
  peekByte(): number | undefined // 查看当前字节
  advance(): void // 推进一个字节
  /** 从 pos 取 size 字节视图（不推进）；不足 size 返回 undefined */
  peekBytes(size: number): Uint8Array | undefined

  // 推进
  advanceBy(n: number): void

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

  /** 全部内容（产物导出用） */
  getData(): Uint8Array

  /** 当前行是否已有内容且以非 end-of-line 字符结尾（ISO 6.9.5 page 的隐式 writeln 判定） */
  currentLineHasContent(): boolean
}

export type PascalCell = {
  kind: 'cell'
  value: unknown
}

/**
 * 字节宿主：一块「既可按字节、也可按标量种类解释」的存储。
 *
 * 不用裸 Uint8Array 承载，是因为标量读写必须借 DataView，而 DataView 必须绑定
 * 某个 ArrayBuffer——裸视图拿不到 DataView，只能退化成「按 buffer 全局缓存
 * DataView」（原 dvCache）。把 DataView 与字节视图一起放进宿主，这个隐式全局
 * 状态就没有必要了，标量访问也能内联。
 *
 * bytes 可能是 subarray（自带 byteOffset）；dv 覆盖 bytes.buffer，由根宿主创建、
 * 子视图继承。标量访问的绝对偏移 = bytes.byteOffset + 编译期偏移。
 */
export interface ByteHost {
  bytes: Uint8Array
  dv: DataView
}
