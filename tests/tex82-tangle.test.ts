import * as fs from 'fs'
import * as path from 'path'
import { runVM } from '../src/vm'

describe('TEX82 - TANGLE compile tex.web', () => {
  const webFile = path.join(__dirname, 'resources', 'tex.web')
  const tanglePasFile = path.join(__dirname, 'resources', 'tangle-official.pas')
  const webSource = fs.readFileSync(webFile, 'utf-8')
  const tanglePas = fs.readFileSync(tanglePasFile, 'utf-8')

  function runTangle(pasSource: string, webContent: string): Promise<{ pascal: string; pool: string; output: string }> {
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
    }).then((state: any) => {
      return {
        pascal: Buffer.from(files.get('PASCALFILE')!).toString('utf-8'),
        pool: Buffer.from(files.get('POOL')!).toString('utf-8'),
        output: state.outputBuffer.join(''),
      }
    })
  }

  test('tangle compiles tex.web → tex.pas', async () => {
    const result = await runTangle(tanglePas, webSource)
    expect(result.pascal.length).toBeGreaterThan(100000)
    expect(result.pascal).toContain('PROGRAM TEX')
    console.log('PASCALFILE size:', result.pascal.length, 'chars')
    console.log('POOL size:', result.pool.length, 'chars')
    console.log('Output:', result.output.slice(0, 500))
  }, 300000)
})
