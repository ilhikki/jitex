import * as fs from 'fs'
import * as path from 'path'
import { parse } from '../src/index'
import { runJS, compileToJS } from '../src/js-compiler'

describe('Tangle Official - JS run', () => {
  const pasFile = path.join(__dirname, '..', 'knuth', 'web', 'tangle-official.pas')
  const webFile = path.join(__dirname, '..', 'knuth', 'web', 'tangle.web')
  const source = fs.readFileSync(pasFile, 'utf-8')
  const webSource = fs.readFileSync(webFile, 'utf-8')

  test('parse succeeds', () => {
    const result = parse(source)
    if (!result.success) {
      console.error('Parse error:', result.error, 'at position', result.position)
    }
    expect(result.success).toBe(true)
  })

  test('compile to JS succeeds', () => {
    let jsCode: string
    expect(() => {
      jsCode = compileToJS(source)
    }).not.toThrow()
    if (!jsCode!) return

    expect(jsCode.length).toBeGreaterThan(0)
    // 关键过程名（小写化后带 p_ 前缀）应出现在生成的 JS 源码中
    expect(jsCode).toContain('p_initialize')
    expect(jsCode).toContain('p_error')
    expect(jsCode).toContain('p_jumpout')

    console.log('Tangle compiled OK, JS code size:', jsCode!.length, 'chars')
  })

  test('run with web file input', async () => {
    const result = parse(source)
    expect(result.success).toBe(true)
    if (!result.success) return

    const files = new Map<string, Uint8Array>()
    files.set('WEBFILE', new Uint8Array(Buffer.from(webSource, 'utf-8')))
    files.set('CHANGEFILE', new Uint8Array())
    files.set('PASCALFILE', new Uint8Array())
    files.set('POOL', new Uint8Array())

    const state = await runJS(source, {
      input: [],
      files,
      programFileUrls: {
        'WEBFILE': 'WEBFILE',
        'CHANGEFILE': 'CHANGEFILE',
        'PASCALFILE': 'PASCALFILE',
        'POOL': 'POOL',
      },
      maxSteps: 1e9,
      allowUndeclaredLabels: true,
    })

    console.log('Final status:', state.status)
    if (state.error) {
      console.log('Error:', state.error.message)
      console.log('Stack trace:', state.error.stackTrace)
    }

    const output = state.outputBuffer.join('')
    console.log('Output (first 1000 chars):', output.slice(0, 1000))

    for (const [name, content] of files.entries()) {
      console.log(`File ${name} (${content.length} chars):`, Buffer.from(content).toString('utf-8').slice(0, 500))
    }

    expect(['terminated', 'error']).toContain(state.status)

    // 验证非标 I/O 确实生效：PASCALFILE / POOL 应有内容
    const pascalSize = files.get('PASCALFILE')?.length || 0
    const poolSize = files.get('POOL')?.length || 0
    expect(pascalSize).toBeGreaterThan(0)
    expect(poolSize).toBeGreaterThan(0)
  }, 60000)
})
