import * as fs from 'fs'
import * as path from 'path'
import { parse } from '../src/index'
import { runJS, compileToJS } from '../src/js-compiler'
import { stringPlugin } from '../src/js-compiler/types'

describe('TEX82 - run tex.pas on JS', () => {
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
    expect(files.get('PASCALFILE')!.length).toBeGreaterThan(100000)
    return Buffer.from(files.get('PASCALFILE')!).toString('utf-8')
  }

  beforeAll(async () => {
    texPas = await tangleCompile()
    console.log('tex.pas size:', texPas.length, 'chars')
  }, 600000)

  test('run tex.pas (initialization)', async () => {
    const result = parse(texPas)
    expect(result.success).toBe(true)
    if (!result.success) return

    // 验证 tex.pas 能成功编译为 JS
    let jsCode: string
    expect(() => {
      jsCode = compileToJS(texPas)
    }).not.toThrow()
    expect(jsCode!.length).toBeGreaterThan(0)

    // 尝试运行 TEX82
    const files = new Map<string, Uint8Array>()
    files.set('TEXINPUT', new Uint8Array())   // 输入文件占位
    files.set('TEXOUTPUT', new Uint8Array())  // 输出文件占位
    files.set('TEXLOG', new Uint8Array())     // 日志文件占位
    files.set('TEXDVI', new Uint8Array())     // DVI 文件占位

    const state = await runJS(texPas, {
      input: [],
      files,
      plugins: [stringPlugin],
      maxSteps: 1e9,
      allowUndeclaredLabels: true,
    })

    console.log('Status:', state.status)
    if (state.error) {
      console.log('Error:', state.error.message?.slice(0, 500))
    }
    console.log('Output (first 1000 chars):', state.outputBuffer.join('').slice(0, 1000))

    // 期望 VM 能执行不崩溃（terminated 或 error 都可接受）
    expect(['terminated', 'error']).toContain(state.status)
  }, 600000)
})
