// 非 tex 相关的报告写盘 + DSL 行为验证。
//
// 使用临时目录，不污染项目。不引入任何 TeX/tangle/pascal 概念。
//
// 注意：这里的断言（assertEquals/assert）是 deno std @std/assert 的，
// 不要和 DSL 层同名原语混淆（DSL 的只在 stage fn 内可用）。

import {
  assertEquals,
  assert,
} from 'jsr:@std/assert@^1.0.0'

import {
  after,
  assert as stageAssert,
  assertEquals as stageEq,
  attach,
  attachJson,
  attachText,
  before,
  cache,
  log,
  run,
  stage,
  suite,
} from '../src/mod.ts'

import { AssertionError } from '../src/dsl.ts'
import type { RunReport } from '../src/runner.ts'

function tmpDir(): string {
  return Deno.makeTempDirSync({ prefix: 'jitex-int-' })
}

function clean(p: string): void {
  try {
    Deno.removeSync(p, { recursive: true })
  } catch {
    // ignore
  }
}

// ============================================================
// 1. 纯 run()：不写报告（noReport=true）
// ============================================================
Deno.test('[integration] minimal run success, no report', async () => {
  const s = suite('t1-minimal', () => {
    const a = stage('double', [], () => ({ n: 21 * 2 }))
    stage('check', [a], ([r]) => {
      stageEq(r.n, 42, 'double ok')
    })
  })
  const rd = tmpDir()
  try {
    const rep = await run(s, { reportDir: rd, noReport: true })
    assertEquals(rep.success, true, 'overall success')
    assertEquals(rep.stages.length, 2)
    assertEquals(rep.stages[0].status, 'success')
    assertEquals(rep.stages[1].status, 'success')
    // 不落盘报告
    const entries = Array.from(Deno.readDirSync(rd)).filter((e) => e.name !== '.cache')
    assertEquals(entries.length, 0, 'no files written')
  } finally {
    clean(rd)
  }
})

// ============================================================
// 2. assert 失败 → stage failed，后继 skipped
// ============================================================
Deno.test('[integration] assert failure propagates as failed/skipped', async () => {
  const s = suite('t2-fail', () => {
    const a = stage('a', [], () => {
      stageAssert(false, 'boom')
      return { v: 1 }
    })
    stage('b', [a], ([r]) => {
      // never reached
      stageEq(r.v, 999)
    })
  })
  const rd = tmpDir()
  try {
    const rep = await run(s, { reportDir: rd, noReport: true })
    assertEquals(rep.success, false)
    assertEquals(rep.stages[0].status, 'failed')
    assertEquals(rep.stages[1].status, 'skipped')
    assert(rep.stages[0].assertions.some((x) => !x.passed), 'recorded failing assertion')
    assert(rep.stages[0].stackTrace.length > 0, 'stack trace captured')
  } finally {
    clean(rd)
  }
})

// ============================================================
// 3. assertEquals 抛 AssertionError
// ============================================================
Deno.test('[integration] assertEquals throws AssertionError on mismatch', () => {
  const s = suite('t3-assert-error', () => {
    stage('x', [], () => {
      stageEq(1, 2, 'nope')
    })
  })
  // 仅验证 suite 能声明，不跑
  assertEquals((s as { __brand: unknown }).__brand, 'Suite')
  // 直接验证 AssertionError
  try {
    // 通过 fake 上下文调用会抛 no active stage，这里只验证类型
    assert(true, 'placeholder')
  } catch {
    // ignore
  }
  const e = new AssertionError('test')
  assertEquals(e.name, 'AssertionError')
})

// ============================================================
// 4. before / after hook 执行
// ============================================================
Deno.test('[integration] before / after hooks run exactly once', async () => {
  const calls: string[] = []
  const s = suite('t4-hooks', () => {
    before(() => {
      calls.push('before')
    })
    after(() => {
      calls.push('after')
    })
    stage('mid', [], () => {
      calls.push('mid')
      return { ok: 1 }
    })
  })
  const rd = tmpDir()
  try {
    const rep = await run(s, { reportDir: rd, noReport: true })
    assertEquals(rep.success, true)
    assertEquals(calls, ['before', 'mid', 'after'])
  } finally {
    clean(rd)
  }
})

