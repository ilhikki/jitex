import type { Suite } from './dsl.ts'
import { run, type RunOptions, type RunReport } from './runner.ts'

interface CliArgs {
  command: 'run' | 'help'
  entry?: string
  reportDir: string
  filterGlob?: string
  noReport: boolean
  config: Record<string, string>
  rest: string[]
}

function addArgument(kv: string, config: Record<string, string>): void {
  const eq = kv.indexOf('=')
  if (eq < 0) {
    config[kv] = ''
    return
  }
  config[kv.slice(0, eq)] = kv.slice(eq + 1)
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    command: 'help',
    reportDir: './reports',
    noReport: false,
    config: {},
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
      case '--filter':
        out.filterGlob = argv[++i]
        break
      case '--no-report':
        out.noReport = true
        break
      case '-a':
      case '--arguments':
        addArgument(argv[++i] ?? '', out.config)
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
      'jitex-integration - e2e pipeline runner',
      '',
      'USAGE:',
      '  deno run -A cli.ts run <entry.ts> [options]',
      '',
      'OPTIONS:',
      '  --report-dir <path>   report dir (default ./reports)',
      '  --filter <glob>       run matching stages plus their upstream deps',
      '  --no-report           do not write report files',
      '  -a, --arguments <k=v> pass a key=value through to context().config',
      '                        (repeatable, e.g. -a debug=false)',
    ].join('\n'),
  )
}

function globMatch(pattern: string, s: string): boolean {
  const p = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp('^' + p + '$').test(s)
}

function statusMark(s: RunReport['stages'][number]): string {
  if (s.status === 'success') {
    return '[ok]    '
  }
  if (s.status === 'failed') {
    return '[FAIL]  '
  }
  return '[SKIP]  '
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
    noReport: args.noReport,
    args: argv.slice(),
    config: args.config,
  }
  if (args.filterGlob) {
    const pat = args.filterGlob
    opts.filter = (s) => globMatch(pat, s.name)
  }

  let report: RunReport
  try {
    report = await run(suite, opts)
  } catch (err) {
    console.error(`error: ${(err as Error).message}`)
    return 2
  }

  const okCount = report.stages.filter((s) => s.status === 'success').length
  const failCount = report.stages.filter((s) => s.status === 'failed').length
  const skipCount = report.stages.filter((s) => s.status === 'skipped').length
  console.log(`run ${report.id} ${report.success ? 'SUCCESS' : 'FAIL'} (${report.duration}ms)`)
  console.log(`  stages: ${okCount} ok / ${failCount} fail / ${skipCount} skip`)
  if (report.before) {
    console.log(`  before: ${report.before.status}`)
  }
  for (const s of report.stages) {
    console.log(`  ${statusMark(s)} #${s.id} ${s.name} (${s.duration}ms)`)
    if (s.skipReason) {
      console.log(`           skip: ${s.skipReason}`)
    }
    for (const a of s.artifacts) {
      console.log(`           artifact: ${a.name} (${a.size} bytes${a.lines != undefined ? `, ${a.lines} lines` : ''})`)
    }
    if (s.status === 'failed') {
      for (const line of s.stackTrace) {
        console.log(`           ${line}`)
      }
    }
  }
  if (report.after) {
    console.log(`  after: ${report.after.status}`)
  }

  return report.success ? 0 : 1
}

if (import.meta.main) {
  const argv = [...Deno.args]
  const code = await main(argv)
  Deno.exit(code)
}

export { main as cliMain, parseArgs as _parseCliArgs }
