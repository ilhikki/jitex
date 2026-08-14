// 上下文栈：RunContext (顶层) + StageContext (当前 stage)
//
// DSL 原语 assert/attach/log 都写入栈顶 StageContext。
// 无 StageContext（suite 声明期 / hook 执行期）时调用这些原语 → 抛错。

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
  private stageStack: StageContext[] = []

  constructor(runId: string, suiteName: string) {
    this.runId = runId
    this.suiteName = suiteName
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
    if (!s) throw new Error('no active stage context: this primitive must be called inside a stage fn')
    return s
  }

  hasActiveStage(): boolean {
    return this.stageStack.length > 0
  }
}

// 全局运行时上下文（同一时间只允许一个 run 并发）
let globalCtx: RunContext | null = null

export function setGlobalRunContext(ctx: RunContext | null): void {
  globalCtx = ctx
}

export function requireRunContext(): RunContext {
  if (!globalCtx) throw new Error('no active run context')
  return globalCtx
}

export function requireStageContext(): StageContext {
  return requireRunContext().currentStage()
}
