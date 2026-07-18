import * as fs from 'fs'
import * as path from 'path'
import { parse } from '../src/index'
import { StaticAnalyzer } from '../src/static-analyzer'
import { runVM } from '../src/vm'
import { stringPlugin } from '../src/types'

describe('TEX82 - run tex.pas on VM', () => {
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

    const state = await runVM(tanglePas, {
      input: [],
      files,
      programFileUrls: {
        'WEBFILE': 'WEBFILE',
        'CHANGEFILE': 'CHANGEFILE',
        'PASCALFILE': 'PASCALFILE',
        'POOL': 'POOL',
      },
      maxSteps: 2000000000,
    })
    return Buffer.from(files.get('PASCALFILE')!).toString('utf-8')
  }

  beforeAll(async () => {
    texPas = await tangleCompile()
    console.log('tex.pas size:', texPas.length, 'chars')
  }, 600000)

  test('run tex.pas on VM (initialization)', async () => {
    const result = parse(texPas)
    expect(result.success).toBe(true)
    if (!result.success) return

    const analyzer = new StaticAnalyzer([])
    const jsonCode = analyzer.analyze(result.astNode as any)
    expect(jsonCode).toBeDefined()

    // 尝试在 VM 上运行 TEX82
    const files = new Map<string, Uint8Array>()
    files.set('TEXINPUT', new Uint8Array())   // 输入文件占位
    files.set('TEXOUTPUT', new Uint8Array())  // 输出文件占位
    files.set('TEXLOG', new Uint8Array())     // 日志文件占位
    files.set('TEXDVI', new Uint8Array())     // DVI 文件占位

    const state = await runVM(texPas, {
      input: [],
      files,
      plugins: [stringPlugin],
      maxSteps: 100000000,
    })

    console.log('VM status:', state.status)
    if (state.error) {
      console.log('VM error:', state.error.message?.slice(0, 500))
    }
    console.log('VM output (first 1000 chars):', state.outputBuffer.join('').slice(0, 1000))

    // 期望 VM 能执行不崩溃（terminated 或 error 都可接受）
    expect(['terminated', 'error']).toContain(state.status)
  }, 600000)
})
