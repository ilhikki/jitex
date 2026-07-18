import * as fs from 'fs'
import * as path from 'path'
import { runVM } from '../src/vm'

describe('TEX82 - TANGLE compile tex.web', () => {
  const webFile = path.join(__dirname, '..', 'tests', 'resources', 'tex.web')
  const tanglePasFile = path.join(__dirname, '..', 'tests', 'resources', 'tangle-official.pas')
  const webSource = fs.readFileSync(webFile, 'utf-8')
  const tanglePas = fs.readFileSync(tanglePasFile, 'utf-8')

  function runTangle(pasSource: string, webContent: string): Promise<{ state: any; pascal: string; pool: string; output: string; files: Map<string, Uint8Array> }> {
    const files = new Map<string, Uint8Array>()
    files.set('WEBFILE', new Uint8Array(Buffer.from(webContent, 'utf-8')))
    files.set('CHANGEFILE', new Uint8Array())
    files.set('PASCALFILE', new Uint8Array())
    files.set('POOL', new Uint8Array())

    return runVM(pasSource, {
      input: [],
      files,
      programFileUrls: {
        'WEBFILE': 'WEBFILE',
        'CHANGEFILE': 'CHANGEFILE',
        'PASCALFILE': 'PASCALFILE',
        'POOL': 'POOL',
      },
      maxSteps: 2000000000,
    }).then((state: any) => {
      return {
        state,
        pascal: Buffer.from(files.get('PASCALFILE')!).toString('utf-8'),
        pool: Buffer.from(files.get('POOL')!).toString('utf-8'),
        output: state.outputBuffer.join(''),
        files,
      }
    })
  }

  test('tangle compiles tex.web → tex.pas', async () => {
    const result = await runTangle(tanglePas, webSource)
    console.log('VM status:', result.state.status)
    if (result.state.error) {
      console.log('VM error:', result.state.error.message)
      console.log('VM error stack:', result.state.error.stackTrace)
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
  }, 300000)
})
