// 对外导出：DSL 原语 + hook + 类型 + run

// 类型
export type { CacheableRecord, CacheableValue, Stage, Suite, Unwrap, UnwrapAll } from './dsl.ts'

export type { Artifact, AssertionRecord, RunContext, StageContext, StageStatus } from './context.ts'

export type { RunOptions, RunReport, StageRecord } from './runner.ts'

// 六个原语 + 语法糖 + 两个 hook + run
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
