import { requireRunContext, requireStageContext, tryRunContext } from './context.ts'
import type { Artifact, AssertionRecord } from './context.ts'

export interface Stage<R> {
  readonly __brand: 'Stage'
  readonly id: string
  readonly name: string
  readonly deps: readonly Stage<unknown>[]
  readonly fn: (results: unknown[]) => R | Promise<R>
  cacheable: boolean
  ownerSuite: Suite | undefined
}

export interface Suite {
  readonly __brand: 'Suite'
  readonly name: string
  readonly stages: Stage<unknown>[]
  beforeFn: (() => void | Promise<void>) | undefined
  afterFn: (() => void | Promise<void>) | undefined
}

export type CacheableValue = string | Uint8Array | number
export type CacheableRecord = Record<string, CacheableValue>

export type Unwrap<S> = S extends Stage<infer R> ? Awaited<R> : never
export type UnwrapAll<T extends readonly Stage<unknown>[]> = {
  [K in keyof T]: Unwrap<T[K]>
}

let currentDeclSuite: Suite | undefined = undefined
let nextStageId = 1

let declConfig: Record<string, string> = {}

const pendingDeclLogs: string[] = []

export function _setDeclConfig(config: Record<string, string>): void {
  declConfig = config
}

export function _drainDeclLogs(): string[] {
  return pendingDeclLogs.splice(0)
}

export function _resetDeclState(): void {
  currentDeclSuite = undefined
  nextStageId = 1
}

export function suite(name: string, fn: (config: Record<string, string>) => void): Suite {
  if (currentDeclSuite) {
    throw new Error(`nested suites not allowed: already inside '${currentDeclSuite.name}'`)
  }
  const s: Suite = {
    __brand: 'Suite',
    name,
    stages: [],
    beforeFn: undefined,
    afterFn: undefined,
  }
  currentDeclSuite = s
  nextStageId = 1
  try {
    fn(declConfig)
  } finally {
    currentDeclSuite = undefined
  }
  return s
}

export function stage<const T extends readonly Stage<unknown>[], R>(
  name: string,
  deps: T,
  fn: (results: UnwrapAll<T>) => R | Promise<R>,
): Stage<R> {
  if (!currentDeclSuite) {
    throw new Error(`stage('${name}') must be declared inside a suite block`)
  }
  const id = String(nextStageId++)
  const stageObj: Stage<R> = {
    __brand: 'Stage',
    id,
    name,
    deps,
    fn: fn as (results: unknown[]) => R | Promise<R>,
    cacheable: false,
    ownerSuite: currentDeclSuite,
  }
  currentDeclSuite.stages.push(stageObj as Stage<unknown>)
  return stageObj
}

export function cache<R extends CacheableRecord>(stage: Stage<R>): Stage<R> {
  if (!currentDeclSuite) {
    throw new Error(`cache() must be called inside a suite block`)
  }
  stage.cacheable = true
  return stage
}

export function before(fn: () => void | Promise<void>): void {
  if (!currentDeclSuite) {
    throw new Error('before() must be declared inside a suite block')
  }
  currentDeclSuite.beforeFn = fn
}

export function after(fn: () => void | Promise<void>): void {
  if (!currentDeclSuite) {
    throw new Error('after() must be declared inside a suite block')
  }
  currentDeclSuite.afterFn = fn
}

export class AssertionError extends Error {
  override name = 'AssertionError'
}

export function assert(cond: boolean, message: string): asserts cond {
  const ctx = requireStageContext()
  const rec: AssertionRecord = { name: message, passed: cond }
  ctx.addAssertion(rec)
  if (!cond) {
    throw new AssertionError(message)
  }
}

export function assertEquals<T>(actual: T, expected: T, message?: string): void {
  const msg = message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  const ctx = requireStageContext()
  const passed = Object.is(actual, expected)
  const rec: AssertionRecord = { name: msg, passed, actual: actual as unknown, expected: expected as unknown }
  ctx.addAssertion(rec)
  if (!passed) {
    throw new AssertionError(msg)
  }
}

export function attach(name: string, bytes: Uint8Array): void {
  const ctx = requireStageContext()
  const a: Artifact = { name, bytes }
  ctx.addArtifact(a)
  ctx.addLog(`attach ${name} (${bytes.length} bytes)`)
}

export function attachText(name: string, text: string): void {
  attach(name, new TextEncoder().encode(text))
}

export function attachJson(name: string, obj: unknown): void {
  attachText(name, JSON.stringify(obj, undefined, 2))
}

export function log(message: string): void {
  const run = tryRunContext()
  if (run === undefined) {
    pendingDeclLogs.push(message)
    return
  }
  if (run.hasActiveStage()) {
    run.currentStage().addLog(message)
    return
  }
  run.log(message)
}

export function _ensureNoActiveStage(): void {
  const run = requireRunContext()
  if (run.hasActiveStage()) {
    throw new Error('this call must happen outside any stage fn')
  }
}
