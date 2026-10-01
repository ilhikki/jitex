// Context stack: RunContext (top level) + StageContext (current stage)
//
// DSL primitives assert/attach/log all write to the top StageContext.
// Calling these primitives without a StageContext (during suite declaration /
// hook execution) throws.

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
  cached = false

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
}

export class RunContext {
  readonly runId: string
  readonly suiteName: string
  stages: StageContext[] = []
  runLogs: string[] = []
  private stageStack: StageContext[] = []

  constructor(runId: string, suiteName: string) {
    this.runId = runId
    this.suiteName = suiteName
  }

  log(msg: string): void {
    this.runLogs.push(msg)
    emitSink(msg)
  }

  pushStage(s: StageContext): void {
    this.stageStack.push(s)
    this.stages.push(s)
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

// Global runtime context (only one run allowed concurrently at a time)
let globalCtx: RunContext | undefined = undefined

export function setGlobalRunContext(ctx: RunContext | undefined): void {
  globalCtx = ctx
}

// Log sink: every message from log / addLog is forwarded here in real time (console by default).
// runner injects it via setLogSink and clears it after the run ends.
let activeSink: ((msg: string) => void) | undefined = undefined

export function setLogSink(sink: ((msg: string) => void) | undefined): void {
  activeSink = sink
}

function emitSink(msg: string): void {
  activeSink?.(msg)
}

export function requireRunContext(): RunContext {
  if (!globalCtx) {
    throw new Error('no active run context')
  }
  return globalCtx
}

/** Nullable version: inside the suite callback (declaration phase) the run is not yet established, so ask "is there a run now" */
export function tryRunContext(): RunContext | undefined {
  return globalCtx
}

export function requireStageContext(): StageContext {
  return requireRunContext().currentStage()
}
