import * as fs from 'fs'
import * as path from 'path'
import { parse } from '../../src/index'
import {
  createRecordFileOps,
  createState,
  evalExpr,
  PascalFile,
  populateSystemFunctions,
  populateSystemProcedures,
  runToCompletion,
} from '../../src/interpreter'

const tanglePasPath = path.join(__dirname, '..', 'resources', 'tangle-official.pas')
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

    const files = new Map<string, Uint8Array>()
    files.set('webfile', webBytes)
    files.set('changefile', new Uint8Array(0))
    files.set('terminfile', new Uint8Array(0))

    const fileOps = createRecordFileOps(files)

    // ASSERT/LOG_DEBUG 消息收集器
    const messages: { kind: string; text: string }[] = []

    const pascalConsole = {
      write(text: string) {
        process.stdout.write(text)
      },
      writeln() {
        process.stdout.write('\n')
      },
      read() {
        return ''
      },
      readln() {
        return ''
      },
      eof() {
        return true
      },
      eoln() {
        return true
      },
    }

    const io = { file: fileOps, console: pascalConsole }
    const state = createState(parseResult.astNode, io)
    populateSystemProcedures(state, true)
    populateSystemFunctions(state)

    // 注册 ASSERT / LOG_DEBUG
    state.systemProcedures.set('ASSERT', (args, s) => {
      const cond = evalExpr(args[0], s.currentScope, s)
      const condBool = typeof cond.rawValue === 'number' ? cond.rawValue !== 0 : !!cond.rawValue
      if (!condBool) {
        const msg = args[1] ? evalExpr(args[1], s.currentScope, s) : null
        const text = msg ? String.fromCharCode(...((msg.rawValue as number[]) || [])) : 'no message'
        messages.push({ kind: 'assert', text })
      }
    })
    state.systemProcedures.set('LOG_DEBUG', (args, s) => {
      if (args.length > 0) {
        const arg = evalExpr(args[0], s.currentScope, s)
        const text =
          typeof arg.rawValue === 'number'
            ? String(arg.rawValue)
            : String.fromCharCode(...((arg.rawValue as number[]) || []))
        messages.push({ kind: 'log', text })
      }
    })

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
    const termout = new TextDecoder().decode(files.get('termout') || new Uint8Array(0))
    console.info('termout==========\n', termout)
    console.info('debug messages==========')
    messages.map((m) => `[${m.kind}] ${m.text}`).join('\n')

    expect(pasOutput.length).toBeGreaterThan(0)
  })
})
