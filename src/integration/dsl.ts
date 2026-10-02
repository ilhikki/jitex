import { context as execContext, requireStageContext, tryRunContext } from './context.ts'
import type { Artifact, AssertionRecord, ExecContext } from './context.ts'

export interface Stage<R> {
  readonly __brand: 'Stage'
  readonly id: string
  readonly name: string
  readonly deps: readonly Stage<unknown>[]
  readonly fn: (results: unknown[]) => R | Promise<R>
  ownerSuite: Suite | undefined
}

export interface Suite {
  readonly __brand: 'Suite'
  readonly name: string
  readonly stages: Stage<unknown>[]
  beforeFn: (() => void | Promise<void>) | undefined
  afterFn: (() => void | Promise<void>) | undefined
}

export type Unwrap<S> = S extends Stage<infer R> ? Awaited<R> : never
export type UnwrapAll<T extends readonly Stage<unknown>[]> = {
  [K in keyof T]: Unwrap<T[K]>
}

let currentDeclSuite: Suite | undefined = undefined
let nextStageId = 1

export function suite(name: string, fn: () => void): Suite {
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
    fn()
  } finally {
    currentDeclSuite = undefined
  }
  return s
}

// Terminal methods fix deps; the callback gets one argument per dep in order.
export interface StageBuilder {
  nodeps<R>(fn: () => R | Promise<R>): Stage<R>
  dep<D extends Stage<unknown>, R>(dep: D, fn: (result: Unwrap<D>) => R | Promise<R>): Stage<R>
  deps<const D extends readonly Stage<unknown>[], R>(
    deps: D,
    fn: (...results: UnwrapAll<D>) => R | Promise<R>,
  ): Stage<R>
}

function registerStage<R>(
  name: string,
  deps: readonly Stage<unknown>[],
  fn: (results: unknown[]) => R | Promise<R>,
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
    fn,
    ownerSuite: currentDeclSuite,
  }
  currentDeclSuite.stages.push(stageObj as Stage<unknown>)
  return stageObj
}

export function stage(name: string): StageBuilder {
  return {
    nodeps<R>(fn: () => R | Promise<R>): Stage<R> {
      return registerStage<R>(name, [], () => fn())
    },
    dep<D extends Stage<unknown>, R>(dep: D, fn: (result: Unwrap<D>) => R | Promise<R>): Stage<R> {
      return registerStage<R>(name, [dep], (results) => fn(results[0] as Unwrap<D>))
    },
    deps<const D extends readonly Stage<unknown>[], R>(
      deps: D,
      fn: (...results: UnwrapAll<D>) => R | Promise<R>,
    ): Stage<R> {
      return registerStage<R>(name, deps, (results) => fn(...(results as UnwrapAll<D>)))
    },
  }
}

// Hooks run unconditionally when declared and sit outside the DAG:
// a failed before skips every stage, a failed after fails the run.
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

// Uses Object.is, not deep equality.
export function assertIs<T>(actual: T, expected: T, message?: string): void {
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
  if (run === undefined || !run.hasActiveStage()) {
    throw new Error('log() must be called inside a stage or hook body')
  }
  run.currentStage().addLog(message)
}

// Config and run metadata are only available during a run.
export function context(): ExecContext {
  return execContext()
}
