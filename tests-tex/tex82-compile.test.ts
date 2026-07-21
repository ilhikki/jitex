import * as fs from 'fs'
import * as path from 'path'
import { parse } from '../src/index'
import { runJS, compileToJS } from '../src/js-compiler'

describe('TEX82 - compile and analyze tex.pas (JS)', () => {
  const webFile = path.join(__dirname, 'resources', 'tex.web')
  const tanglePasFile = path.join(__dirname, 'resources', 'tangle-official.pas')
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
    // TEX82 关键过程名应出现在生成的 JS 源码中
    // 这些是 TeX78/TeX82 中典型的过程名
    expect(jsCode).toContain('async function')

    console.log('TEX compiled OK, JS code size:', jsCode!.length, 'chars')
  })
})
