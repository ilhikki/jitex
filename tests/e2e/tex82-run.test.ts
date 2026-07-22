import { parse } from '@/index'
import { compileToJS, runJS } from '@/index'
import { loadTexResources, runTangle } from './_helper'
import { describe, test, expect, beforeAll } from 'vitest'

describe.skip('TEX82 - run tex.pas on JS - SKIPPED until Phase 7', () => {
  const resources = loadTexResources()

  let texPas: string = ''

  beforeAll(async () => {
    const result = await runTangle(resources.tanglePas, resources.texWeb)
    texPas = result.pascal
    console.log('tex.pas size:', texPas.length, 'chars')
  }, 600000)

  test('run tex.pas (initialization)', async () => {
    const result = parse(texPas)
    expect(result.success).toBe(true)
    if (!result.success) return

    let jsCode: string
    expect(() => {
      jsCode = compileToJS(texPas)
    }).not.toThrow()
    expect(jsCode!.length).toBeGreaterThan(0)

    const files = new Map<string, Uint8Array>()
    files.set('TEXINPUT', new Uint8Array())
    files.set('TEXOUTPUT', new Uint8Array())
    files.set('TEXLOG', new Uint8Array())
    files.set('TEXDVI', new Uint8Array())

    const state = await runJS(texPas, {
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
