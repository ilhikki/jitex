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
  evalExpr,
} from '../../src/interpreter'

const tanglePasPath = path.join(__dirname, '..', 'resources', 'tangle-official.pas')

function runTangle(webContent: string): {
  pasOutput: string
  termout: string
  assertFails: number
} {
  const pasSource = fs.readFileSync(tanglePasPath, 'utf-8')
  const parseResult = parse(pasSource)
  if (!parseResult.success) {
    throw new Error(`Parse failed: ${parseResult.error}`)
  }

  const webBytes = new TextEncoder().encode(webContent)

  const files = new Map<string, Uint8Array>()
  files.set('webfile', webBytes)
  files.set('changefile', new Uint8Array(0))
  files.set('terminfile', new Uint8Array(0))

  const fileOps = createRecordFileOps(files)

  let assertFails = 0

  const pascalConsole = {
    write(_text: string) {},
    writeln() {},
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

  state.systemProcedures.set('ASSERT', (args, s) => {
    const cond = evalExpr(args[0], s.currentScope, s)
    const condBool = typeof cond.rawValue === 'number' ? cond.rawValue !== 0 : !!cond.rawValue
    if (!condBool) {
      assertFails++
    }
  })
  state.systemProcedures.set('LOG_DEBUG', () => {})

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
  return { pasOutput, termout, assertFails }
}

describe('tangle min repro - module_name scan bug (ISSUE-003)', () => {
  test('minimal repro: @ text + @p + 2 module_name refs - no error', () => {
    const web = `@* Intro.
@ some text here
@p
@<bar@>@/
@<baz@>@/
@ end
`
    const { termout, assertFails } = runTangle(web)
    expect(termout).not.toContain('= sign is missing')
    expect(assertFails).toBe(0)
  })

  test('control: @ text + @p + 1 module_name ref - no error', () => {
    const web = `@* Intro.
@ some text here
@p
@<bar@>@/
@ end
`
    const { termout, assertFails } = runTangle(web)
    expect(termout).not.toContain('= sign is missing')
    expect(assertFails).toBe(0)
  })

  test('control: no @ text + @p + 2 module_name refs - no error', () => {
    const web = `@* Intro.
@p
@<bar@>@/
@<baz@>@/
@ end
`
    const { termout, assertFails } = runTangle(web)
    expect(termout).not.toContain('= sign is missing')
    expect(assertFails).toBe(0)
  })

  test('pas output is non-empty for minimal repro', () => {
    const web = `@* Intro.
@ some text here
@p
@<bar@>@/
@<baz@>@/
@ end
`
    const { pasOutput } = runTangle(web)
    expect(pasOutput.length).toBeGreaterThan(0)
  })
})
