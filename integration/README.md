# @jitex/integration — E2E 流水线 DSL

多阶段、有依赖、可缓存、可产出报告的端到端流水线框架。
用于编排 "编译 → 运行 → 比对产物" 这类需要附件和结构化报告的长任务
（典型场景：`boot-tex` 中的 TANGLE 自举、TeX trip 测试等，这类场景 deno test
无法直接对二进制行为做单元断言）。

本项目**不包含任何 TeX 相关代码**。TeX 侧的流水线定义放在 `../boot-tex/`。

---

## 1. 快速开始

### 1.1 声明一个 suite

创建 `my-pipeline.ts`：

```ts
import {
  suite, stage, cache,
  assert, assertEquals,
  attach, attachText, attachJson,
  log, before, after,
  run,
} from '@jitex/integration'

export default suite('demo', () => {
  before(() => console.log('setup'))
  after(() => console.log('teardown'))

  // stage 1：无依赖，被 cache() 标记 → 结果可复用
  const base = cache(
    stage('build', [], () => {
      log('compiling...')
      const code = new Uint8Array([0xca, 0xfe])
      attachText('source.txt', 'program demo;\nbegin end.')
      attachJson('meta.json', { compiler: 'v1' })
      attach('a.out', code)
      return { size: code.length, sha: 'deadbeef' }
    }),
  )

  // stage 2：依赖 build 的结果
  const check = cache(
    stage('check', [base], ([b]) => {
      log(`binary size = ${b.size}`)
      assertEquals(b.size, 2, 'binary size')
      return { ok: 1 }
    }),
  )

  // stage 3：末段，不缓存
  stage('report', [check], ([c]) => {
    assert(c.ok === 1, 'all good')
  })
})
```

### 1.2 运行

```bash
# 首次全量跑，写缓存 + 落盘报告
deno run -A src/cli.ts run my-pipeline.ts --purge

# 后续 strict 模式：只走缓存（命中失败直接报错）
deno run -A src/cli.ts run my-pipeline.ts --with-cache

# 只跑末段 report：依赖 build/check 自动从缓存取
# （前提是 build/check 都被 cache() 标记且已有缓存）
deno run -A src/cli.ts run my-pipeline.ts --with-cache --filter "report"

# 只跑不落盘报告（快速迭代）
deno run -A src/cli.ts run my-pipeline.ts --no-report
```

退出码：所有 stage 成功 → `0`；任一 failed/skipped 或 hook 失败 → `1`。

---

## 2. 原语一览

### 六个核心原语

| 原语 | 说明 | 调用位置 |
|---|---|---|
| `stage(name, deps, fn)` | 声明一个有依赖的执行单元（惰性） | suite fn 内 |
| `suite(name, fn)` | 立即执行 fn 并登记 stages/hooks，产出 `Suite` 对象 | 顶层入口 |
| `cache(stage)` | 标记 stage 可缓存（返回同一对象，幂等） | suite fn 内 |
| `assert(cond, msg)` | 断言失败 → 抛 `AssertionError`，当前 stage `failed` | stage fn 内 |
| `attach(name, bytes)` / `attachText` / `attachJson` | 把字节/text/JSON 作为产物挂到当前 stage | stage fn 内 |
| `log(msg)` | 追加一行日志到当前 stage | stage fn 内 |

### 两个 hook

| Hook | 说明 |
|---|---|
| `before(fn)` | suite 第一个 stage 之前执行一次 |
| `after(fn)`  | suite 最后一个 stage 之后执行一次（无论成败） |

**注意**：`before` / `after` 和 suite fn 体内**不能**调用 `assert`/`attach`/`log`
（无当前 stage 上下文 → 直接抛错）。

### 类型安全

- `stage('a', [], () => ({ x: 1 }))` 的结果类型自动推导并沿依赖链传递。
- `cache()` 要求返回值是扁平 `Record<string, string | number | Uint8Array>`
  （不允许嵌套 Record，避免序列化复杂度）。需要结构化数据时自行 JSON 序列化到
  `string` 字段，或扁平化 key。

---

## 3. 缓存语义（重要）

默认行为和常见构建工具**不同**，务必注意：

| 模式 | 触发条件 | 缓存恢复 | 缓存写入 |
|---|---|---|---|
| **刷新（默认）** | 不加任何 cache 参数 | ❌ 从不恢复，每次重跑 | ✅ `cache()` 标记的 stage 成功后写入 |
| **严格缓存** | `--with-cache` | ✅ 只在本模式恢复，缺则报错 | ✅ 成功后覆写 |
| **清空** | `--purge` | — | 启动前整个 `cacheDir` 被删除 |

设计意图：
- 默认刷新：避免"改了代码还在跑旧结果"这类难调试的问题。
- 严格模式：`boot-tex` 调试末段时使用，要求前段全部已经缓存命中；缺缓存直接报错，
  不会"悄悄重跑前段"导致等待时间不可控。

**工作流建议**：
1. 新代码首次 → `--purge` 全量跑一遍，生成缓存。
2. 改末段 stage → `--with-cache --filter "末段-name"`，快反馈。
3. 改了前段 stage → `--purge` 重跑（或至少删掉该 stage 的缓存目录）。

