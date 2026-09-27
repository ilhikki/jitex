import { PascalFileStore } from './runtime-type.ts'

/**
 * 运行结果报告：只含「运行产生的东西」。
 *
 * 不回显编译产物——产物是调用方的输入，由调用方自己持有（原 jsCode 字段已删）。
 */
export interface RunState {
  status: 'running' | 'terminated' | 'error'
  steps: number
  /** 执行期抛出的异常，原样保留；非 Error 的抛出物已在 exec 的边界包成 Error */
  error: Error | undefined
  /** 运行结束后的文件系统内容（url → 字节，已用区域视图）。 */
  files: Map<string, PascalFileStore>
  debugLog: string[]
}
