// 对外导出：DSL 原语 + hook + 类型 + run

// 类型
export type {
  Stage,
  Suite,
  Unwrap,
  UnwrapAll,
  CacheableValue,
  CacheableRecord,
} from './dsl.ts'

export type {
  Artifact,
  AssertionRecord,
  StageStatus,
  StageContext,
  RunContext,
} from './context.ts'

export type { RunOptions, RunReport, StageRecord } from './runner.ts'

// 六个原语 + 语法糖 + 两个 hook + run
export {
  AssertionError,
  suite,
  stage,
  cache,
  before,
  after,
  assert,
  assertEquals,
  attach,
  attachText,
  attachJson,
  log,
} from './dsl.ts'

export { run } from './runner.ts'
