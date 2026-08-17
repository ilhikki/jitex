// CLI 入口。
//
// 用法：
//   deno run -A cli.ts run <entry.ts> [options]
//
//   <entry.ts> 必须 export default Suite
//
//   options:
//     --report-dir <path>     默认 ./reports
//     --run-id <id>           自定义 runId
//     --filter <glob>         按 stage name 过滤（minimatch 风格）
//     --fail-fast             失败即停止
//     --cache-dir <path>      默认 {reportDir}/.cache
//     --with-cache            严格缓存模式：必须全部命中 cache，缺则报错
//     --purge                 启动前清空 cache 目录
//     --no-report             MVP 占位：当前不写报告文件
//
// 默认不启用缓存（刷新执行）。只有传 --with-cache 才走严格缓存恢复。

import type { Suite } from './dsl.ts'
import { run, type RunOptions } from './runner.ts'

interface CliArgs {
  command: 'run' | 'help'
  entry?: string
  reportDir: string
  runId?: string
  filterGlob?: string
  failFast: boolean
  cacheDir?: string
  withCache: boolean
  purge: boolean
  noReport: boolean
  rest: string[]
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    command: 'help',
    reportDir: './reports',
    failFast: false,
    withCache: false,
    purge: false,
    noReport: false,
    rest: [],
  }
  let i = 0
  if (argv[0] === 'run') {
    out.command = 'run'
    i++
  } else if (argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h' || argv.length === 0) {
    out.command = 'help'
    return out
  }
  while (i < argv.length) {
    const a = argv[i]
    switch (a) {
      case '--report-dir':
        out.reportDir = argv[++i]
        break
      case '--run-id':
        out.runId = argv[++i]
        break
      case '--filter':
        out.filterGlob = argv[++i]
        break
      case '--fail-fast':
        out.failFast = true
        break
      case '--cache-dir':
        out.cacheDir = argv[++i]
        break
      case '--with-cache':
        out.withCache = true
        break
      case '--purge':
        out.purge = true
        break
      case '--no-report':
        out.noReport = true
        break
      default:
        if (!a.startsWith('-') && !out.entry) {
          out.entry = a
        } else {
          out.rest.push(a)
        }
    }
    i++
  }
  return out
}

function printHelp(): void {
  console.log(
    [
      'jitex-integration — e2e pipeline runner',
      '',
      'USAGE:',
      '  deno run -A cli.ts run <entry.ts> [options]',
      '',
      'OPTIONS:',
      '  --report-dir <path>   report dir (default ./reports)',
      '  --run-id <id>         explicit runId',
      '  --filter <glob>       include stage by name glob',
      '  --fail-fast           stop on first failure',
      '  --cache-dir <path>    cache dir (default {reportDir}/.cache)',
      '  --with-cache          strict cache mode (requires all cacheable stages hit)',
      '  --purge               clear cache dir before run',
      '  --no-report           (MVP) do not write report files',
      '',
      'DEFAULT: fresh run (no cache recovery). Use --with-cache to require cache hits.',
    ].join('\n'),
  )
}

// 极简 minimatch：支持 * 和 ?，不支持 **（够用）
function globMatch(pattern: string, s: string): boolean {
  const p = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp('^' + p + '$').test(s)
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv)
  if (args.command === 'help') {
    printHelp()
    return 0
  }
  if (!args.entry) {
    console.error('error: <entry.ts> is required')
    printHelp()
    return 2
  }

  // 动态加载入口
  const entryUrl = new URL(args.entry, `file://${Deno.cwd()}/`).href
  let mod: { default?: unknown }
  try {
    mod = await import(entryUrl) as { default?: unknown }
  } catch (err) {
    console.error(`error: failed to load entry '${args.entry}': ${(err as Error).message}`)
    return 2
  }
  const suite = mod.default as Suite | undefined
  if (!suite || typeof suite !== 'object' || (suite as { __brand?: unknown }).__brand !== 'Suite') {
    console.error(`error: entry '${args.entry}' must export default a Suite (returned by suite(...))`)
    return 2
  }

  const opts: RunOptions = {
    reportDir: args.reportDir,
    runId: args.runId,
    failFast: args.failFast,
    cacheDir: args.cacheDir,
    withCache: args.withCache,
    purge: args.purge,
    noReport: args.noReport,
    args: argv.slice(),
  }
  if (args.filterGlob) {
    const pat = args.filterGlob
    opts.filter = (s) => globMatch(pat, s.name)
  }

  const report = await run(suite, opts)

  // 控制台摘要（MVP：不写报告文件）
  const okCount = report.stages.filter((s) => s.status === 'success').length
  const failCount = report.stages.filter((s) => s.status === 'failed').length
  const skipCount = report.stages.filter((s) => s.status === 'skipped').length
  const cachedCount = report.stages.filter((s) => s.cached).length
  console.log(`run ${report.id} ${report.success ? 'SUCCESS' : 'FAIL'} (${report.duration}ms)`)
  console.log(`  stages: ${okCount} ok / ${failCount} fail / ${skipCount} skip / ${cachedCount} cached`)
  for (const s of report.stages) {
    const mark = s.status === 'success'
      ? s.cached ? '[cached]' : '[ok]    '
      : s.status === 'failed'
      ? '[FAIL]  '
      : '[SKIP]  '
    console.log(`  ${mark} #${s.id} ${s.title} (${s.duration}ms)`)
    for (const a of s.artifacts) {
      console.log(`           artifact: ${a.name} (${a.size} bytes${a.lines != null ? `, ${a.lines} lines` : ''})`)
    }
    if (s.status === 'failed') {
      for (const line of s.stackTrace) {
        console.log(`           ${line}`)
      }
    }
  }

  if (!args.noReport) {
    // TODO: reporter.ts — 下一期实现写盘
  }

  return report.success ? 0 : 1
}

if (import.meta.main) {
  const argv = [...Deno.args]
  const code = await main(argv)
  Deno.exit(code)
}

export { main as cliMain, parseArgs as _parseCliArgs }
