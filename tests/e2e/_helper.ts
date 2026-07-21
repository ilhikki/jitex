import * as fs from 'fs'
import * as path from 'path'
import { runJS } from '@/index'

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
export const TRIP_TYP = 'trip.typ'

export interface TangleResult {
  state: any
  pascal: string
  pool: string
  output: string
  files: Map<string, Uint8Array>
}

export async function runTangle(pasSource: string, webContent: string): Promise<TangleResult> {
  const files = new Map<string, Uint8Array>()
  files.set('WEBFILE', new Uint8Array(Buffer.from(webContent, 'utf-8')))
  files.set('CHANGEFILE', new Uint8Array())
  files.set('PASCALFILE', new Uint8Array())
  files.set('POOL', new Uint8Array())

  const state = await runJS(pasSource, {
    input: [],
    files,
    programFileUrls: {
      WEBFILE: 'WEBFILE',
      CHANGEFILE: 'CHANGEFILE',
      PASCALFILE: 'PASCALFILE',
      POOL: 'POOL',
    },
    maxSteps: 1e9,
    extensions: ['allowUndeclaredLabels'],
  })

  return {
    state,
    pascal: Buffer.from(files.get('PASCALFILE')!).toString('utf-8'),
    pool: Buffer.from(files.get('POOL')!).toString('utf-8'),
    output: state.outputBuffer.join(''),
    files,
  }
}

export interface TexResources {
  tanglePas: string
  texWeb: string
}

export function loadTexResources(): TexResources {
  return {
    tanglePas: readResource(TANGLE_PAS),
    texWeb: readResource(TEX_WEB),
  }
}

export async function compileTexPas(
  resources: TexResources
): Promise<{ pas: string; pool: string }> {
  const result = await runTangle(resources.tanglePas, resources.texWeb)
  if (result.state.status !== 'terminated') {
    throw new Error(`TANGLE failed: ${result.state.status} - ${result.state.error?.message}`)
  }
  return {
    pas: result.pascal,
    pool: result.pool,
  }
}

export function printResultSummary(result: TangleResult): void {
  console.log('Status:', result.state.status)
  if (result.state.error) {
    console.log('Error:', result.state.error.message)
  }
  console.log('Output (first 500 chars):', result.output.slice(0, 500))
  console.log('PASCALFILE size:', result.pascal.length, 'chars')
  console.log('POOL size:', result.pool.length, 'chars')
}