缓存目录默认 `{reportDir}/.cache`，结构：
```
.cache/{suiteName}/{stageName}/
  ├─ meta.json           # 时间戳、依赖 checksums、自身 checksum
  ├─ results.json        # 返回值（Uint8Array 用 base64 占位）
  ├─ attachments/{name}  # attach 的字节
  ├─ assertions.json
  └─ logs.txt
```

---

## 4. CLI 选项完整列表

```
deno run -A src/cli.ts run <entry.ts> [options]
```

| 选项 | 默认值 | 说明 |
|---|---|---|
| `--report-dir <path>` | `./reports` | 报告输出目录 |
| `--run-id <id>` | `YYYY-MM-DD_HH-MM-SS_001` | 自定义 run 编号 |
| `--filter <glob>` | 无（全跑）| 按 stage name 做 minimatch（支持 `*` `?`），仅保留匹配 stages |
| `--fail-fast` | `false` | 任一 stage failed 立即停止（默认继续执行无依赖分支） |
| `--cache-dir <path>` | `{reportDir}/.cache` | 缓存根目录 |
| `--with-cache` | `false` | 严格缓存模式：全部 cacheable stages 必须命中缓存 |
| `--purge` | `false` | 启动前清空 `cacheDir` |
| `--no-report` | `false` | 只跑不写任何报告文件（省 IO，快速迭代用） |

`<entry.ts>` 必须 `export default` 一个 `suite(...)` 对象。

---

## 5. 报告格式

默认写盘到 `{reportDir}/`：

```
reports/
├─ index.html                         # 顶层 run 列表
├─ .cache/                            # 缓存（.gitignore 里已排除 /reports）
└─ {runId}/
   ├─ index.html                      # run 摘要：env / files / stages / artifacts
   ├─ overview.json                   # 机器可读结构化数据
   ├─ logs.txt                        # 全 run 日志聚合
   ├─ console.txt                     # 同上（DSL 只有一种 log，默认三份相同）
   ├─ debug.txt                       # 同上
   └─ stages/
      ├─ 1/                           # 每个 stage 一个以 id 命名的子目录
      │  ├─ logs.txt                  # 该 stage 日志
      │  └─ {artifact-name}           # attach 的产物直接落盘
      └─ 2/ ...
```

两份 `index.html` **纯语义化 HTML，零样式、零 JS**
（无 `<style>` 标签、无 `style=` 属性），用浏览器直接打开即可。

---

## 6. 作为库调用（不通过 CLI）

```ts
import { suite, stage, run } from '@jitex/integration'

const s = suite('prog', () => {
  const a = stage('a', [], () => ({ n: 1 }))
  stage('b', [a], ([r]) => console.log(r.n))
})

const report = await run(s, {
  reportDir: './reports',
  runId: 'custom-run',
  withCache: true,
  noReport: false,
})
console.log(report.success, report.stages.map(s => s.status))
```

`RunOptions` 完整字段见 `src/runner.ts` 的接口定义。

---

## 7. 维护指南

### 7.1 目录结构

```
integration/
├─ README.md          # 本文件（使用 + 维护文档）
├─ deno.json          # workspace 成员配置，exports 指向 src/mod.ts
├─ src/               # 全部源码
│  ├─ mod.ts          # 对外导出面：DSL 原语 + hook + run() 类型
│  ├─ dsl.ts          # stage/suite/cache/assert/attach/log 声明与实现
│  ├─ context.ts      # RunContext / StageContext 上下文栈
│  ├─ runner.ts       # 拓扑排序（Kahn）+ 调度 + 失败策略 + 写盘报告调度
│  ├─ cache.ts        # 缓存目录结构、checksum、恢复判定、序列化
│  ├─ reporter.ts     # overview.json / 三份 txt / stages 产物 / 两份 index.html
│  └─ cli.ts          # CLI 参数解析 + 动态 import 入口
└─ tests/
   └─ report.test.ts  # 非 TeX 集成测试（deno test，8 个用例）
```

### 7.2 常用命令

```bash
cd integration

# 类型检查
deno check src/mod.ts src/cli.ts tests/report.test.ts

# 代码风格
deno lint src/ tests/

# 跑测试
deno test -A tests/
```

### 7.3 常见改动点 & 注意事项

1. **新增 DSL 原语**：
   - 在 `dsl.ts` 声明，通过 `requireStageContext()` 拿当前上下文。
   - `src/mod.ts` 导出。
   - 在 `tests/report.test.ts` 补一个最小用例。

2. **改报告结构**：
   - `RunReport`/`StageRecord` 接口在 `src/runner.ts`。
   - 写盘逻辑在 `src/reporter.ts` 的 `writeReport()`。
   - 测试用例 `writes report files with minimal html (no style)` 验证 HTML 零样式
     和关键文件存在性，改动报告时请同步更新断言。

3. **改缓存判定**：
   - 恢复流程在 `src/cache.ts` 的 `tryRecoverCache()`。
   - 默认**不要**在无 `--with-cache` 时恢复缓存（参见 §3 的设计意图）。
   - `filter` 排除但被 active stage 依赖的 cacheable stages，通过
     `runner.ts` 的 `preRecoverFilteredDeps()` **递归**预恢复。

4. **添加 TeX 相关流水线**：
   - **不要**在本项目新增 `.ts` 场景文件。
   - 一律在 `../boot-tex/` 中 `import { suite, ... } from '@jitex/integration'`
     定义流水线，并 `export default suite(...)`。
