import { parse } from '@/index'
import { transform } from '@/il/transform'
import { loadTexResources, runTangle } from './_helper'
import { describe, test, beforeAll, expect } from 'vitest'
describe('TEX82 - compile and analyze tex.pas (IL)', () => {
  const resources = loadTexResources()

  let texPas: string = ''

  beforeAll(() => {
    const result = runTangle(resources.tanglePas, resources.texWeb)
    expect(result.state.status).toBe('terminated')
    texPas = result.pascal
    console.log('tex.pas size:', texPas.length, 'chars')
  }, 300000)

  test('parse tex.pas succeeds', () => {
    const result = parse(texPas)
    if (!result.success) {
      console.error('Parse error:', result.error, 'at position', result.position)
    }
    expect(result.success).toBe(true)
  })

  test('compile tex.pas to JS succeeds (IL)', () => {
    const parseResult = parse(texPas)
    expect(parseResult.success).toBe(true)
    if (!parseResult.success) return

    let jsCode: string
    expect(() => {
      jsCode = transform(texPas, { extensions: ['string'] })
    }).not.toThrow()
    if (!jsCode!) return

    expect(jsCode.length).toBeGreaterThan(0)

    console.log('TEX compiled OK (IL), JS code size:', jsCode!.length, 'chars')
  })
})
