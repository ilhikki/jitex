import { PascalFileStore } from './runtime-type.ts'

export interface RunError {
  message: string
  stackTrace?: string[]
}

/**
 * 运行结果报告：只含「运行产生的东西」。
 *
 * 不回显编译产物——产物是调用方的输入，由调用方自己持有（原 jsCode 字段已删）。
 */
export interface RunState {
  status: 'running' | 'terminated' | 'error'
  steps: number
  error: RunError | undefined
  /** 运行结束后的文件系统内容（url → 字节，已用区域视图）。 */
  files: Map<string, PascalFileStore>
  debugLog: string[]
}
