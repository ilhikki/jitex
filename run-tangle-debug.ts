import * as fs from 'fs'
import * as path from 'path'
import { compileToJS, runJS } from './src/index'

const source = fs.readFileSync(
  path.join(__dirname, 'tests', 'e2e', 'resources', 'tangle-official.pas'),
  'utf-8'
)
const webSource = fs.readFileSync(
  path.join(__dirname, 'tests', 'e2e', 'resources', 'tangle.web'),
  'utf-8'
)

console.log('Compiling TANGLE...')
const js = compileToJS(source, { extensions: ['string'] })
console.log('JS length:', js.length)

const files = new Map<string, Uint8Array>()
files.set('WEBFILE', new Uint8Array(Buffer.from(webSource, 'utf-8')))
files.set('CHANGEFILE', new Uint8Array())
files.set('PASCALFILE', new Uint8Array())
files.set('POOL', new Uint8Array())

async function main() {
const tempDir2 = path.join(__dirname, 'temp')
console.log('Running TANGLE...')
const state = await runJS(source, {
  input: [],
  files,
  programFileUrls: {
    WEBFILE: 'WEBFILE',
    CHANGEFILE: 'CHANGEFILE',
    PASCALFILE: 'PASCALFILE',
    POOL: 'POOL',
  },
  maxSteps: undefined,
  extensions: ['string'],
  debug: { emitJSFile: path.join(tempDir2, 'tangle-runjs.js') },
})

console.log('Status:', state.status)
if (state.error) {
  console.log('Error:', state.error.message)
  console.log('Stack:', state.error.stack)
}
console.log('Steps:', state.steps)
console.log('Output (first 200 chars):', state.outputBuffer.join('').slice(0, 200))

const pascalRaw = files.get('PASCALFILE')!
const pascal = Buffer.from(pascalRaw).toString('utf-8')
const pool = Buffer.from(files.get('POOL')!).toString('utf-8')
console.log('PASCALFILE length:', pascal.length)
console.log('PASCALFILE raw bytes:', [...pascalRaw].map(b => b.toString(16).padStart(2, '0')).join(' '))
console.log('PASCALFILE (first 200 chars):', JSON.stringify(pascal.slice(0, 200)))
console.log('POOL length:', pool.length)

// Check TTY: file content
const ttyRaw = files.get('TTY:') || new Uint8Array()
console.log('TTY: length:', ttyRaw.length)
const ttyFull = Buffer.from(ttyRaw).toString('utf-8')
console.log('TTY: full:', JSON.stringify(ttyFull))
}

main().catch(console.error)
