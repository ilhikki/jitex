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
