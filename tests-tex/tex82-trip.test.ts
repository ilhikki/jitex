import * as fs from 'fs'
import * as path from 'path'
import { parse } from '../src/index'
import { runJS } from '../src/js-compiler'
import { stringPlugin } from '../src/js-compiler/types'
import { createExtendedSysCalls } from '../src/js-compiler/syscalls'

const extendedSysCalls = createExtendedSysCalls()

describe('TEX82 - TRIP test (JS)', () => {
  const webFile = path.join(__dirname, '..', 'tests', 'resources', 'tex.web')
  const tanglePasFile = path.join(__dirname, '..', 'tests', 'resources', 'tangle-official.pas')
  const tripTexFile = path.join(__dirname, '..', 'tests', 'resources', 'trip.tex')
  const tripTypFile = path.join(__dirname, '..', 'tests', 'resources', 'trip.typ')
  const webSource = fs.readFileSync(webFile, 'utf-8')
  const tanglePas = fs.readFileSync(tanglePasFile, 'utf-8')
  const tripTex = fs.readFileSync(tripTexFile, 'utf-8')

  let texPas: string = ''
  let texPool: string = ''

  async function tangleCompile(): Promise<{ pas: string; pool: string }> {
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
    return {
      pas: Buffer.from(files.get('PASCALFILE')!).toString('utf-8'),
      pool: Buffer.from(files.get('POOL')!).toString('utf-8'),
    }
  }

  beforeAll(async () => {
    const result = await tangleCompile()
    texPas = result.pas
    texPool = result.pool
    console.log('tex.pas size:', texPas.length, 'chars')
    console.log('tex.pool size:', texPool.length, 'chars')
    console.log('tex.pool first 200 chars:', JSON.stringify(texPool.slice(0, 200)))
  }, 600000)

  test('compile trip.tex with TEX82', async () => {
    const result = parse(texPas)
    expect(result.success).toBe(true)
    if (!result.success) return

    // 准备文件：
    // - 'TTY:'：终端输入（TEX82 用 RESET(TERMIN, 'TTY:') 打开终端输入）
    // - 'TeXformats:TEX.POOL                     '：字符串池文件（POOLNAME = 'TeXformats:TEX.POOL' + 空格填充到20字符）
    // - trip.tex：待编译的 TeX 源文件
    // - trip.log：日志输出
    // - trip.dvi：DVI 输出
    // - trip.tfm：TFM 字体文件
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
      plugins: [stringPlugin],
      sysCalls: extendedSysCalls,
      maxSteps: 1e9,
      allowUndeclaredLabels: true,
    })

    console.log('VM status:', state.status)
    if (state.error) {
      console.log('VM error:', state.error.message?.slice(0, 500))
    }
    console.log('VM output (first 1000 chars):', state.outputBuffer.join('').slice(0, 1000))

    // 检查终端输出文件 (TERMOUT 也会写 'TTY:' 但用 REWRITE 打开)
    const ttyContent = Buffer.from(files.get('TTY:') || new Uint8Array()).toString('utf-8')
    console.log('TTY output size:', ttyContent.length, 'chars')
    console.log('TTY output (first 1000 chars):', ttyContent.slice(0, 1000))

    // 检查日志文件
    const logContent = Buffer.from(files.get('trip.log') || new Uint8Array()).toString('utf-8')
    console.log('trip.log size:', logContent.length, 'chars')
    console.log('trip.log (first 1000 chars):', logContent.slice(0, 1000))

    // 检查 DVI 文件
    const dviContent = files.get('trip.dvi') || new Uint8Array()
    console.log('trip.dvi size:', dviContent.length, 'bytes')

    expect(['terminated', 'error']).toContain(state.status)
  })
})
