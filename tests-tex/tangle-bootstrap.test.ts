import * as fs from 'fs'
import * as path from 'path'
import { runJS } from '../src/js-compiler'

describe('TANGLE self-bootstrap test (JS)', () => {
  const webFile = path.join(__dirname, '..', 'knuth', 'web', 'tangle.web')
  const officialPasFile = path.join(__dirname, '..', 'knuth', 'web', 'tangle-official.pas')
  const webSource = fs.readFileSync(webFile, 'utf-8')
  const officialPas = fs.readFileSync(officialPasFile, 'utf-8')

  function runTangle(pasSource: string, webContent: string): Promise<{ pascal: string; pool: string; output: string }> {
    const files = new Map<string, Uint8Array>()
    files.set('WEBFILE', new Uint8Array(Buffer.from(webContent, 'utf-8')))
    files.set('CHANGEFILE', new Uint8Array())
    files.set('PASCALFILE', new Uint8Array())
    files.set('POOL', new Uint8Array())

    return runJS(pasSource, {
      input: [],
      files,
      programFileUrls: {
        'WEBFILE': 'WEBFILE',
        'CHANGEFILE': 'CHANGEFILE',
        'PASCALFILE': 'PASCALFILE',
        'POOL': 'POOL',
      },
      maxSteps: 1e9,
    }).then((state: any) => {
      return {
        pascal: Buffer.from(files.get('PASCALFILE')!).toString('utf-8'),
        pool: Buffer.from(files.get('POOL')!).toString('utf-8'),
        output: state.outputBuffer.join(''),
      }
    })
  }

  test('first pass: tangle(official) compiles tangle.web → pascal', async () => {
    const result = await runTangle(officialPas, webSource)
    expect(result.pascal.length).toBeGreaterThan(10000)
    expect(result.pascal).toContain('PROGRAM TANGLE')
    expect(result.pool.length).toBeGreaterThan(0)
    console.log('First pass PASCALFILE size:', result.pascal.length, 'chars')
    console.log('First pass POOL size:', result.pool.length, 'chars')
  }, 60000)

  test('self-bootstrap: pass 2 == pass 3 (fixed-point)', async () => {
    const pass1 = await runTangle(officialPas, webSource)
    const pass2 = await runTangle(pass1.pascal, webSource)
    const pass3 = await runTangle(pass2.pascal, webSource)

    console.log('Pass 1 (v2.8 → v4.6):', pass1.pascal.length, 'chars')
    console.log('Pass 2 (v4.6 → ?):', pass2.pascal.length, 'chars')
    console.log('Pass 3 (v4.6 → ?):', pass3.pascal.length, 'chars')

    if (pass2.pascal !== pass3.pascal) {
      const minLen = Math.min(pass2.pascal.length, pass3.pascal.length)
      let diffPos = -1
      for (let i = 0; i < minLen; i++) {
        if (pass2.pascal[i] !== pass3.pascal[i]) {
          diffPos = i
          break
        }
      }
      if (diffPos >= 0) {
        const start = Math.max(0, diffPos - 60)
        const end = Math.min(minLen, diffPos + 60)
        console.log('First diff at position', diffPos)
        console.log('Pass 2: >>>', pass2.pascal.slice(start, end), '<<<')
        console.log('Pass 3: >>>', pass3.pascal.slice(start, end), '<<<')
      }
    }

    expect(pass3.pascal).toBe(pass2.pascal)
  }, 180000)
})
