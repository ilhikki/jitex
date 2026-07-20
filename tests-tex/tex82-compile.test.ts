import * as fs from 'fs'
import * as path from 'path'
import { parse } from '../src/index'
import { StaticAnalyzer } from '../src/static-analyzer'
import { runJS } from '../src/js-compiler'

describe('TEX82 - compile and analyze tex.pas (JS)', () => {
  const webFile = path.join(__dirname, '..', 'tests', 'resources', 'tex.web')
  const tanglePasFile = path.join(__dirname, '..', 'tests', 'resources', 'tangle-official.pas')
  const webSource = fs.readFileSync(webFile, 'utf-8')
  const tanglePas = fs.readFileSync(tanglePasFile, 'utf-8')

  let texPas: string = ''

  async function tangleCompile(): Promise<string> {
    const files = new Map<string, Uint8Array>()
    files.set('WEBFILE', new Uint8Array(Buffer.from(webSource, 'utf-8')))
    files.set('CHANGEFILE', new Uint8Array())
    files.set('PASCALFILE', new Uint8Array())
    files.set('POOL', new Uint8Array())

    const state = await runJS(tanglePas, {
      input: [],
      files,
      programFileUrls: {
        WEBFILE: 'WEBFILE',
        CHANGEFILE: 'CHANGEFILE',
        PASCALFILE: 'PASCALFILE',
        POOL: 'POOL',
      },
      maxSteps: 1e9,
      allowUndeclaredLabels: true,
    })
    expect(state.status).toBe('terminated')
    const pascal = files.get('PASCALFILE')!
    expect(pascal.length).toBeGreaterThan(100000)
    return Buffer.from(pascal).toString('utf-8')
  }

  beforeAll(async () => {
    texPas = await tangleCompile()
    console.log('tex.pas size:', texPas.length, 'chars')
  }, 300000)

  test('parse tex.pas succeeds', () => {
    const result = parse(texPas)
    if (!result.success) {
      console.error('Parse error:', result.error, 'at position', result.position)
    }
    expect(result.success).toBe(true)
  })

  test('analyze tex.pas succeeds (compile to JsonCode)', () => {
    const result = parse(texPas)
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
    expect(jsonCode.procedures.length).toBeGreaterThan(50)
    expect(jsonCode.typeTable.length).toBeGreaterThan(30)

    console.log('TEX compiled OK:')
    console.log('  procedures:', jsonCode.procedures.length)
    console.log('  types:', jsonCode.typeTable.length)
    console.log('  main body instructions:', jsonCode.procedures[jsonCode.procedures.length - 1].body.length)
  })
})
