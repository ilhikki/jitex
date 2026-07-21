import * as fs from 'fs'
import * as path from 'path'
import { runJS } from '@/js-compiler'
import {
  runTangle,
  loadTexResources,
  readResource,
} from './_helper'

describe.skip('TEX82 - TANGLE compile tex.web (JS) - SKIPPED until Phase 7', () => {
  const resources = loadTexResources()

  test('tangle compiles tex.web → tex.pas', async () => {
    const result = await runTangle(resources.tanglePas, resources.texWeb)
    console.log('Status:', result.state.status)
    if (result.state.error) {
      console.log('Error:', result.state.error.message)
      console.log('Error stack:', result.state.error.stackTrace)
    }
    console.log('Output (first 2000 chars):', result.output.slice(0, 2000))
    console.log('Output (last 2000 chars):', result.output.slice(-2000))
    console.log('PASCALFILE size:', result.pascal.length, 'chars')
    console.log('POOL size:', result.pool.length, 'chars')
    for (const [name, content] of result.files.entries()) {
      console.log(`File ${name}:`, content.length, 'bytes')
    }
    expect(result.pascal.length).toBeGreaterThan(100000)
    expect(result.pascal).toContain('PROGRAM TEX')
    expect(result.pool.length).toBeGreaterThan(0)
  }, 300000)
})
