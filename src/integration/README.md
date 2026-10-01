# @jitex/integration - E2E Pipeline DSL

This is only how to use it.

## 1. Write a pipeline file

Create `my-pipeline.ts`:

```ts
import {
  assert,
  attachJson,
  attachText,
  cache,
  log,
  stage,
  suite,
} from '@jitex/integration'

export default suite('demo', () => {
  const build = cache(
    stage('build', [], () => {
      log('building...')
      attachText('source.txt', 'hello')
      attachJson('meta.json', { compiler: 'v1' })
      return { size: 2 }
    }),
  )

  const check = cache(
    stage('check', [build], ([b]) => {
      assert(b.size === 2, 'size')
      return { ok: 1 }
    }),
  )

  stage('report', [check], ([c]) => {
    assert(c.ok === 1, 'ok')
  })
})
```

## 2. Run it

Run from the repo root:

```bash
deno run -A src/integration/cli.ts run my-pipeline.ts --purge
deno run -A src/integration/cli.ts run my-pipeline.ts --with-cache
deno run -A src/integration/cli.ts run my-pipeline.ts --with-cache --filter "report"
deno run -A src/integration/cli.ts run my-pipeline.ts --no-report
```

## 3. See results

Reports are written under `./reports` by default. Open:

```text
reports/index.html
reports/{runId}/index.html
```

The run page shows stages, logs, and attached artifacts.

Use `--report-dir <path>` to change the output directory.

If all stages pass, the exit code is `0`. Otherwise it is `1`.

## 4. Pass config

```bash
deno run -A src/integration/cli.ts run my-pipeline.ts -a mode=fast -a debug=false
```

```ts
export default suite('demo', ({ mode, debug }) => {
  // mode is 'fast', debug is 'false'
})
```