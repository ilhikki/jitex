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
  /** 变体部分：一棵树，对应 AST 的 RecordVariantPartNode */
  variant?: VariantPartDescriptor
}

/** 变体部分描述符（对应 AST 的 RecordVariantPartNode） */
export interface VariantPartDescriptor {
  /** tag 字段名（case tag: type 中的 tag；无则 undefined） */
  tagName?: string
  branches: VariantBranchDescriptor[]
}

/** 单个变体分支描述符（对应 AST 的 RecordVariantNode） */
export interface VariantBranchDescriptor {
  /** case 标签的 ord 值集合（多标签共享同一分支） */
  labels: number[]
  /** 该分支的字段列表 */
  fields: Array<{ name: string; type: TypeDescriptor }>
  /** 嵌套变体（分支内还有 case 时） */
  nested?: VariantPartDescriptor
}

// ============================================================
// Handler 接口（预编译的类型行为，与值分离）
// ============================================================

/**
 * Record 行为 handler。
 * 编译期由 createRecHandler 一次性构建，运行时不变。
 * 不持有 TypeDescriptor，嵌套 record/array 通过子 handler 引用表达。
 * 大部分标量类型无 handler（undefined）。
 *
 * create/copy 返回包装后的 PascalRecord（带 handler），以便嵌套 record 字段
 * 能链式 rec.field 访问（内层 record 也持有自己的 handler）。
 */
export interface RecordHandler {
  /** 创建默认空 PascalRecord（fix 字段中 rec/array 用子 handler.create()；标量不初始化） */
  create(): PascalRecord
  /** 读取字段（含 a写b读 未定义行为检测） */
  get(value: RecordValue, key: string): unknown
  /** 设置字段（含变体切换时清空旧分支字段） */
  set(value: RecordValue, key: string, val: unknown): void
  /** 深拷贝值，返回带同一 handler 的新 PascalRecord */
  copy(value: RecordValue): PascalRecord
}

/** Array 行为 handler */
export interface ArrayHandler {
  /** 创建默认空 PascalArray */
  create(): PascalArray
  /** 获取元素（record 不存在时用元素 handler 创建） */
  get(value: ArrayValue, indices: number[]): unknown
  /** 设置元素 */
  set(value: ArrayValue, indices: number[], val: unknown): void
  /** 深拷贝值，返回带同一 handler 的新 PascalArray */
  copy(value: ArrayValue): PascalArray
}

/** 通用 handler 联合类型 */
export type TypeHandler = RecordHandler | ArrayHandler

// ============================================================
// 读取状态（维护当前行 tokens）
// ============================================================

export interface ReadState {
  tokens: string[]
  tokenIdx: number
}

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
  /**
   * runtime 固有能力：柯里化 syscall dispatcher。
   * 先按 key 取 syscall 函数，再传 args 调用：ctx.dispatch(key)(args)
   * 由 createDispatcher 反绑回 ctx（每个调用首次 lazy 绑定，共享同一闭包）。
   * syscall handler 之间互调一律走 ctx.dispatch，不裸 import 函数。
   * extraSyscalls 替换整套 syscall 实现，无需额外扩展参数。
   * createRuntimeContext 时为 undefined，由 createDispatcher 首次调用时 lazy 绑定。
   */
  dispatch?: (key: string) => (args: unknown[]) => unknown
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

export type PascalObject = PascalArray | PascalRecord | PascalCell | PascalSet | PascalFile

export type PascalArray = {
  kind: 'array'
  value: ArrayValue
  /** 大部分由 mem.default.array 创建的数组有 handler；手构数组（如 str.to.char.array）无 */
  handler: ArrayHandler | undefined
}

export type PascalRecord = {
  kind: 'record'
  value: RecordValue
  /** ✅ handler 在 PascalRecord 上，不在 RecordValue 上 */
  handler: RecordHandler
}

/** 数组的值结构（作为 ArrayHandler 方法的参数） */
export type ArrayValue = {
  array: unknown[]
  dims: DimsLink
  elementType?: TypeDescriptor | undefined
}

/** Record 的值结构（纯数据，作为 RecordHandler 方法的参数） */
export type RecordValue = {
  /** 固定字段值 */
  fix: Record<string, unknown>
  /** 变体运行时状态；未激活任何分支时为 undefined */
  variant: VariantState | undefined
}

/**
 * 变体运行时状态。
 * 同一时间只有一个分支活跃；切换分支时旧字段被清空。
 * 嵌套变体通过 nested 表达。
 */
export type VariantState = {
  /** 当前活跃分支索引 */
  branchIndex: number
  /** tag 字段当前值（读 tag 时返回） */
  tagValue: unknown
  /** 活跃分支的字段值；标量字段未 set 时不在此对象中（读取抛 "read unsetted field"） */
  fields: Record<string, unknown>
  /** 嵌套变体状态（分支内还有 case 时） */
  nested: VariantState | undefined
}

export type PascalCell = {
  kind: 'cell'
  value: unknown
}

export type PascalSet = {
  kind: 'set'
  value: Set<number>
}
