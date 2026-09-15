// DSL 原语与 hook 实现。
//
// 六个原语：stage / suite / cache / assert / attach / log
//   语法糖：assertEquals / attachText / attachJson
// 两个 hook：before / after（suite 级）
//
// 类型体操：Unwrap / UnwrapAll 负责从 Stage<X> 元组解包结果元组。

import { requireRunContext, requireStageContext, tryRunContext } from './context.ts'
import type { Artifact, AssertionRecord } from './context.ts'

// 类型定义

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

// 声明期全局状态（suite 注册用）

let currentDeclSuite: Suite | undefined = undefined
let nextStageId = 1

/**
 * 声明期配置：CLI 的任意 `--key[=value]` 都会解析进这里。
 *
 * 必须在动态 import 入口（即触发 suite() 调用）之前注入；suite 会把同一个
 * 对象交给它的回调。未注入时是空对象，因此回调参数**保证非空**。
 */
let declConfig: Record<string, string> = {}

/** 声明期（suite 回调）产生的日志：此时 run 还没建立，先缓冲 */
const pendingDeclLogs: string[] = []

export function _setDeclConfig(config: Record<string, string>): void {
  declConfig = config
}

/** runner 用：run 建立后取走声明期日志，灌入 run 级日志 */
export function _drainDeclLogs(): string[] {
  return pendingDeclLogs.splice(0)
}

export function _resetDeclState(): void {
  currentDeclSuite = undefined
  nextStageId = 1
}

// suite

/**
 * 声明一个 suite。`fn` 立即执行以登记 stages/hooks，参数是本次 run 的配置
 * （CLI 的 `--key[=value]` 解析结果，形如 `{debug: 'false'}`），永远非空。
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

// cache（显式标记）

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

// assert 系列

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

// attach 系列

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
 * 输出一行日志。三个位置都能直接调用，不需要自己判断身处哪一层：
 *   - stage fn 内 → 当前 stage 的日志；
 *   - before / after hook 内 → run 级日志；
 *   - suite 回调（声明期，run 尚未建立）→ 先缓冲，run 开始时灌入 run 级日志。
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

// 供 runner 用：确认在 run 内但不在 stage 内（hook 期安全检查）

export function _ensureNoActiveStage(): void {
  const run = requireRunContext()
  if (run.hasActiveStage()) {
    throw new Error('this call must happen outside any stage fn')
  }
}
