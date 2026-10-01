export interface RuntimeContext {
  files: Map<string, PascalFileStore>
  steps: number
  maxSteps: number
  programFileUrls: Record<string, string>
  debugLog: string[]
}

export interface RuntimeOptions {
  files?: Map<string, PascalFileStore>
  programFileUrls?: Record<string, string>
  maxSteps?: number
  extraSyscalls?: Record<string, SyscallHandler>
}

export type SyscallHandler = (ctx: RuntimeContext, ...args: unknown[]) => unknown

export type SyscallTable = Record<string, SyscallHandler>

export type PascalFile = {
  kind: 'file'
  value: PascalFileStore | undefined
  fileKind: string
  buffer: ByteHost | undefined
}

export interface PascalFileStore {
  seek(pos: number): void

  peekByte(): number | undefined
  advance(): void
  peekBytes(size: number): Uint8Array | undefined

  advanceBy(n: number): void

  writeByte(byte: number): void

  writeBytes(data: Uint8Array): void

  clear(): void

  setMode(mode: 'inspection' | 'generation'): void

  getMode(): 'inspection' | 'generation'

  hasMore(): boolean

  getData(): Uint8Array

  currentLineHasContent(): boolean
}

export type PascalCell = {
  kind: 'cell'
  value: unknown
}

export interface ByteHost {
  bytes: Uint8Array
  dv: DataView
}
