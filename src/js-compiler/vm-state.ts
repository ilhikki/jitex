export interface VMError {
  message: string
  instructionIndex: number
  stackTrace: string[]
}

export interface VMState {
  status: 'running' | 'terminated' | 'error'
  outputBuffer: string[]
  inputQueue: string[]
  globals: Map<string, unknown> | Record<string, unknown>
  callStack: unknown[]
  steps: number
  stepsExecuted?: number
  error: VMError | null
  pc?: number
  currentProc?: string
  returnValue?: unknown
}
