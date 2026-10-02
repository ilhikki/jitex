# @jitex/integration - E2E Pipeline DSL

This is only how to use it.

## 1. Write a pipeline file

Create `my-pipeline.ts`:

```ts
import { after, assertIs, attachJson, attachText, before, context, log, stage, suite } from '@jitex/integration'

export default suite('demo', () => {
  const build = stage('build').nodeps(() => {
    log('building...')
    attachText('source.txt', 'hello')
    attachJson('meta.json', { compiler: 'v1' })
    return { size: 2 }
  })

  const check = stage('check').dep(build, (b) => {
    assertIs(b.size, 2, 'size')
    return { ok: 1 }
  })

  stage('report').deps([check], (c) => {
    assertIs(c.ok, 1, 'ok')
    log(`mode = ${context().config.mode}`)
  })

  before(() => {
    log('begin')
  })

  after(() => {
    log('done')
  })
})
```

Dependencies are declared with the builder: `stage(name).nodeps(fn)`, `stage(name).dep(dep, fn)`, or
`stage(name).deps([a, b], (a, b) => ...)`. The callback receives one argument per dependency, in order.

## 2. Run it

Run from the repo root:

```bash
deno run -A src/integration/cli.ts run my-pipeline.ts
deno run -A src/integration/cli.ts run my-pipeline.ts --filter "report"
deno run -A src/integration/cli.ts run my-pipeline.ts --no-report
deno run -A src/integration/cli.ts run my-pipeline.ts -a mode=fast
```

## 3. Filtering

`--filter <glob>` selects stages by name. The selected stages are the targets; their upstream dependencies are pulled in
automatically so every target can run.

## 4. See results

Reports are written under `./reports` by default. Open:

```text
reports/index.html
reports/{runId}/index.html
```

The run directory contains `run.json`, the run page, and one directory per node:

```text
reports/{runId}/
  run.json
  index.html
  before/logs.txt
  stages/{id}/logs.txt
  after/logs.txt
```

Artifacts are written under `attachments/` next to each node's `logs.txt`. When a `before`/`after` hook is not declared,
its directory is not created.

Use `--report-dir <path>` to change the output directory.

If all stages pass, the exit code is `0`. Otherwise it is `1`. Load errors and circular dependencies exit with `2`.

## 5. Hooks

`before` and `after` run unconditionally (when declared) and are recorded like stages. They can use `log`, `attach*`,
and `assert*`.

- If `before` fails, every stage is marked `skipped`, but `after` still runs.
- If `after` fails, the run fails even when all stages passed.

## 6. Pass config

```bash
deno run -A src/integration/cli.ts run my-pipeline.ts -a mode=fast -a debug=false
```

Read config inside a stage or hook via `context().config`:

```ts
stage('report').nodeps(() => {
  const { mode, debug } = context().config
})
```
