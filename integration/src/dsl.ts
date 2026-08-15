// DSL 原语与 hook 实现。
//
// 六个原语：stage / suite / cache / assert / attach / log
//   语法糖：assertEquals / attachText / attachJson
// 两个 hook：before / after（suite 级）
//
// 类型体操：Unwrap / UnwrapAll 负责从 Stage<X> 元组解包结果元组。

import { requireRunContext, requireStageContext } from './context.ts'
import type { Artifact, AssertionRecord } from './context.ts'

// ------------------------------------------------------------
// 类型定义
// ------------------------------------------------------------

export interface Stage<R> {
  readonly __brand: 'Stage'
  readonly id: string
  readonly name: string
  readonly deps: readonly Stage<unknown>[]
  readonly fn: (results: unknown[]) => R | Promise<R>
  cacheable: boolean
  ownerSuite: Suite | null
}

export interface Suite {
  readonly __brand: 'Suite'
  readonly name: string
  readonly stages: Stage<unknown>[]
  beforeFn: (() => void | Promise<void>) | null
  afterFn: (() => void | Promise<void>) | null
}

export type CacheableValue = string | Uint8Array | number
export type CacheableRecord = Record<string, CacheableValue>

export type Unwrap<S> = S extends Stage<infer R> ? Awaited<R> : never
export type UnwrapAll<T extends readonly Stage<unknown>[]> = {
  [K in keyof T]: Unwrap<T[K]>
}

// ------------------------------------------------------------
// 声明期全局状态（suite 注册用）
// ------------------------------------------------------------

let currentDeclSuite: Suite | null = null
let nextStageId = 1

export function _resetDeclState(): void {
  currentDeclSuite = null
  nextStageId = 1
}

// ------------------------------------------------------------
// suite
// ------------------------------------------------------------

export function suite(name: string, fn: () => void): Suite {
  if (currentDeclSuite) {
    throw new Error(`nested suites not allowed: already inside '${currentDeclSuite.name}'`)
  }
  const s: Suite = {
    __brand: 'Suite',
    name,
    stages: [],
    beforeFn: null,
    afterFn: null,
  }
  currentDeclSuite = s
  nextStageId = 1
  try {
    fn()
  } finally {
    currentDeclSuite = null
  }
  return s
}

// ------------------------------------------------------------
// stage
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// cache（显式标记）
// ------------------------------------------------------------

export function cache<R extends CacheableRecord>(stage: Stage<R>): Stage<R> {
  if (!currentDeclSuite) {
    throw new Error(`cache() must be called inside a suite block`)
  }
  stage.cacheable = true
  return stage
}

// ------------------------------------------------------------
// before / after
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// assert 系列
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// attach 系列
// ------------------------------------------------------------

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
  attachText(name, JSON.stringify(obj, null, 2))
}

// ------------------------------------------------------------
// log
// ------------------------------------------------------------

export function log(message: string): void {
  const ctx = requireStageContext()
  ctx.addLog(message)
}

// ------------------------------------------------------------
// 供 runner 用：确认在 run 内但不在 stage 内（hook 期安全检查）
// ------------------------------------------------------------

export function _ensureNoActiveStage(): void {
  const run = requireRunContext()
  if (run.hasActiveStage()) {
    throw new Error('this call must happen outside any stage fn')
  }
}