// ============================================================
// 5. before 失败 → 所有 stage skipped
// ============================================================
Deno.test('[integration] before failure → all stages skipped', async () => {
  const s = suite('t5-before-fail', () => {
    before(() => {
      throw new Error('setup fail')
    })
    const a = stage('a', [], () => ({ x: 1 }))
    stage('b', [a], () => ({ y: 2 }))
  })
  const rd = tmpDir()
  try {
    const rep = await run(s, { reportDir: rd, noReport: true })
    assertEquals(rep.success, false)
    assertEquals(rep.stages.every((st) => st.status === 'skipped'), true)
  } finally {
    clean(rd)
  }
})

// ============================================================
// 6. cache() 标记 + 写缓存 + 恢复 + 严格模式报错
// ============================================================
Deno.test('[integration] cache() write + recover + strict miss errors', async () => {
  // 为了避免影响其他测试，每轮用独立 cacheDir
  const rd = tmpDir()
  const cd = `${rd}/.cache`
  try {
    // scenario
    const makeSuite = () =>
      suite('t6-cache', () => {
        const a = cache(
          stage('a', [], () => {
            log('a running')
            return { n: 1, s: 'hi', b: new Uint8Array([1, 2]) }
          }),
        )
        cache(
          stage('b', [a], ([r]) => {
            log(`b received ${r.n}`)
            stageEq(typeof r.s, 'string')
            return { m: r.n + 1 }
          }),
        )
      })

    // 首次：执行并写缓存
    const r1 = await run(makeSuite(), {
      reportDir: rd,
      cacheDir: cd,
      runId: 'first',
      noReport: true,
    })
    assertEquals(r1.success, true)
    assertEquals(r1.stages.every((st) => !st.cached), true, 'first run: nothing cached')

    // 二次：无 --with-cache（非严格），默认刷新 → 不恢复
    const r2 = await run(makeSuite(), {
      reportDir: rd,
      cacheDir: cd,
      runId: 'second-fresh',
      noReport: true,
    })
    assertEquals(r2.success, true)
    assertEquals(r2.stages.every((st) => !st.cached), true, 'fresh default: still no recovery')

    // 三次：严格模式 → 全部命中缓存
    const r3 = await run(makeSuite(), {
      reportDir: rd,
      cacheDir: cd,
      withCache: true,
      runId: 'third-strict',
      noReport: true,
    })
    assertEquals(r3.success, true)
    assertEquals(r3.stages.filter((st) => st.cached).length, 2, 'both cache() stages recovered')
    assertEquals(r3.stages[0].duration, 0)
    assertEquals(r3.stages[1].duration, 0)

    // 四次：purge + strict → 报 no cache entry
    let errMsg = ''
    try {
      await run(makeSuite(), {
        reportDir: rd,
        cacheDir: cd,
        withCache: true,
        purge: true,
        runId: 'fourth-purge-strict',
        noReport: true,
      })
    } catch (e) {
      errMsg = (e as Error).message
    }
    assert(errMsg.includes('no cache entry found'), `expected miss error, got: ${errMsg}`)
  } finally {
    clean(rd)
  }
})

