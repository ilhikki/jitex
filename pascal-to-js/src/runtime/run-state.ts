import { PascalFileStore } from './runtime-type.ts'

export interface RunError {
  message: string
  stackTrace?: string[]
}

export interface RunState {
  status: 'running' | 'terminated' | 'error'
  steps: number
  error: RunError | null
  jsCode: string | undefined
  /** 运行结束后的文件系统内容（url → 字节，已用区域视图）。 */
  files: Map<string, PascalFileStore>
  debugLog: string[]
}
