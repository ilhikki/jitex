import * as fs from 'fs'
import * as path from 'path'
import { run as runIL } from '@/il/transform'

export function readResource(name: string): string {
  return fs.readFileSync(path.join(__dirname, 'resources', name), 'utf-8')
}

export function resourcePath(name: string): string {
  return path.join(__dirname, 'resources', name)
}

export const TANGLE_PAS = 'tangle-official.pas'
export const TANGLE_WEB = 'tangle.web'
export const TEX_WEB = 'tex.web'
export const TRIP_TEX = 'trip.tex'

export interface TangleResult {
  state: any
  pascal: string
  pool: string
  output: string
  files: Map<string, Uint8Array>
}

export function runTangle(pasSource: string, webContent: string): TangleResult {
  const files = new Map<string, Uint8Array>()
  files.set('WEBFILE', new Uint8Array(Buffer.from(webContent, 'utf-8')))
  files.set('CHANGEFILE', new Uint8Array())
  files.set('PASCALFILE', new Uint8Array())
  files.set('POOL', new Uint8Array())

  const state = runIL(pasSource, {
    input: [],
    files,
    programFileUrls: {
      WEBFILE: 'WEBFILE',
      CHANGEFILE: 'CHANGEFILE',
      PASCALFILE: 'PASCALFILE',
      POOL: 'POOL',
    },
    maxSteps: 1e9,
    extensions: ['string'],
  })

  return {
    state,
    pascal: Buffer.from(files.get('PASCALFILE')!).toString('utf-8'),
    pool: Buffer.from(files.get('POOL')!).toString('utf-8'),
    output: state.outputBuffer.join(''),
    files,
  }
}
