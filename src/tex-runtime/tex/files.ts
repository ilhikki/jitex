import { createMemoryFileStore, encodeUtf8 } from '@jitex/runtime'
import type { PascalFileStore } from '@jitex/runtime'
import { ConsoleFile } from './console.ts'

export const TEX_FONT_AREA = 'TeXfonts:'
export const TEX_FORMAT_AREA = 'TeXformats:'

export function texFontKey(name: string): string {
  return TEX_FONT_AREA + (name.toLowerCase().endsWith('.tfm') ? name : `${name}.tfm`)
}

export function texFormatKey(name: string): string {
  return TEX_FORMAT_AREA + name
}

const JOB_NAME = 'jitex'

export interface TexJobInput {
  source: string
  format: Uint8Array
  pool: Uint8Array
  formatName?: string
  fonts?: Record<string, Uint8Array>
  extraFiles?: Record<string, string | Uint8Array>
}

export interface TexJobFiles {
  files: Map<string, PascalFileStore>
  console: ConsoleFile
  dviKey: string
  logKey: string
}

export function createTexJobFiles(input: TexJobInput): TexJobFiles {
  const jobName = JOB_NAME
  const formatName = input.formatName ?? 'plain'
  const console = new ConsoleFile(`&${formatName} ${jobName} \n \\bye \n`)

  const files = new Map<string, PascalFileStore>()
  files.set(`${formatName}.fmt`, createMemoryFileStore(input.format))
  files.set(texFormatKey('TEX.POOL'), createMemoryFileStore(input.pool))
  for (const [name, bytes] of Object.entries(input.fonts ?? {})) {
    files.set(texFontKey(name), createMemoryFileStore(bytes))
  }
  files.set(`${jobName}.tex`, createMemoryFileStore(encodeUtf8(input.source)))
  for (const [key, data] of Object.entries(input.extraFiles ?? {})) {
    files.set(key, createMemoryFileStore(typeof data === 'string' ? encodeUtf8(data) : data))
  }
  files.set('TTY:', console)

  return {
    files,
    console,
    dviKey: `${jobName}.dvi`,
    logKey: `${jobName}.log`,
  }
}
