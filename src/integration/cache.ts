// Cache mechanism (directory layout + checksum + recovery decision + writing).
//
// Layout: {cacheDir}/{suiteName}/{stageName}/
//   meta.json          // version, timestamp, dep list & checksums, self checksum
//   results.json       // CacheableRecord (JSON serialized, Uint8Array as base64)
//   attachments/{name} // attachments kept as-is
//   assertions.json
//   logs.txt

import type { Stage } from './dsl.ts'
import type { Artifact, AssertionRecord } from './context.ts'
import type { CacheableRecord } from './dsl.ts'

export interface DepChecksum {
  stageName: string
  checksum: string
}

export interface MetaJson {
  stageName: string
  createdAt: string
  checksum: string
  deps: DepChecksum[]
}

export interface RecoveredData {
  results: CacheableRecord
  artifacts: Artifact[]
  assertions: AssertionRecord[]
  logs: string[]
  checksum: string
}

function enc(): TextEncoder {
  return new TextEncoder()
}

function dec(): TextDecoder {
  return new TextDecoder()
}

function serializeResults(r: CacheableRecord): unknown {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) {
    if (v instanceof Uint8Array) {
      out[k] = { __bytes: encodeB64(v) }
    } else {
      out[k] = v
    }
  }
  return out
}

function deserializeResults(obj: unknown): CacheableRecord {
  if (typeof obj !== 'object' || obj === undefined || Array.isArray(obj)) {
    throw new Error('cached results.json must be an object')
  }
  const rec = obj as Record<string, unknown>
  const out: CacheableRecord = {}
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === 'string' || typeof v === 'number') {
      out[k] = v
    } else if (v instanceof Uint8Array) {
      out[k] = v
    } else if (
      typeof v === 'object' &&
      v !== undefined &&
      typeof (v as { __bytes?: unknown }).__bytes === 'string'
    ) {
      out[k] = decodeB64((v as { __bytes: string }).__bytes)
    } else {
      throw new Error(`invalid cached value for key '${k}': ${typeof v}`)
    }
  }
  return out
}

async function sha256Hex(chunks: Uint8Array[]): Promise<string> {
  let total = 0
  for (const c of chunks) {
    total += c.length
  }
  const buf = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    buf.set(c, off)
    off += c.length
  }
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  const bytes = new Uint8Array(hashBuf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0')
  }
  return s
}

function encodeB64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i])
  }
  return btoa(bin)
}

function decodeB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}

function stageDir(cacheDir: string, suiteName: string, stageName: string): string {
  return `${cacheDir}/${sanitize(suiteName)}/${sanitize(stageName)}`
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9_.-]/g, '_')
}

// Compute checksum for a stage (results + attachments).
export async function computeChecksum(
  results: CacheableRecord,
  artifacts: Artifact[],
): Promise<string> {
  const resultsJson = JSON.stringify(serializeResults(results))
  const chunks: Uint8Array[] = [enc().encode(resultsJson)]
  for (const a of artifacts.sort((x, y) => x.name.localeCompare(y.name))) {
    chunks.push(enc().encode(a.name + ':'))
    chunks.push(a.bytes)
  }
  return await sha256Hex(chunks)
}

// Read meta.json; return undefined if it does not exist.
export async function readMeta(dir: string): Promise<MetaJson | undefined> {
  const p = `${dir}/meta.json`
  try {
    const bytes = await Deno.readFile(p)
    return JSON.parse(dec().decode(bytes)) as MetaJson
  } catch {
    return undefined
  }
}

export async function writeMeta(dir: string, meta: MetaJson): Promise<void> {
  await Deno.mkdir(dir, { recursive: true })
  await Deno.writeFile(`${dir}/meta.json`, enc().encode(JSON.stringify(meta, undefined, 2)))
}

// Write a cache entry (called after success).
export async function writeCache(
  cacheDir: string,
  suiteName: string,
  stageName: string,
  results: CacheableRecord,
  artifacts: Artifact[],
  assertions: AssertionRecord[],
  logs: string[],
  deps: DepChecksum[],
): Promise<string> {
  const dir = stageDir(cacheDir, suiteName, stageName)
  await Deno.mkdir(dir, { recursive: true })

  // Normalize attachments: dedup by on-disk filename (after sanitize), later wins.
  // The recovery side only sees the on-disk file list, so the checksum must be
  // fully reproducible from that list; otherwise repeated attach of the same
  // artifact name (e.g. boot-tex's tangle.js) would break verification.
  const normalized: Artifact[] = []
  const byName = new Map<string, number>()
  for (const a of artifacts) {
    const name = sanitize(a.name)
    const idx = byName.get(name)
    if (idx === undefined) {
      byName.set(name, normalized.length)
      normalized.push({ name, bytes: a.bytes })
    } else {
      normalized[idx] = { name, bytes: a.bytes }
    }
  }

  const checksum = await computeChecksum(results, normalized)

  await Deno.writeFile(`${dir}/results.json`, enc().encode(JSON.stringify(serializeResults(results), undefined, 2)))
  await Deno.writeFile(`${dir}/assertions.json`, enc().encode(JSON.stringify(assertions, undefined, 2)))
  await Deno.writeFile(`${dir}/logs.txt`, enc().encode(logs.join('\n')))
  const attachDir = `${dir}/attachments`
  await Deno.mkdir(attachDir, { recursive: true })
  for (const a of normalized) {
    await Deno.writeFile(`${attachDir}/${a.name}`, a.bytes)
  }
  const meta: MetaJson = {
    stageName,
    createdAt: new Date().toISOString(),
    checksum,
    deps,
  }
  await writeMeta(dir, meta)
  return checksum
}

