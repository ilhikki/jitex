// 运行时状态（JS 编译器执行结果）

export interface RunError {
  message: string
  stackTrace?: string[]
}

export interface RunState {
  status: 'running' | 'terminated' | 'error'
  outputBuffer: string[]
  inputQueue: string[]
  steps: number
  error: RunError | null
}
