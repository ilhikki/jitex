import * as fs from 'fs'
import * as path from 'path'
import { parse } from '../../src/index'
import {
  createState,
  runToCompletion,
  PascalFile,
  createRecordFileOps,
  populateSystemProcedures,
  populateSystemFunctions,
} from '../../src/interpreter'

const tanglePasPath = path.join(__dirname, '..', '..', 'knuth', 'web', 'tangle-official.pas')
const tangleWebPath = path.join(__dirname, '..', '..', 'knuth', 'web', 'tangle.web')

describe('tangle bootstrapping', () => {
  test('compile tangle.web to pas and verify output is parseable', () => {
    const pasSource = fs.readFileSync(tanglePasPath, 'utf-8')
    const parseResult = parse(pasSource)
    if (!parseResult.success) {
      throw new Error(`Parse failed: ${parseResult.error}`)
    }

    const webContent = fs.readFileSync(tangleWebPath, 'utf-8')
    const webBytes = new TextEncoder().encode(webContent)

    // 用户自定义的内存文件系统
    const files = new Map<string, Uint8Array>()
    files.set('webfile', webBytes)
    files.set('changefile', new Uint8Array(0))
    files.set('terminfile', new Uint8Array(0))

    const fileOps = createRecordFileOps(files)
    const console = {
      write(text: string) {
        process.stdout.write(text)
      },
      writeln() {
        process.stdout.write('\n')
      },
      read() { return '' },
      readln() { return '' },
      eof() { return true },
      eoln() { return true },
    }

    const io = { file: fileOps, console }
    const state = createState(parseResult.astNode, io)
    populateSystemProcedures(state)
    populateSystemFunctions(state)

    const fileMap: [string, string][] = [
      ['WEBFILE', 'webfile'],
      ['CHANGEFILE', 'changefile'],
      ['TERMIN', 'terminfile'],
      ['TERMOUT', 'termout'],
      ['PASCALFILE', 'pas'],
      ['POOL', 'pool'],
    ]

    for (const [pasName, url] of fileMap) {
      const val = state.globalScope.variables.get(pasName)
      if (val) {
        const pf = val.rawValue as PascalFile
        pf.url = url
        if (pasName === 'TERMOUT' || pasName === 'PASCALFILE' || pasName === 'POOL') {
          state.io.file.rewrite(pf)
        } else {
          state.io.file.reset(pf)
        }
      }
    }

    runToCompletion(state)

    const pasOutput = new TextDecoder().decode(files.get('pas') || new Uint8Array(0))
    expect(pasOutput.length).toBeGreaterThan(0)
  })
})
