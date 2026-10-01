// Public exports: DSL primitives + hooks + types + run

// Types
export type { CacheableRecord, CacheableValue, Stage, Suite, Unwrap, UnwrapAll } from './dsl.ts'

export type { Artifact, AssertionRecord, RunContext, StageContext, StageStatus } from './context.ts'

export type { RunOptions, RunReport, StageRecord } from './runner.ts'

// Six primitives + syntactic sugar + two hooks + run
export {
  after,
  assert,
  assertEquals,
  AssertionError,
  attach,
  attachJson,
  attachText,
  before,
  cache,
  log,
  stage,
  suite,
} from './dsl.ts'

export { run } from './runner.ts'
