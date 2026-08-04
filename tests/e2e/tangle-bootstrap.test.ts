import { readResource, runTangle, TANGLE_PAS, TANGLE_WEB } from './_helper'
import { describe, test, expect } from 'vitest'

describe('TANGLE self-bootstrap test (IL)', () => {
  const webSource = readResource(TANGLE_WEB)
  const officialPas = readResource(TANGLE_PAS)

  test('pass 1: official tangle.pas + tangle.web → tangle.pas (v1)', () => {
    const result = runTangle(officialPas, webSource)
    console.log('Pass 1 status:', result.state.status)
    if (result.state.error) {
      console.log('Error:', result.state.error.message)
    }
    console.log('Output:', result.output.slice(0, 500))
    console.log('PASCALFILE:', result.pascal.slice(0, 100))
    console.log('PASCALFILE length:', result.pascal.length)
    expect(result.state.status).toBe('terminated')
    expect(result.pascal.length).toBeGreaterThan(1000)
    expect(result.pool.length).toBeGreaterThan(0)
  }, 120000)

  test('pass 2: tangle.pas (v1) + tangle.web → tangle.pas (v2)', () => {
    const pass1 = runTangle(officialPas, webSource)
    const pass2 = runTangle(pass1.pascal, webSource)
    console.log('Pass 2 status:', pass2.state.status)
    expect(pass2.state.status).toBe('terminated')
    expect(pass2.pascal).toBe(pass1.pascal)
  }, 120000)

  test('pass 3: tangle.pas (v2) + tangle.web → stable output', () => {
    const pass1 = runTangle(officialPas, webSource)
    const pass2 = runTangle(pass1.pascal, webSource)
    const pass3 = runTangle(pass2.pascal, webSource)
    console.log('Pass 3 status:', pass3.state.status)
    expect(pass3.state.status).toBe('terminated')
    expect(pass3.pascal).toBe(pass2.pascal)
  }, 180000)
})
