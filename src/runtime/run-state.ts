import { PascalFileStore } from './runtime-type.ts'

export interface RunState {
  status: 'running' | 'terminated' | 'error'
  iterations: number
  error: Error | undefined
  files: Map<string, PascalFileStore>
  debugLog: string[]
}
