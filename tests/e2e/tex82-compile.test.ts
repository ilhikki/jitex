import * as fs from 'fs'
import * as path from 'path'
import { parse } from '@/index'
import { runJS, compileToJS } from '@/js-compiler'
import {
  runTangle,
  loadTexResources,
} from './_helper'

describe.skip('TEX82 - compile and analyze tex.pas (JS) - SKIPPED until Phase 7', () => {
  const resources = loadTexResources()

  let texPas: string = ''

  beforeAll(async () => {
    const result = await runTangle(resources.tanglePas, resources.texWeb)
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

  test('compile tex.pas to JS succeeds', () => {
    const parseResult = parse(texPas)
    expect(parseResult.success).toBe(true)
    if (!parseResult.success) return

    let jsCode: string
    expect(() => {
      jsCode = compileToJS(texPas)
    }).not.toThrow()
    if (!jsCode!) return

    expect(jsCode.length).toBeGreaterThan(0)
    expect(jsCode).toContain('async function')

    console.log('TEX compiled OK, JS code size:', jsCode!.length, 'chars')
  })
})
