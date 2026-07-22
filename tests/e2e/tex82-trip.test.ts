import { parse } from '@/index'
import { runJS } from '@/index'
import { loadTexResources, readResource, runTangle, TRIP_TEX } from './_helper'
import { createExtendedSysCalls } from '@/runtime'

const extendedSysCalls = createExtendedSysCalls()

describe.skip('TEX82 - TRIP test (JS) - SKIPPED until Phase 7', () => {
  const resources = loadTexResources()
  const tripTex = readResource(TRIP_TEX)

  let texPas: string = ''
  let texPool: string = ''

  beforeAll(async () => {
    const result = await runTangle(resources.tanglePas, resources.texWeb)
    texPas = result.pascal
    texPool = result.pool
    console.log('tex.pas size:', texPas.length, 'chars')
    console.log('tex.pool size:', texPool.length, 'chars')
    console.log('tex.pool first 200 chars:', JSON.stringify(texPool.slice(0, 200)))
  }, 600000)

  test('compile trip.tex with TEX82', async () => {
    const result = parse(texPas)
    expect(result.success).toBe(true)
    if (!result.success) return

    const files = new Map<string, Uint8Array>()
    files.set('TTY:', new Uint8Array(Buffer.from('trip.tex\n', 'utf-8')))
    files.set(
      'TeXformats:TEX.POOL                     ',
      new Uint8Array(Buffer.from(texPool, 'utf-8'))
    )
    files.set('trip.tex', new Uint8Array(Buffer.from(tripTex, 'utf-8')))
    files.set('trip.log', new Uint8Array())
    files.set('trip.dvi', new Uint8Array())
    files.set('trip.tfm', new Uint8Array())

    const state = await runJS(texPas, {
      input: [],
      files,
      extensions: ['string'],
      sysCalls: extendedSysCalls,
      maxSteps: 1e9,
    })

    console.log('Status:', state.status)
    if (state.error) {
      console.log('Error:', state.error.message?.slice(0, 500))
    }
    console.log('Output (first 1000 chars):', state.outputBuffer.join('').slice(0, 1000))

    const ttyContent = Buffer.from(files.get('TTY:') || new Uint8Array()).toString('utf-8')
    console.log('TTY output size:', ttyContent.length, 'chars')
    console.log('TTY output (first 1000 chars):', ttyContent.slice(0, 1000))

    const logContent = Buffer.from(files.get('trip.log') || new Uint8Array()).toString('utf-8')
    console.log('trip.log size:', logContent.length, 'chars')
    console.log('trip.log (first 1000 chars):', logContent.slice(0, 1000))

    const dviContent = files.get('trip.dvi') || new Uint8Array()
    console.log('trip.dvi size:', dviContent.length, 'bytes')

    expect(['terminated', 'error']).toContain(state.status)
  })
})
