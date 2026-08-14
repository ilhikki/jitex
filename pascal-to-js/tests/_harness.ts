/**
 * JITEX 项目测试 harness（纯 Deno 原生实现）。
 *
 * 提供四件套：
 *   - describe(name, fn)      测试分组名前缀，不嵌套 Deno.test（保持测试数量稳定）
 *   - test(name, fn, ms?)     注册单个用例 → Deno.test(prefixedName, fn[, expireIn])
 *   - it = test               别名
 *   - afterAll(fn)            当前 describe 结束后追加一个 [afterAll] 用例
 *   - assert(cond, message)   最基础的布尔断言，失败抛 AssertionError
 *   - assertEquals(a, b, msg) 深层结构相等断言，失败抛 AssertionError 并附带差异
 *
 * 设计取舍：
 *   - 不使用 Deno.test 的 t.step 嵌套结构，避免测试计数和之前不一致。
 *   - 不引入 describe.skip / test.todo 等未使用的高级 API。
 *   - assertEquals 直接重导出 jsr:@std/assert 的实现，保持与 Deno 生态一致。
 */

import { assertEquals, AssertionError } from 'jsr:@std/assert@^1.0.0'
export { assertEquals }

// ============================================================
// describe / test / afterAll
// ============================================================

interface Frame {
  prefixParts: string[]
  afterAllFns: Array<() => void | Promise<void>>
}

const stack: Frame[] = []

export function describe(name: string, fn: () => void): void {
  const frame: Frame = {
    prefixParts: stack.length > 0 ? [...stack[stack.length - 1].prefixParts, name] : [name],
    afterAllFns: [],
  }
  stack.push(frame)
  try {
    fn()
  } finally {
    if (frame.afterAllFns.length > 0) {
      const fns = [...frame.afterAllFns]
      const afterName = frame.prefixParts.join(' > ') + ' > [afterAll]'
      Deno.test(afterName, async () => {
        for (const f of fns) await f()
      })
    }
    stack.pop()
  }
}

export function test(
  name: string,
  fn: () => void | Promise<void>,
  timeoutMs?: number,
): void {
  const parts = stack.length > 0 ? stack[stack.length - 1].prefixParts : []
  const fullName = parts.length > 0 ? [...parts, name].join(' > ') : name
  if (timeoutMs !== undefined) {
    ;(Deno.test as unknown as (
      def: { name: string; fn: () => void | Promise<void>; expireIn?: number },
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
  if (stack.length === 0) {
    Deno.test('[afterAll: top-level]', async () => await fn())
    return
  }
  stack[stack.length - 1].afterAllFns.push(fn)
}

// ============================================================
// assert
// ============================================================

export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new AssertionError(message ?? 'assertion failed')
  }
}

// ============================================================
// assertKind — 类型安全的 kind 判别式断言 (Type Guard)
// ============================================================

/**
 * 断言 node 的 kind 等于 expectedKind，并利用 TypeScript `asserts`
 * 将 node 收窄为对应的具体类型，从而无需 `as any` 即可安全访问属性。
 *
 * 用法示例：
 *   assertKind(result.astNode, 'IntegerLiteral')
 *   assertEquals(result.astNode.value, 42)  // 类型安全，无需 any
 */
export function assertKind<T extends { kind: string }, K extends T['kind']>(
  node: T | undefined | null,
  expectedKind: K,
  message?: string,
): asserts node is Extract<T, { kind: K }> {
  assertEquals(
    node?.kind,
    expectedKind,
    message ?? `kind mismatch: expected '${expectedKind}', got '${node?.kind as string}'`,
  )
}
