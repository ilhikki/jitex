import * as fs from 'fs'
import * as path from 'path'
import { runJS } from '@/js-compiler'
import {
  runTangle,
  readResource,
  resourcePath,
  TANGLE_PAS,
  TANGLE_WEB,
} from './_helper'

describe.skip('TANGLE self-bootstrap test (JS) - SKIPPED until Phase 7', () => {
  const webSource = readResource(TANGLE_WEB)
  const officialPas = readResource(TANGLE_PAS)

  test('pass 1: official tangle.pas + tangle.web → tangle.pas (v1)', async () => {
    const result = await runTangle(officialPas, webSource)
    console.log('Pass 1 status:', result.state.status)
    expect(result.state.status).toBe('terminated')
    expect(result.pascal.length).toBeGreaterThan(1000)
    expect(result.pool.length).toBeGreaterThan(0)
  }, 120000)

  test('pass 2: tangle.pas (v1) + tangle.web → tangle.pas (v2)', async () => {
    const pass1 = await runTangle(officialPas, webSource)
    const pass2 = await runTangle(pass1.pascal, webSource)
    console.log('Pass 2 status:', pass2.state.status)
    expect(pass2.state.status).toBe('terminated')
    expect(pass2.pascal).toBe(pass1.pascal)
  }, 120000)

  test('pass 3: tangle.pas (v2) + tangle.web → stable output', async () => {
    const pass1 = await runTangle(officialPas, webSource)
    const pass2 = await runTangle(pass1.pascal, webSource)
    const pass3 = await runTangle(pass2.pascal, webSource)
    console.log('Pass 3 status:', pass3.state.status)
    expect(pass3.state.status).toBe('terminated')
    expect(pass3.pascal).toBe(pass2.pascal)
  }, 180000)
})
