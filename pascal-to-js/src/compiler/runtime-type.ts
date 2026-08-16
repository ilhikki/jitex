// ============================================================
// RuntimeContext
// ============================================================

import { IlPlugin } from '@/compiler/plugin.ts'
import { PascalFile } from '@/runtime/index.ts'

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
// 文件状态（同步版本，逻辑参考 file-model.ts 的 RecordFileState）
// ============================================================

export interface FileState {
  offset: number
  eof: boolean
  writable: boolean
  lines: string[]
  currentLine: string
  /**
   * 终端回显：TTY 文件当前行尾 \n 是否已回显。
   * input_ln 的 while not eoln(f) 循环不消费 \n，getFile 不会回显它。
   * 但真实终端在用户按 Enter 时会回显换行。isFileEoln 检测到行尾时
   * 回显 \n（仅一次）， getFile 消费 \n 时重置此标记。
   */
  ttyEolnEchoed?: boolean
  /**
   * Pascal-H 文件模型：RESET 后 F^ 未定义，需要 GET 预读第一个字符。
   * 标准 Pascal (ISO 7185 6.9.8.1) 中 RESET 后 F^ 已指向第一个字符。
   * 启用 extension 'pascalHFileModel' 后，RESET 设置此标记为 true。
   * GET 时若此标记为 true，清除标记不推进 offset（模拟"预读"语义）。
   * F^/EOF/EOLN 在此标记为 true 时返回未定义/空值。
   */
  pascalHPreread?: boolean
  /**
   * 二进制字节文件标记（file of byte / file of eight_bits，elem 为 subrange）。
   * writeBackFile 时用 Latin-1 编码（每字符一字节），不加末尾换行，
   * 避免 UTF-8 多字节编码破坏 DVI/TFM 等二进制产物。
   */
  binary?: boolean
  /**
   * file of record: 文件元素类型 tag（'rec'/'array' 等）。
   * 由 file.rec.reset / file.rec.rewrite 设置，closeFile 据此选择序列化方式。
   */
  fileElemTag?: string
  /**
   * file of record: 记录列表（文件内容）。
   * rewrite 时清空，put 时追加，reset 时从文件内容反序列化。
   */
  recList?: unknown[]
  /** file of record: 当前读取位置（index into recList） */
  recPos?: number
  /** file of record: 当前缓冲区 (f^) */
  recBuffer?: unknown
  /** file of record: 元素类型描述（用于创建默认记录，由 compiler 传入） */
  recTypeDesc?: TypeDescriptor
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
  files: Map<string, Uint8Array>
  fileStates: WeakMap<PascalFile, FileState>
  readState: ReadState
  steps: number
  maxSteps: number
  programFileUrls: Record<string, string>
  /** 非标特性扩展列表（见 AGENTS.md 原则 A 标准锚定）。
   * 默认未启用的非标特性遇到即抛错。
   */
  extensions: Set<string>
  /** 编译期注入的插件（运行期提供 syscall 实现，AGENTS.md 原则 A.7） */
  plugins: IlPlugin[]
  /** 调试日志（e2e 报告消费，不写入临时文件）。
   * 收集运行期诊断信息：pool 文件读取追踪、文件 IO 异常等。
   * 由 e2e 测试通过 RuntimeOptions.debugLog 注入并读取。 */
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
  /** 编译期注入的插件（运行期提供 syscall 实现） */
  plugins?: IlPlugin[]
  /** 调试日志缓冲区（外部传入以复用，不传则内部新建） */
  debugLog?: string[]
}

/** 单个 syscall 处理器：接收 ctx 与参数列表，返回结果 */
export type SyscallHandler = (ctx: RuntimeContext, args: unknown[]) => unknown
