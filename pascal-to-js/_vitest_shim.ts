/**
 * Vitest-compatible shim for Deno.
 *
 * 目标：让 import { describe, test, expect, afterAll } from 'vitest' 的代码
 * 在 Deno 环境下无需修改直接运行。底层用 Deno.test + jsr:@std/assert。
 *
 * 覆盖的 API：
 *   - describe(name, fn): 测试分组。fn 内部同步执行，注册的 test 名带前缀。
 *   - test(name, fn): 注册单个用例 → Deno.test(prefixedName, fn)
 *   - afterAll(fn): 当前 describe 块最后追加一个 Deno.test("[afterAll] ...", fn)
 *   - expect(x): 链式断言对象，支持：
 *       .toBe(y) / .toEqual(y)        → assertEquals
 *       .toContain(x)                 → assertStringIncludes / assertArrayIncludes
 *       .toThrow(msg?)                → assertThrows
 *       .toBeTruthy() / .toBeFalsy()  → assert / assertFalse
 *       .toBeNull() / .toBeUndefined()
 *       .toHaveLength(n)
 *       .toBeGreaterThan(n)
 *       .not.上述任意 matcher
 *       .fail(msg?)                   → 直接抛 AssertionError
 */

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
  assertArrayIncludes,
  assertThrows,
  assert,
  assertFalse,
  AssertionError,
} from 'jsr:@std/assert'

// ============================================================
// describe / test / afterAll 实现
// ============================================================

interface DescribeFrame {
  prefixParts: string[]
  afterAllFns: Array<() => void | Promise<void>>
}

const describeStack: DescribeFrame[] = []

export function describe(name: string, fn: () => void): void {
  const frame: DescribeFrame = {
    prefixParts: [...currentPrefixParts(), name],
    afterAllFns: [],
  }
  describeStack.push(frame)
  try {
    fn()
  } finally {
    // 如果有 afterAll 回调，追加一个 Deno.test 让它在该 describe 所有真实 test 之后运行
    if (frame.afterAllFns.length > 0) {
      const fns = [...frame.afterAllFns]
      const afterAllName = buildName(frame.prefixParts) + ' > [afterAll]'
      Deno.test(afterAllName, async () => {
        for (const f of fns) await f()
      })
    }
    describeStack.pop()
  }
}

export function test(
  name: string,
  fn: () => void | Promise<void>,
  timeoutMs?: number,
): void {
  const parts = currentPrefixParts()
  const fullName = parts.length > 0 ? buildName([...parts, name]) : name
  if (timeoutMs !== undefined) {
    // Deno 2.x 通过 options 设置单条 test 超时。注意：字段名在 Deno 版本间可能是 expireIn / timeout。
    // 这里先尝试 expireIn，如果 CLI 全局超时更严格仍会被截断，因此 benchmark 仍建议配合 --timeout 使用。
    ;(Deno.test as unknown as (
      def: { name: string; fn: () => void | Promise<void>; expireIn?: number }
    ) => void)({
      name: fullName,
      fn,
      expireIn: timeoutMs,
    })
  } else {
    Deno.test(fullName, fn)
  }
}

export { test as it }

export function afterAll(fn: () => void | Promise<void>): void {
  if (describeStack.length === 0) {
    // 顶层 afterAll：注册成一个 final test
    Deno.test('[afterAll: top-level]', async () => {
      await fn()
    })
    return
  }
  describeStack[describeStack.length - 1].afterAllFns.push(fn)
}

function currentPrefixParts(): string[] {
  if (describeStack.length === 0) return []
  return describeStack[describeStack.length - 1].prefixParts
}

function buildName(parts: string[]): string {
  return parts.join(' > ')
}

// ============================================================
// expect 链式断言
// ============================================================

export interface ExpectMatchers {
  toBe(expected: unknown): void
  toEqual(expected: unknown): void
  toContain(expected: unknown): void
  toThrow(expectedMsg?: string): void
  toBeTruthy(): void
  toBeFalsy(): void
  toBeNull(): void
  toBeUndefined(): void
  toBeDefined(): void
  toHaveLength(n: number): void
  toBeGreaterThan(n: number): void
  readonly not: ExpectMatchers
}

class ExpectImpl implements ExpectMatchers {
  private readonly actual: unknown
  private readonly negate: boolean

  constructor(actual: unknown, negate = false) {
    this.actual = actual
    this.negate = negate
  }

  get not(): ExpectMatchers {
    return new ExpectImpl(this.actual, !this.negate) as unknown as ExpectMatchers
  }

  // ---- core helpers ----
  private check(cond: boolean, passMsg: string, failMsg: string): void {
    const ok = this.negate ? !cond : cond
    if (!ok) {
      throw new AssertionError(this.negate ? failMsg : passMsg)
    }
  }

