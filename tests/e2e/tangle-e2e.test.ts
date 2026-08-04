/**
 * TANGLE / TEX82 端到端测试。
 *
 * 阶段流水线（每阶段复用上一阶段结果，失败则停止后续阶段）：
 *   1. parse tangle-official.pas
 *   2. compile tangle to JS
 *   3. run tangle on tangle.web → tangle.pas (v1)
 *   4. parse tangle.pas (v1)
 *   5. bootstrap: run tangle.pas (v1) on tangle.web → tangle.pas (v2)
 *   6. verify v1 === v2 (自举稳定性)
 *   7. run tangle on tex.web → tex.pas
 *   8. parse tex.pas
 */
import { parse } from '@/index'
import { transform } from '@/il/transform'
import { readResource, runTangle, TANGLE_PAS, TANGLE_WEB, TEX_WEB } from './_helper'
import { describe, test, expect, beforeAll } from 'vitest'

describe('TANGLE / TEX82 E2E', () => {
  // 共享状态：每个阶段的结果
  const ctx = {
    tanglePas: '',
    tangleWeb: '',
    texWeb: '',
    compiledJs: '',
    v1: null as null | { pascal: string; pool: string; output: string; status: string; error?: string },
    v1ParseOk: false,
    v2: null as null | { pascal: string; pool: string; output: string; status: string; error?: string },
    tex: null as null | { pascal: string; pool: string; output: string; status: string; error?: string },
    texParseOk: false,
    /** 前置阶段是否失败。失败后后续阶段全部跳过。 */
    failedAt: '' as string,
  }

  beforeAll(() => {
    ctx.tanglePas = readResource(TANGLE_PAS)
    ctx.tangleWeb = readResource(TANGLE_WEB)
    ctx.texWeb = readResource(TEX_WEB)

    // ---- 阶段 1: parse tangle-official.pas ----
    try {
      const result = parse(ctx.tanglePas)
      if (!result.success) {
        ctx.failedAt = '1.parse'
        return
      }
    } catch {
      ctx.failedAt = '1.parse'
      return
    }

    // ---- 阶段 2: compile tangle to JS ----
    try {
      ctx.compiledJs = transform(ctx.tanglePas, {
        extensions: ['string'],
        programFileUrls: {
          WEBFILE: 'WEBFILE',
          CHANGEFILE: 'CHANGEFILE',
          PASCALFILE: 'PASCALFILE',
          POOL: 'POOL',
        },
      })
    } catch {
      ctx.failedAt = '2.compile'
      return
    }

    // ---- 阶段 3: run tangle on tangle.web → v1 ----
    try {
      const r = runTangle(ctx.tanglePas, ctx.tangleWeb)
      ctx.v1 = {
        pascal: r.pascal,
        pool: r.pool,
        output: r.output,
        status: r.state.status,
        error: r.state.error?.message,
      }
      if (r.state.status !== 'terminated') {
        ctx.failedAt = '3.run-tangle'
        return
      }
    } catch (e: any) {
      ctx.v1 = { pascal: '', pool: '', output: '', status: 'error', error: e?.message }
      ctx.failedAt = '3.run-tangle'
      return
    }

    // ---- 阶段 4: parse tangle.pas (v1) ----
    try {
      const result = parse(ctx.v1!.pascal)
      ctx.v1ParseOk = result.success
    } catch {
      ctx.v1ParseOk = false
    }

    // ---- 阶段 5: bootstrap: run tangle.pas (v1) on tangle.web → v2 ----
    try {
      const r = runTangle(ctx.v1!.pascal, ctx.tangleWeb)
      ctx.v2 = {
        pascal: r.pascal,
        pool: r.pool,
        output: r.output,
        status: r.state.status,
        error: r.state.error?.message,
      }
    } catch (e: any) {
      ctx.v2 = { pascal: '', pool: '', output: '', status: 'error', error: e?.message }
    }

    // ---- 阶段 7: run tangle on tex.web → tex.pas ----
    try {
      const r = runTangle(ctx.tanglePas, ctx.texWeb)
      ctx.tex = {
        pascal: r.pascal,
        pool: r.pool,
        output: r.output,
        status: r.state.status,
        error: r.state.error?.message,
      }
    } catch (e: any) {
      ctx.tex = { pascal: '', pool: '', output: '', status: 'error', error: e?.message }
    }

    // ---- 阶段 8: parse tex.pas ----
    if (ctx.tex && ctx.tex.status === 'terminated') {
      try {
        const result = parse(ctx.tex.pascal)
        ctx.texParseOk = result.success
      } catch {
        ctx.texParseOk = false
      }
    }
  }, 600000)

  // ---- 阶段 1 ----
  test('1. parse tangle-official.pas', () => {
    expect(ctx.failedAt).not.toBe('1.parse')
  })

  // ---- 阶段 2 ----
  test('2. compile tangle to JS', () => {
    expect(ctx.failedAt).not.toBe('2.compile')
    expect(ctx.compiledJs.length).toBeGreaterThan(0)
  })

  // ---- 阶段 3 ----
  test('3. run tangle on tangle.web → tangle.pas (v1)', () => {
    expect(ctx.failedAt).not.toBe('3.run-tangle')
    expect(ctx.v1).not.toBeNull()
    expect(ctx.v1!.status).toBe('terminated')
    expect(ctx.v1!.pascal.length).toBeGreaterThan(1000)
  })

  // ---- 阶段 4 ----
  test('4. parse tangle.pas (v1)', () => {
    if (ctx.failedAt) return
    expect(ctx.v1ParseOk).toBe(true)
  })

  // ---- 阶段 5 ----
  test('5. bootstrap: run tangle.pas (v1) on tangle.web → tangle.pas (v2)', () => {
    if (ctx.failedAt) return
    expect(ctx.v2).not.toBeNull()
    expect(ctx.v2!.status).toBe('terminated')
  })

  // ---- 阶段 6 ----
  test('6. verify v1 === v2 (自举稳定性)', () => {
    if (ctx.failedAt) return
    expect(ctx.v2!.pascal).toBe(ctx.v1!.pascal)
  })

  // ---- 阶段 7 ----
  test('7. run tangle on tex.web → tex.pas', () => {
    if (ctx.failedAt) return
    expect(ctx.tex).not.toBeNull()
    expect(ctx.tex!.status).toBe('terminated')
    expect(ctx.tex!.pascal.length).toBeGreaterThan(100000)
    expect(ctx.tex!.pascal).toContain('PROGRAM TEX')
  })

  // ---- 阶段 8 ----
  test('8. parse tex.pas', () => {
    if (ctx.failedAt) return
    expect(ctx.texParseOk).toBe(true)
  })
})
