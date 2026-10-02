export interface Artifact {
  name: string
  bytes: Uint8Array
}

export interface AssertionRecord {
  name: string
  passed: boolean
  actual?: unknown
  expected?: unknown
}

export type StageStatus = 'success' | 'failed' | 'skipped'

export class StageContext {
  readonly id: string
  readonly stageName: string
  status: StageStatus = 'success'
  durationMs = 0
  results: unknown = undefined
  artifacts: Artifact[] = []
  assertions: AssertionRecord[] = []
  logs: string[] = []
  stackTrace: string[] = []
  // Direct upstream cause, not the root cause.
  skipReason: string | null = null

  constructor(id: string, stageName: string) {
    this.id = id
    this.stageName = stageName
  }

  addArtifact(a: Artifact): void {
    this.artifacts.push(a)
  }

  addAssertion(a: AssertionRecord): void {
    this.assertions.push(a)
  }

  addLog(msg: string): void {
    this.logs.push(msg)
    emitSink(msg)
  }

  failWith(err: unknown): void {
    this.status = 'failed'
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error && err.stack ? err.stack.split('\n') : []
    this.stackTrace = [msg, ...stack]
  }

  skip(reason: string): void {
    this.status = 'skipped'
    this.skipReason = reason
    this.durationMs = 0
  }
}

export class RunContext {
  readonly runId: string
  readonly suiteName: string
  readonly config: Record<string, string>
  private stageStack: StageContext[] = []

  constructor(runId: string, suiteName: string, config: Record<string, string> = {}) {
    this.runId = runId
    this.suiteName = suiteName
    this.config = config
  }

  pushStage(s: StageContext): void {
    this.stageStack.push(s)
  }

  popStage(): StageContext | undefined {
    return this.stageStack.pop()
  }

  currentStage(): StageContext {
    const s = this.stageStack[this.stageStack.length - 1]
    if (!s) {
      throw new Error('no active stage context: this primitive must be called inside a stage fn')
    }
    return s
  }

  hasActiveStage(): boolean {
    return this.stageStack.length > 0
  }
}

let globalCtx: RunContext | undefined = undefined

export function setGlobalRunContext(ctx: RunContext | undefined): void {
  globalCtx = ctx
}

let activeSink: ((msg: string) => void) | undefined = undefined

export function setLogSink(sink: ((msg: string) => void) | undefined): void {
  activeSink = sink
}

function emitSink(msg: string): void {
  activeSink?.(msg)
}

// Sink only; never recorded in stage logs or the report.
export function emitLog(msg: string): void {
  emitSink(msg)
}

export function requireRunContext(): RunContext {
  if (!globalCtx) {
    throw new Error('no active run context')
  }
  return globalCtx
}

export function tryRunContext(): RunContext | undefined {
  return globalCtx
}

export function requireStageContext(): StageContext {
  return requireRunContext().currentStage()
}

export interface ExecContext {
  readonly config: Record<string, string>
  readonly runId: string
  readonly stageName: string
}

export function context(): ExecContext {
  const run = requireRunContext()
  const stageName = run.hasActiveStage() ? run.currentStage().stageName : ''
  return { config: run.config, runId: run.runId, stageName }
}
