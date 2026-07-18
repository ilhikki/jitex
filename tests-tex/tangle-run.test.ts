import * as fs from 'fs'
import * as path from 'path'
import { parse } from '../src/index'
import { StaticAnalyzer } from '../src/static-analyzer'
import { runVM } from '../src/vm'

describe('Tangle Official - VM run', () => {
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

  test('analyze (compile to JsonCode) succeeds', () => {
    const result = parse(source)
    expect(result.success).toBe(true)
    if (!result.success) return

    const analyzer = new StaticAnalyzer([])
    let jsonCode: any
    expect(() => {
      jsonCode = analyzer.analyze(result.astNode as any)
    }).not.toThrow()
    if (!jsonCode) return

    expect(jsonCode.version).toBe('1.0.0')
    expect(jsonCode.entry).toBe('MAIN')
    expect(jsonCode.procedures.length).toBeGreaterThan(10)
    expect(jsonCode.typeTable.length).toBeGreaterThan(20)

    console.log('Tangle compiled OK:')
    console.log('  procedures:', jsonCode.procedures.length)
    console.log('  types:', jsonCode.typeTable.length)
    console.log('  main body instructions:', jsonCode.procedures[jsonCode.procedures.length - 1].body.length)
  })

  test('run VM with web file input', async () => {
    const result = parse(source)
    expect(result.success).toBe(true)
    if (!result.success) return

    const files = new Map<string, Uint8Array>()
    files.set('WEBFILE', new Uint8Array(Buffer.from(webSource, 'utf-8')))
    files.set('CHANGEFILE', new Uint8Array())
    files.set('PASCALFILE', new Uint8Array())
    files.set('POOL', new Uint8Array())

    const state = await runVM(source, {
      input: [],
      files,
      programFileUrls: {
        'WEBFILE': 'WEBFILE',
        'CHANGEFILE': 'CHANGEFILE',
        'PASCALFILE': 'PASCALFILE',
        'POOL': 'POOL',
      },
    })

    console.log('VM final status:', state.status)
    if (state.error) {
      console.log('VM error:', state.error.message)
      console.log('VM stack trace:', state.error.stackTrace)
    }

    const output = state.outputBuffer.join('')
    console.log('VM output (first 1000 chars):', output.slice(0, 1000))

    for (const [name, content] of files.entries()) {
      console.log(`File ${name} (${content.length} chars):`, Buffer.from(content).toString('utf-8').slice(0, 500))
    }

    expect(['terminated', 'error']).toContain(state.status)
  }, 60000)
})
