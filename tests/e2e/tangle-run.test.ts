import { parse } from '@/index'
import { transform } from '@/il/transform'
import { readResource, runTangle, TANGLE_PAS, TANGLE_WEB } from './_helper'
import { describe, test, expect } from 'vitest'

describe('Tangle Official - IL run', () => {
  const source = readResource(TANGLE_PAS)
  const webSource = readResource(TANGLE_WEB)

  test('parse succeeds', () => {
    const result = parse(source)
    if (!result.success) {
      console.error('Parse error:', result.error, 'at position', result.position)
    }
    expect(result.success).toBe(true)
  })

  test('compile to JS succeeds (IL)', () => {
    const result = parse(source)
    expect(result.success).toBe(true)
    if (!result.success) return

    let jsCode: string
    expect(() => {
      jsCode = transform(source, { extensions: ['string'] })
    }).not.toThrow()
    expect(jsCode!.length).toBeGreaterThan(0)
    console.log('Compiled JS size (IL):', jsCode!.length, 'chars')
  })

  test('run tangle on web file', () => {
    const result = runTangle(source, webSource)
    console.log('Status:', result.state.status)
    if (result.state.error) {
      console.log('Error:', result.state.error.message)
    }
    console.log('Output (first 1000 chars):', result.output.slice(0, 1000))
    console.log('Output (last 500 chars):', result.output.slice(-500))
    console.log('PASCALFILE size:', result.pascal.length, 'chars')
    console.log('POOL size:', result.pool.length, 'chars')
    console.log('POOL content:', JSON.stringify(result.pool))
    const pascalSize = result.pascal.length
    const poolSize = result.pool.length
    expect(pascalSize).toBeGreaterThan(0)
    expect(poolSize).toBeGreaterThan(0)
  }, 120000)
})
