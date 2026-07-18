import * as fs from 'fs'
import * as path from 'path'
import { runVM } from '../src/vm'

async function main() {
  const webFile = path.join(__dirname, 'resources', 'tex.web')
  const tanglePasFile = path.join(__dirname, 'resources', 'tangle-official.pas')
  const outFile = path.join(__dirname, 'resources', 'tex.pas')
  const webSource = fs.readFileSync(webFile, 'utf-8')
  const tanglePas = fs.readFileSync(tanglePasFile, 'utf-8')

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

  const pascal = Buffer.from(files.get('PASCALFILE')!).toString('utf-8')
  fs.writeFileSync(outFile, pascal, 'utf-8')
  console.log('Saved tex.pas:', pascal.length, 'chars')
  console.log('First 50 lines:')
  console.log(pascal.split('\n').slice(0, 50).join('\n'))
}

main().catch(console.error)
