// 缓存机制（目录结构 + checksum + 恢复判定 + 写入）。
//
// 目录：{cacheDir}/{suiteName}/{stageName}/
//   meta.json          // 版本、时间戳、依赖列表及 checksum、自身 checksum
//   results.json       // CacheableRecord（JSON 序列化，Uint8Array 用 base64）
//   attachments/{name} // 附件原样保留
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

// 将 Uint8Array 序列化为 { "__bytes": "base64" } 的占位对象；
// 其余 CacheableValue 原样保留。
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
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
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
      v !== null &&
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
  // 手工拼接 chunks
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

// 计算某个 stage（results + attachments）的 checksum。
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

// 读取 meta.json；不存在返回 null。
export async function readMeta(dir: string): Promise<MetaJson | null> {
  const p = `${dir}/meta.json`
  try {
    const bytes = await Deno.readFile(p)
    return JSON.parse(dec().decode(bytes)) as MetaJson
  } catch {
    return null
  }
}

export async function writeMeta(dir: string, meta: MetaJson): Promise<void> {
  await Deno.mkdir(dir, { recursive: true })
  await Deno.writeFile(`${dir}/meta.json`, enc().encode(JSON.stringify(meta, null, 2)))
}

// 写缓存条目（成功后调用）。
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
  const checksum = await computeChecksum(results, artifacts)

  await Deno.writeFile(`${dir}/results.json`, enc().encode(JSON.stringify(serializeResults(results), null, 2)))
  await Deno.writeFile(`${dir}/assertions.json`, enc().encode(JSON.stringify(assertions, null, 2)))
  await Deno.writeFile(`${dir}/logs.txt`, enc().encode(logs.join('\n')))
  const attachDir = `${dir}/attachments`
  await Deno.mkdir(attachDir, { recursive: true })
  for (const a of artifacts) {
    await Deno.writeFile(`${attachDir}/${sanitize(a.name)}`, a.bytes)
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

// 尝试从缓存恢复；不满足条件返回 null。
// 若 requireCacheStrict=true（CLI --with-cache 场景）：
//   - 该 stage 被标记 cacheable 但缓存条目不存在 → 抛错
//   - 依赖被标记 cacheable 但依赖缓存不存在/不匹配 → 抛错
export async function tryRecoverCache(
  cacheDir: string,
  suiteName: string,
  stage: Stage<unknown>,
  depChecksums: Map<string, string>, // stageName -> 当前依赖的实际 checksum
  requireCacheStrict: boolean,
): Promise<RecoveredData | null> {
  if (!stage.cacheable) {
    if (requireCacheStrict) {
      throw new Error(
        `--with-cache: stage '${stage.name}' is not marked cache() but cache mode is enabled`,
      )
    }
    return null
  }

  const dir = stageDir(cacheDir, suiteName, stage.name)
  const meta = await readMeta(dir)
  if (!meta) {
    if (requireCacheStrict) {
      throw new Error(
        `--with-cache: no cache entry found for stage '${stage.name}' (expected at ${dir})`,
      )
    }
    return null
  }

  // 依赖校验：所有直接 deps 都必须 cacheable + 在 depChecksums 里 + 和 meta.deps 里的 checksum 匹配
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
      return null
    }
    const recorded = meta.deps.find((d) => d.stageName === dep.name)
    if (!recorded) {
      if (requireCacheStrict) {
        throw new Error(
          `--with-cache: cache of '${stage.name}' missing recorded checksum for dep '${dep.name}'`,
        )
      }
      return null
    }
    const actual = depChecksums.get(dep.name)
    if (!actual) {
      if (requireCacheStrict) {
        throw new Error(
          `--with-cache: dep '${dep.name}' of '${stage.name}' has no computed checksum`,
        )
      }
      return null
    }
    if (recorded.checksum !== actual) {
      if (requireCacheStrict) {
        throw new Error(
          `--with-cache: dep '${dep.name}' of '${stage.name}' checksum mismatch (cache has a stale version). purge cache and rerun.`,
        )
      }
      return null
    }
  }

  // 读取本地
  let results: CacheableRecord
  let assertions: AssertionRecord[]
  let logs: string[]
  let artifacts: Artifact[]
  try {
    results = deserializeResults(JSON.parse(dec().decode(await Deno.readFile(`${dir}/results.json`))))
    assertions = JSON.parse(dec().decode(await Deno.readFile(`${dir}/assertions.json`))) as AssertionRecord[]
    logs = dec().decode(await Deno.readFile(`${dir}/logs.txt`)).split('\n').filter((_, _i, arr) => {
      // 空文件 split 得到 ['']；过滤掉
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
      // 目录不存在 ≡ 无附件
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
    return null
  }

  // 自身 checksum 校验
  const actualChecksum = await computeChecksum(results, artifacts)
  if (actualChecksum !== meta.checksum) {
    if (requireCacheStrict) {
      throw new Error(
        `--with-cache: cache of '${stage.name}' corrupted (checksum mismatch). purge and retry.`,
      )
    }
    return null
  }

  return { results, artifacts, assertions, logs, checksum: actualChecksum }
}

// 整目录 purge
export async function purgeCacheDir(cacheDir: string): Promise<void> {
  try {
    await Deno.remove(cacheDir, { recursive: true })
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      throw err
    }
  }
}