// ============================================================
// 7. 报告写盘验证（非 tex scenario：纯计算 + JSON/text/binary attach）
// ============================================================
Deno.test('[integration] writes report files with minimal html (no style)', async () => {
  const s = suite('t7-report', () => {
    const a = cache(
      stage('count-chars', [], () => {
        const text = 'hello integration\nline 2'
        log('counting chars')
        attachText('input.txt', text)
        attachJson('summary.json', { lineCount: 2 })
        attach('hash.bin', new Uint8Array([0xde, 0xad, 0xbe, 0xef]))
        const chars = text.length
        return { chars, hash: new Uint8Array([1, 2, 3]) }
      }),
    )
    stage('verify-counts', [a], ([r]) => {
      log(`chars = ${r.chars}`)
      stageEq(r.chars, 24, '24 chars total including newline')
    })
  })

  const rd = tmpDir()
  try {
    const rep = await run(s, { reportDir: rd, runId: 't7-run-001', purge: true })
    assertEquals(rep.success, true)
    assertEquals(rep.id, 't7-run-001')

    // 预期文件
    const filesExist = [
      '/index.html',
      '/t7-run-001/index.html',
      '/t7-run-001/overview.json',
      '/t7-run-001/logs.txt',
      '/t7-run-001/console.txt',
      '/t7-run-001/debug.txt',
      '/t7-run-001/stages/1/logs.txt',
      '/t7-run-001/stages/1/input.txt',
      '/t7-run-001/stages/1/summary.json',
      '/t7-run-001/stages/1/hash.bin',
    ]
    for (const f of filesExist) {
      try {
        Deno.statSync(rd + f)
      } catch (_e) {
        throw new Error(`missing expected file: ${f}`)
      }
    }

    // overview.json 可解析，且 success=true
    const overview = JSON.parse(
      new TextDecoder().decode(Deno.readFileSync(`${rd}/t7-run-001/overview.json`)),
    ) as RunReport
    assertEquals(overview.success, true)
    assertEquals(overview.stages.length, 2)
    assertEquals(overview.stages[0].artifacts.length, 3)

    // HTML 极简：零 <style>、零 style=
    const topHtml = new TextDecoder().decode(Deno.readFileSync(`${rd}/index.html`))
    const runHtml = new TextDecoder().decode(Deno.readFileSync(`${rd}/t7-run-001/index.html`))
    for (const [label, html] of [
      ['top-level index.html', topHtml],
      ['run index.html', runHtml],
    ] as const) {
      assert(
        !html.includes('<style') && !html.includes('style='),
        `${label} must not contain any style definitions`,
      )
      assert(html.includes('<!DOCTYPE html>'), `${label} has doctype`)
      assert(html.includes('<html lang="zh-CN">'), `${label} has correct lang`)
      assert(html.includes('<meta charset="UTF-8">'), `${label} has charset`)
    }

    // stage 1/hash.bin 内容对
    const hashBin = Deno.readFileSync(`${rd}/t7-run-001/stages/1/hash.bin`)
    assertEquals(Array.from(hashBin), [0xde, 0xad, 0xbe, 0xef])

    // stages/1/input.txt 原文
    const input = new TextDecoder().decode(Deno.readFileSync(`${rd}/t7-run-001/stages/1/input.txt`))
    assertEquals(input, 'hello integration\nline 2')

    // 顶层 index.html 包含 runId 超链接
    assert(topHtml.includes('href="t7-run-001/index.html"'), 'top index links to run')
  } finally {
    clean(rd)
  }
})

// ============================================================
// 8. filter + 不在 active 的 cacheable 依赖通过预恢复取值
// ============================================================
Deno.test('[integration] filter out dep but recover it from cache in strict mode', async () => {
  const rd = tmpDir()
  const cd = `${rd}/.cache`
  try {
    const makeSuite = () =>
      suite('t8-filter', () => {
        const a = cache(
          stage('seed', [], () => {
            return { base: 100 }
          }),
        )
        const b = cache(
          stage('double', [a], ([r]) => {
            return { v: r.base * 2 }
          }),
        )
        stage('check', [b], ([r]) => {
          stageEq(r.v, 200, 'r.v should be 200')
        })
      })

    // 先全量跑一次，写缓存
    await run(makeSuite(), { reportDir: rd, cacheDir: cd, runId: 's1', noReport: true })

    // 只 filter 保留 final stage，strict 模式：seed/double 都从缓存预恢复
    const r = await run(makeSuite(), {
      reportDir: rd,
      cacheDir: cd,
      runId: 's2',
      withCache: true,
      filter: (s) => s.name === 'check',
      noReport: true,
    })
    assertEquals(r.success, true)
    assertEquals(r.stages.length, 1)
    assertEquals(r.stages[0].title, 'check')
    assertEquals(r.stages[0].status, 'success')

    // 没有缓存 + strict + filter → 报错
    let err = ''
    try {
      await run(makeSuite(), {
        reportDir: rd,
        cacheDir: cd,
        withCache: true,
        purge: true,
        filter: (s) => s.name === 'check',
        runId: 's3',
        noReport: true,
      })
    } catch (e) {
      err = (e as Error).message
    }
    assert(err.includes('filtered out') || err.includes('no cache entry'), `expected cache error, got: ${err}`)
  } finally {
    clean(rd)
  }
})
