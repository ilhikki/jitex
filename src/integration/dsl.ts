// DSL primitives and hook implementation.
//
// Six primitives: stage / suite / cache / assert / attach / log
//   Syntactic sugar: assertEquals / attachText / attachJson
// Two hooks: before / after (suite-level)
//
// Type gymnastics: Unwrap / UnwrapAll unpack result tuples from Stage<X> tuples.

import { requireRunContext, requireStageContext, tryRunContext } from './context.ts'
import type { Artifact, AssertionRecord } from './context.ts'

// Type definitions

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

// Declaration-phase global state (for suite registration)

let currentDeclSuite: Suite | undefined = undefined
let nextStageId = 1

/**
 * Declaration-phase config: any `--key[=value]` from the CLI is parsed into this.
 *
 * Must be injected before the dynamic import of the entry (which triggers the
 * suite() call); suite hands the same object to its callback. When not injected
 * it is an empty object, so the callback parameter is guaranteed non-empty.
 */
let declConfig: Record<string, string> = {}

/** Logs produced during the declaration phase (suite callback): the run is not yet established, so buffer them first */
const pendingDeclLogs: string[] = []

export function _setDeclConfig(config: Record<string, string>): void {
  declConfig = config
}

/** For runner: after the run is established, take the declaration-phase logs and feed them into run-level logs */
export function _drainDeclLogs(): string[] {
  return pendingDeclLogs.splice(0)
}

export function _resetDeclState(): void {
  currentDeclSuite = undefined
  nextStageId = 1
}

// suite

/**
 * Declare a suite. `fn` runs immediately to register stages/hooks; its argument
 * is the config for this run (parsed from CLI `--key[=value]`, e.g.
 * `{debug: 'false'}`), always non-empty.
 */
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

// stage

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

// cache (explicit marking)

export function cache<R extends CacheableRecord>(stage: Stage<R>): Stage<R> {
  if (!currentDeclSuite) {
    throw new Error(`cache() must be called inside a suite block`)
  }
  stage.cacheable = true
  return stage
}

// before / after

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

// assert family

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

// attach family

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

// log

/**
 * Emit a log line. Can be called directly from three places without needing to
 * know which layer you are in:
 *   - inside a stage fn -> current stage's logs;
 *   - inside a before / after hook -> run-level logs;
 *   - inside the suite callback (declaration phase, run not yet established) -> buffered first, fed into run-level logs when the run starts.
 */
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

// For runner: ensure we are inside a run but not inside a stage (hook-phase safety check)

export function _ensureNoActiveStage(): void {
  const run = requireRunContext()
  if (run.hasActiveStage()) {
    throw new Error('this call must happen outside any stage fn')
  }
}