  private eq(a: unknown, b: unknown): boolean {
    try {
      assertEquals(a, b)
      return true
    } catch {
      return false
    }
  }

  // ---- matchers ----
  toBe(expected: unknown): void {
    // Vitest 的 toBe 用 Object.is；对于基本类型与 toEqual 等价。这里用 assertEquals。
    this.check(
      this.eq(this.actual, expected),
      `expected ${Deno.inspect(this.actual)} to be ${Deno.inspect(expected)}`,
      `expected ${Deno.inspect(this.actual)} NOT to be ${Deno.inspect(expected)}`,
    )
  }

  toEqual(expected: unknown): void {
    this.toBe(expected)
  }

  toContain(expected: unknown): void {
    const { actual } = this
    if (typeof actual === 'string' && typeof expected === 'string') {
      this.check(
        actual.includes(expected),
        `expected string to contain ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        `expected string NOT to contain ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      )
      return
    }
    if (Array.isArray(actual)) {
      try {
        assertArrayIncludes(actual, [expected] as [unknown])
        this.check(
          !this.negate,
          '',
          `expected array NOT to contain ${Deno.inspect(expected)}`,
        )
      } catch (e) {
        this.check(
          false,
          e instanceof Error ? e.message : `expected array to contain ${Deno.inspect(expected)}`,
          '',
        )
      }
      return
    }
    // 其他类型：用 @std/assert 的断言统一抛出
    try {
      if (typeof actual === 'string') {
        assertStringIncludes(actual, String(expected))
      } else if (Array.isArray(actual)) {
        assertArrayIncludes(actual, [expected] as [unknown])
      } else {
        throw new AssertionError(
          `.toContain() only supports string or array, got ${typeof actual}`,
        )
      }
      this.check(!this.negate, '', '')
    } catch (e) {
      if (this.negate) return // not 匹配成功
      throw e
    }
  }

  toThrow(expectedMsg?: string): void {
    const fn = this.actual as () => unknown
    if (typeof fn !== 'function') {
      throw new AssertionError(`expected a function for .toThrow(), got ${typeof fn}`)
    }
    try {
      assertThrows(fn as () => unknown, Error, expectedMsg)
      this.check(
        !this.negate,
        '',
        `expected function NOT to throw${expectedMsg ? ` with "${expectedMsg}"` : ''}`,
      )
    } catch (e) {
      if (this.negate) return
      throw e
    }
  }

  toBeTruthy(): void {
    this.check(
      Boolean(this.actual),
      `expected ${Deno.inspect(this.actual)} to be truthy`,
      `expected ${Deno.inspect(this.actual)} to be falsy`,
    )
  }

  toBeFalsy(): void {
    this.check(
      !Boolean(this.actual),
      `expected ${Deno.inspect(this.actual)} to be falsy`,
      `expected ${Deno.inspect(this.actual)} to be truthy`,
    )
  }

  toBeNull(): void {
    this.check(
      this.actual === null,
      `expected ${Deno.inspect(this.actual)} to be null`,
      `expected ${Deno.inspect(this.actual)} NOT to be null`,
    )
  }

  toBeUndefined(): void {
    this.check(
      this.actual === undefined,
      `expected ${Deno.inspect(this.actual)} to be undefined`,
      `expected ${Deno.inspect(this.actual)} NOT to be undefined`,
    )
  }

  toBeDefined(): void {
    this.check(
      this.actual !== undefined,
      `expected ${Deno.inspect(this.actual)} to be defined (not undefined)`,
      `expected ${Deno.inspect(this.actual)} to be undefined`,
    )
  }

  toHaveLength(n: number): void {
    const len = (this.actual as { length?: number }).length
    this.check(
      typeof len === 'number' && len === n,
      `expected length ${n}, got ${Deno.inspect(len)}`,
      `expected length NOT to be ${n}, got ${Deno.inspect(len)}`,
    )
  }

  toBeGreaterThan(n: number): void {
    const v = this.actual as number
    this.check(
      typeof v === 'number' && v > n,
      `expected ${v} to be greater than ${n}`,
      `expected ${v} NOT to be greater than ${n}`,
    )
  }
}

interface ExpectStatic {
  (actual: unknown): ExpectMatchers
  fail(message?: string): never
}

export const expect = ((actual: unknown) => {
  return new ExpectImpl(actual) as unknown as ExpectMatchers
}) as ExpectStatic

expect.fail = function (message?: string): never {
  throw new AssertionError(message ?? 'expect.fail() called')
}

// 兼容：某些代码里 expect.fail 作为 expect 对象的属性
;(ExpectImpl.prototype as unknown as Record<string, unknown>).fail = function (
  this: ExpectImpl,
  message?: string,
): never {
  throw new AssertionError(message ?? 'expect.fail() called')
}

export default {
  describe,
  test,
  it: test,
  expect,
  afterAll,
}
