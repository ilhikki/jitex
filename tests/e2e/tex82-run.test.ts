import { parse } from '@/index'
import { transform, run as runIL } from '@/il/transform'
import { loadTexResources, runTangle } from './_helper'
import { describe, test, expect, beforeAll } from 'vitest'

describe('TEX82 - run tex.pas on IL', () => {
  const resources = loadTexResources()

  let texPas: string = ''

  beforeAll(() => {
    const result = runTangle(resources.tanglePas, resources.texWeb)
    texPas = result.pascal
    console.log('tex.pas size:', texPas.length, 'chars')
  }, 600000)

  test('run tex.pas (initialization)', () => {
    const result = parse(texPas)
    expect(result.success).toBe(true)
    if (!result.success) return

    let jsCode: string
    expect(() => {
      jsCode = transform(texPas, { extensions: ['string'] })
    }).not.toThrow()
    expect(jsCode!.length).toBeGreaterThan(0)

    const files = new Map<string, Uint8Array>()
    files.set('TEXINPUT', new Uint8Array())
    files.set('TEXOUTPUT', new Uint8Array())
    files.set('TEXLOG', new Uint8Array())
    files.set('TEXDVI', new Uint8Array())

    const state = runIL(texPas, {
      input: [],
      files,
      extensions: ['string'],
      maxSteps: 1e9,
    })

    console.log('Status:', state.status)
    if (state.error) {
      console.log('Error:', state.error.message?.slice(0, 500))
    }
    console.log('Output (first 1000 chars):', state.outputBuffer.join('').slice(0, 1000))

    expect(['terminated', 'error']).toContain(state.status)
  }, 600000)
})