// Attempt to recover from cache; return undefined if conditions are not met.
// When requireCacheStrict=true (CLI --with-cache):
//   - stage is cacheable but no cache entry exists -> throw
//   - a dep is cacheable but its cache is missing/mismatched -> throw
export async function tryRecoverCache(
  cacheDir: string,
  suiteName: string,
  stage: Stage<unknown>,
  depChecksums: Map<string, string>, // stageName -> actual checksum of the current dep
  requireCacheStrict: boolean,
): Promise<RecoveredData | undefined> {
  if (!stage.cacheable) {
    if (requireCacheStrict) {
      throw new Error(
        `--with-cache: stage '${stage.name}' is not marked cache() but cache mode is enabled`,
      )
    }
    return undefined
  }

  const dir = stageDir(cacheDir, suiteName, stage.name)
  const meta = await readMeta(dir)
  if (!meta) {
    if (requireCacheStrict) {
      throw new Error(
        `--with-cache: no cache entry found for stage '${stage.name}' (expected at ${dir})`,
      )
    }
    return undefined
  }

  for (const dep of stage.deps) {
    if (requireCacheStrict && !dep.cacheable) {
      throw new Error(
        `--with-cache: stage '${stage.name}' depends on '${dep.name}' which is not cache() marked`,
      )
    }
    if (!dep.cacheable) {
      if (requireCacheStrict) {
        throw new Error('unreachable')
      }
      return undefined
    }
    const recorded = meta.deps.find((d) => d.stageName === dep.name)
    if (!recorded) {
      if (requireCacheStrict) {
        throw new Error(
          `--with-cache: cache of '${stage.name}' missing recorded checksum for dep '${dep.name}'`,
        )
      }
      return undefined
    }
    const actual = depChecksums.get(dep.name)
    if (!actual) {
      if (requireCacheStrict) {
        throw new Error(
          `--with-cache: dep '${dep.name}' of '${stage.name}' has no computed checksum`,
        )
      }
      return undefined
    }
    if (recorded.checksum !== actual) {
      if (requireCacheStrict) {
        throw new Error(
          `--with-cache: dep '${dep.name}' of '${stage.name}' checksum mismatch (cache has a stale version). purge cache and rerun.`,
        )
      }
      return undefined
    }
  }

  let results: CacheableRecord
  let assertions: AssertionRecord[]
  let logs: string[]
  let artifacts: Artifact[]
  try {
    results = deserializeResults(JSON.parse(dec().decode(await Deno.readFile(`${dir}/results.json`))))
    assertions = JSON.parse(dec().decode(await Deno.readFile(`${dir}/assertions.json`))) as AssertionRecord[]
    logs = dec().decode(await Deno.readFile(`${dir}/logs.txt`)).split('\n').filter((_, _i, arr) => {
      if (arr.length === 1 && arr[0] === '') {
        return false
      }
      return true
    })
    artifacts = []
    const attachDir = `${dir}/attachments`
    let entries: Deno.DirEntry[] = []
    try {
      entries = Array.from(Deno.readDirSync(attachDir))
    } catch {
      // ignored
    }
    for (const e of entries) {
      if (!e.isFile) {
        continue
      }
      const bytes = await Deno.readFile(`${attachDir}/${e.name}`)
      artifacts.push({ name: e.name, bytes })
    }
  } catch (err) {
    if (requireCacheStrict) {
      throw new Error(`--with-cache: failed to read cache for '${stage.name}': ${(err as Error).message}`)
    }
    return undefined
  }

  const actualChecksum = await computeChecksum(results, artifacts)
  if (actualChecksum !== meta.checksum) {
    if (requireCacheStrict) {
      throw new Error(
        `--with-cache: cache of '${stage.name}' corrupted (checksum mismatch). purge and retry.`,
      )
    }
    return undefined
  }

  return { results, artifacts, assertions, logs, checksum: actualChecksum }
}

// Purge the entire cache directory.
export async function purgeCacheDir(cacheDir: string): Promise<void> {
  try {
    await Deno.remove(cacheDir, { recursive: true })
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      throw err
    }
  }
}
