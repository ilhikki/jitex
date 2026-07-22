import { readResource, runTangle, TANGLE_PAS, TANGLE_WEB } from './_helper'
import { describe, it, expect } from 'vitest'
describe.skip('temp: TANGLE output check', () => {
  it('tangle should produce non-empty pascal output', async () => {
    const source = readResource(TANGLE_PAS)
    const webSource = readResource(TANGLE_WEB)

    console.log('TANGLE_PAS length:', source.length)
    console.log('TANGLE_WEB length:', webSource.length)

    const result = await runTangle(source, webSource)

    console.log('Status:', result.state.status)
    if (result.state.error) {
      console.log('Error:', result.state.error.message)
    }
    console.log('Steps:', result.state.steps)
    console.log('Output (first 200):', result.output.slice(0, 200))
    console.log('PASCALFILE length:', result.pascal.length)
    console.log('PASCALFILE first 500:', result.pascal.slice(0, 500))

    expect(result.state.status).toBe('terminated')
    expect(result.pascal.length).toBeGreaterThan(100)
  }, 120000)
})
