import * as fs from 'fs'
import * as path from 'path'
import { parse } from '@/index'
import { runJS, compileToJS } from '@/js-compiler'
import {
  runTangle,
  readResource,
  resourcePath,
  TANGLE_PAS,
  TANGLE_WEB,
} from './_helper'

describe.skip('Tangle Official - JS run - SKIPPED until Phase 7', () => {
  const source = readResource(TANGLE_PAS)
  const webSource = readResource(TANGLE_WEB)

  test('parse succeeds', () => {
    const result = parse(source)
    if (!result.success) {
      console.error('Parse error:', result.error, 'at position', result.position)
    }
    expect(result.success).toBe(true)
  })

  test('compile to JS succeeds', () => {
    const result = parse(source)
    expect(result.success).toBe(true)
    if (!result.success) return

    let jsCode: string
    expect(() => {
      jsCode = compileToJS(source)
    }).not.toThrow()
    expect(jsCode!.length).toBeGreaterThan(0)
    console.log('Compiled JS size:', jsCode!.length, 'chars')
  })

  test('run tangle on web file', async () => {
    const result = await runTangle(source, webSource)
    console.log('Status:', result.state.status)
    if (result.state.error) {
      console.log('Error:', result.state.error.message)
    }
    console.log('Output (first 1000 chars):', result.output.slice(0, 1000))
    console.log('PASCALFILE size:', result.pascal.length, 'chars')
    console.log('POOL size:', result.pool.length, 'chars')
    const pascalSize = result.pascal.length
    const poolSize = result.pool.length
    expect(pascalSize).toBeGreaterThan(0)
    expect(poolSize).toBeGreaterThan(0)
  }, 60000)
})
