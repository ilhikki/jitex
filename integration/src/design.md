# @jitex/integration — E2E 流水线 DSL 设计

> 状态：设计中（未实现）。本文档定义 DSL 语义、执行模型、外部接口与报告格式。
> 参考报告样例：`E:\code\pascal-ts\reports`。

## 1. 目标与定位

`integration` 是 jitex 的 **e2e 流水线框架**，用于编排多阶段、有依赖的长任务
（典型场景：TANGLE 自举、TeX trip 测试、bootstrap v1→v2→v3 一致性验证）。

它 **不是** `pascal-to-js/tests/integration/` 那种 deno test 单元/集成测试的替代，
而是面向"编译→运行→比对产物"这类需要附件产物、阶段依赖、结构化报告的端到端流水线。

**关键背景**：`boot-tex` 开发期将无法用 deno test 做单元测试（产物是 TeX 二进制行为），
只能依赖本框架做集成测试。因此 CLI 必须支持**可调试**（复用上次编译结果、增量重跑），
为届时的工作流服务。

- 位置：workspace 成员 `./integration`（已存在）
- 依赖：`@jitex/pascal-to-js`（已配置 imports）
- 不重复 deno test 能做的事；不引入子项目级 lint/tasks 配置

## 2. 六个原语 + 两个 hook

### 2.1 `stage` —— 有依赖的惰性执行单元

```ts
interface Stage<R> {
  readonly id: string        // 内部分配，报告用
  readonly name: string
  readonly deps: readonly Stage<unknown>[]
  // fn 与状态为内部字段，不暴露
}

/** 从单个 Stage 解包结果类型 */
type Unwrap<S> = S extends Stage<infer R> ? R : never

/** 从 deps 元组解包为结果元组 */
type UnwrapAll<T extends readonly Stage<unknown>[]> = {
  [K in keyof T]: Unwrap<T[K]>
}

function stage<T extends readonly Stage<unknown>[], R>(
  name: string,
  deps: T,
  fn: (results: UnwrapAll<T>) => R | Promise<R>,
): Stage<Awaited<R>>
```

语义：
- **惰性声明**：调用 `stage()` 仅登记节点，**不执行** `fn`。
- **依赖解包**：`fn` 收到的是 deps 已执行后的**结果值元组**（类型由 `UnwrapAll` 推导）。
- **自动 await**：`fn` 可同步或异步；`Stage<R>` 的 `R` 是 `Awaited` 后的类型。
- **拓扑执行**：`run` 按 DAG 拓扑序执行；dep 失败则后继 stage 跳过（见 §4）。
- stage 必须在 `suite` fn 内声明（见 §2.2）。

### 2.2 `suite` —— 立即执行的分组（run 的入口）

```ts
interface Suite {
  readonly name: string
  // 内部持有：stages 列表 + before/after hooks
}

function suite(name: string, fn: () => void): Suite
```

语义：
- **立即执行** `fn`（在调用点同步运行）。
- `fn` 内只能调用：`stage(...)`（登记到本 suite）、`cache(...)`（标记可缓存）、
  `before(...)`/`after(...)`（登记 hook）、以及同步 setup 代码（读文件、准备夹具等）。
- **禁止** 在 suite fn 内直接调用 `assert` / `attach` / `log`（无 stage 上下文 → 抛错）。
- suite 是 `run()` 的唯一入参（见 §7）。
- suite **不可嵌套**（一个 suite fn 内声明另一个 suite → 抛错），保持单层分组。

### 2.3 `cache` —— 显式标记 stage 可被缓存恢复

```ts
/**
 * 可缓存值：string / Uint8Array / number，三者之一。
 * 不允许递归 Record（避免序列化复杂度与边界歧义）。
 */
type CacheableValue = string | Uint8Array | number

/**
 * 可缓存结果类型：Record，key 为 string，value 为 CacheableValue。
 * 不允许递归 Record。
 */
type CacheableRecord = Record<string, CacheableValue>

function cache<R extends CacheableRecord>(stage: Stage<R>): Stage<R>
```

语义：
- 返回同一个 `stage` 对象，但在其内部标记"可缓存"（同一 stage 多次 `cache()` 幂等）。
- **只有** 被 `cache()` 标记过的 stage，才可能从缓存中恢复（跳过 fn 执行，直接用缓存数据填充上下文）。
- **类型约束**：`R` 必须是 `CacheableRecord`（key string，value 仅 string/Uint8Array/number，不递归）。
  类型不满足 → TypeScript 编译期报错。
- **恢复条件**：满足以下**全部** 条件时，stage 从缓存恢复（跳过 fn）：
  1. 该 stage 被 `cache()` 标记过。
  2. 缓存目录中存在该 stage 的缓存条目。
  3. 缓存条目记录的 **所有依赖 stage**（直接 + 传递）均也被 `cache()` 标记，且缓存均存在、版本匹配。
  4. 缓存内容校验通过（大小、校验和）。
- **不满足恢复**：正常执行 fn。
- **写入缓存**：被 `cache()` 标记的 stage 执行成功后**自动**写入缓存目录（不需要额外开关）。
- **缓存与 artifacts**：缓存条目中同时保存该 stage 的 `artifacts[]` 字节流；恢复时 artifacts 照样落盘到本次报告目录。

> 为什么不递归？递归 Record 会导致 key 冲突、大小膨胀、部分更新一致性等问题。
> 若需结构化结果，建议扁平化 key（如 `foo.bar` 合并为一个 string key，或自行 JSON 序列化到 string 值）。

### 2.4 `assert` —— 断言

```ts
function assert(cond: boolean, message: string): void

// 可选语法糖
function assertEquals<T>(actual: T, expected: T, message?: string): void
```

语义：
- `cond` 为假时**抛出 `AssertionError`**，当前 stage 标记为 `failed`。
- 断言记录附加到**当前 stage 上下文**（见 §5），写入报告 `assertions[]`。
- `assertEquals` 是 `assert(Object.is(a,b), msg)` 的糖，额外记录 `actual`/`expected`。
- 只能在 stage fn 内调用。

### 2.5 `attach` —— 附件产物

```ts
function attach(name: string, bytes: Uint8Array): void

// 可选语法糖
function attachText(name: string, text: string): void      // → UTF-8 编码为 Uint8Array
function attachJson(name: string, obj: unknown): void       // → JSON.stringify + UTF-8
```

语义：
- 将字节流作为命名产物附加到**当前 stage 上下文**。
- `run` 执行后，每个 stage 的附件落盘到 `stages/{id}/{name}`。
- `name` 可含扩展名；同名附件后者覆盖前者。
- 报告 `overview.json` 的 `artifacts[]` 记录 `name` / `size` / `lines`（lines 仅对文本类按 `\n` 计数）。
- 只能在 stage fn 内调用。

### 2.6 `log` —— 日志

```ts
function log(message: string): void
```

语义：
- 向**当前 stage 上下文**追加一行日志。
- DSL 层只有这一个 `log` 函数，**不区分** level。
- 报告分层（`logs` / `consoleLogs` / `debugLogs`）由 `run` 的参数控制（见 §7 `logSink`）。
- 只能在 stage fn 内调用。

### 2.7 `before` / `after` —— suite 级 hook

```ts
function before(fn: () => void | Promise<void>): void
function after(fn: () => void | Promise<void>): void
```

语义：
- 只能在 `suite` fn 内登记（每个 suite 至多一个 `before`、一个 `after`，重复登记后者覆盖）。
- `before`：在 suite 内**第一个 stage 执行之前**运行一次。
- `after`：在 suite 内**最后一个 stage 执行之后**运行一次（无论成功/失败/skipped）。
- hook 内**禁止** 调用 `assert`/`attach`/`log`（无 stage 上下文 → 抛错）。
- 用途：suite 级 setup/teardown（清空临时目录、准备共享夹具、汇总校验等）。
- hook 抛错 → suite 标记为 `failed`，所有 stage 标记 `skipped`（before 失败）或
  正常记录（after 失败，不影响已完成的 stage 状态）。

## 3. 类型体操说明

`UnwrapAll` 保证依赖结果类型安全推导：

```ts
const A = stage('a', [], () => ({ x: 1, y: 'hi', z: new Uint8Array([1,2,3]) }))
// Stage<{ x: number; y: string; z: Uint8Array }>  ✓ 满足 CacheableRecord
const A_cached = cache(A)   // ✓ 类型检查通过

const B = stage('b', [], () => ({ fn: () => {} }))
cache(B)                    // ✗ TS 报错：{ fn: Function } 不满足 CacheableRecord

const C = stage('c', [A_cached], ([a]) => ({ doubled: a.x * 2 }))
cache(C)                    // ✓
```

- `deps` 必须是 `readonly Stage<unknown>[]`（元组字面量才保留顺序信息）。
- 空依赖：`stage('x', [], () => ...)`，`fn` 收到 `[]`。
- `cache()` 返回同类型，不影响依赖链的类型推导。

## 4. 缓存机制详解

### 4.1 缓存条目结构

```
{cacheDir}/{suiteName}/{stageName}/
  ├─ meta.json          // 版本、时间戳、依赖缓存版本列表、校验和
  ├─ results.json       // CacheableRecord（JSON 可直接序列化）
  ├─ attachments/
  │   ├─ {name}         // attach 的产物原样保留（Uint8Array 直接写盘）
  │   └─ ...
  ├─ assertions.json    // 断言记录
  └─ logs.txt           // 日志聚合
```

`meta.json` schema：
```json
{
  "stageName": "compile-tangle",
  "createdAt": "2026-08-14T08:46:07.001Z",
  "checksum": "sha256:...",          // results + attachments 整体校验
  "deps": [
    { "stageName": "parse-pas", "checksum": "sha256:..." },
    { "stageName": "parse-web", "checksum": "sha256:..." }
  ]
}
```

### 4.2 恢复判定流程（每个 stage 执行前）

```
若该 stage 未被 cache() 标记 → 正常执行 fn，不读不写缓存。
否则：
  1. 读取该 stage 的 meta.json（不存在 → 执行 fn）。
  2. 遍历 meta.deps 中的每个依赖：
     a. 依赖 stage 必须也被 cache() 标记过（否则本 stage 不恢复）。
     b. 依赖自身的缓存 checksum 与 meta.deps[i].checksum 匹配（否则失效）。
  3. 若 2 中所有依赖均通过 → 检查本 stage results+attachments 的 checksum。
  4. checksum 通过 → 恢复：
     - 加载 results 注入上下文（供后继 deps 使用）
     - artifacts 复制到本次报告目录
     - assertions / logs 注入上下文
     - 状态设为 success，duration 记为 0
  5. 任一步失败 → 正常执行 fn → 执行成功后**覆写**缓存目录（更新 meta/results/...）
```

### 4.3 版本判定

- 不引入"源文件 mtime"之类的隐式失效规则（不稳定、跨机不可移植）。
- 缓存是否有效**唯一**依赖"自身 checksum + 所有依赖 checksum"。
- 源文件变化导致 parse stage fn 重新执行并写入新 checksum → 后继依赖自动失效（deps 不匹配）。
- 强制失效：`--purge` 清空整个 cache 目录或手动删 `{suiteName}/`。

## 5. 执行模型

### 5.1 调度

1. `run(suite, options)` 取出 suite 内登记的 stages + before/after hooks + cache 标记集合。
2. 拓扑排序（Kahn 算法）；检测循环依赖 → 报错。
3. 执行顺序：
   1. `before` hook（若有）。
   2. 按拓扑序逐个执行 stage：
      - 先尝试按 §4.2 流程从缓存恢复（仅被 `cache()` 标记的 stage）。
      - 未命中 → 取 dep 已缓存/执行的结果 → 调用 `fn(results)` → 缓存本 stage 结果（被 cache 标记且成功）。
   3. `after` hook（若有，必执行）。
4. 每个 stage 计时（`duration` ms，命中缓存记为 0 或很小的加载耗时）。
5. stage 执行期间维护"当前上下文"（§6），收集 `assert`/`attach`/`log`。

### 5.2 失败策略

- stage `fn` 抛异常或 `assert` 失败 → stage 状态 `failed`，记录 `stackTrace`/`logs`。
  （缓存不写入——只有成功才写）。
- 依赖该 stage 的后继 → 状态 `skipped`（不执行 fn）。
- 默认 **fail-fast = false**：继续执行无依赖关系的其它 stage（最大化收集信息）。
- `before` 失败 → 所有 stage `skipped`，suite `failed`。
- `after` 失败 → suite `failed`，但已完成的 stage 状态保留。
- 整体 `success = suite before ok AND 所有 stage 状态 ∈ {success} AND after ok`。

### 5.3 同步/异步

- stage fn / hook 均可返回 Promise；`run` 内部 `await`。
- `run` 本身返回 `Promise<RunReport>`。

### 5.4 runId 命名规则

`YYYY-MM-DD_HH-MM-SS_NNN`：
- 前 19 位：本地时区时间戳。
- `NNN`：同秒内三位序号（从 `001` 开始）。
- 报告目录下已存在同名 runId 时，`NNN` 递增。

## 6. 上下文与产物收集

执行期间维护**上下文栈**：

```
RunContext (顶层)
 └─ StageContext (当前正在执行的 stage)
```

- `attach`/`assert`/`log` 全部写入栈顶 `StageContext`。
- stage fn 结束后，`StageContext` 冻结为该 stage 的记录。
- hook 执行期间**无** StageContext（调用 `attach`/`assert`/`log` 抛错）。

每个 `StageContext` 产出：
- `results`：fn 返回值（供后继 stage 使用，并参与缓存序列化）
- `assertions[]`：`{ name, passed, actual?, expected? }`
- `artifacts[]`：`{ name, bytes(Uint8Array) }`
- `logs[]`：字符串数组
- `status` / `duration` / `stackTrace`

`metrics{}` 不作为独立字段——`artifacts[]` 已记录 `size`/`lines`，足够。

## 7. `run` 外部接口

```ts
interface LogSink {
  // DSL 的 log(message) 调用此函数；实现决定写到 logs/consoleLogs/debugLogs
  write(stageId: string, message: string): void
}

interface RunOptions {
  reportDir?: string         // 默认 ./reports
  runId?: string             // 默认 YYYY-MM-DD_HH-MM-SS_NNN（同秒递推）
  filter?: (stage: Stage<unknown>) => boolean  // 选择性执行
  failFast?: boolean         // 默认 false
  env?: Record<string, string> // 记录到报告 env
  cacheDir?: string          // 默认 {reportDir}/.cache
  logSink?: LogSink          // 默认：log 同时写入 logs/consoleLogs/debugLogs（三份相同）
}

interface RunReport {
  id: string
  timestamp: string
  success: boolean
  duration: number
  env: { runtime: string; platform: string; arch: string }
  args: string[]
  stages: StageRecord[]
}

function run(suite: Suite, options?: RunOptions): Promise<RunReport>
```

- 入参为 `Suite`（不是 stages 数组）：`run(mySuite)`。
- 不采用全局注册方案——所有 stage 必须在传入的 suite 内声明。
- **filter 与缓存/依赖的交互**：
  - `filter` 排除的 stage 在报告中**不出现**（也不执行、不读缓存）。
  - 若 `filter` 保留的某个 stage，其某个依赖被 `filter` 排除：
    - 尝试从缓存取该依赖（仅当依赖被 `cache()` 标记且缓存存在）→ 取到则可继续。
    - 否则报错："stage X 依赖 Y，但 Y 不在 filter 范围内且无可恢复缓存"。
  - 这正是 boot-tex 调试"只跑末段、前段复用缓存"的典型场景。

## 8. CLI

入口：`integration/cli.ts`（或 `deno task` 在根 deno.json 暴露，**不**在子项目加 task）。

```
jitex-integration run <entry.ts> [options]
  --report-dir <path>     报告输出目录（默认 ./reports）
  --run-id <id>           指定 runId（如 last、last-success），默认时间戳
  --filter <glob>         按 stage name 过滤（示例："compile-*"、"trip-*"）
  --fail-fast             失败即停止
  --no-report             只跑不生成报告
  --cache-dir <path>      缓存目录（默认 {reportDir}/.cache）
  --purge                 启动前清空缓存目录
```

- `<entry.ts>`：声明 suite 的入口模块，末尾**必须** `export default mySuite`。
- CLI 用动态 `import()` 加载，取 default export 作为 `run()` 入参。
- 退出码：成功 `0`，有失败 `1`。
- **boot-tex 开发期典型用法**：
  - 首次全量：`jitex-integration run scenarios/tangle.ts`（被 `cache()` 标记的 stages 自动写入缓存）。
  - 迭代末段：`jitex-integration run scenarios/tangle.ts --filter "trip-*"`
    （前段自动从缓存恢复——前段必须被 `cache()` 标记且有缓存；否则报错提示先全量跑一次）。
  - 改源后重跑：`--purge` 清空缓存目录重建。
  - 定位某个 stage：`--filter "compile-tangle"` 只跑它（若有依赖则自动取缓存）。

## 9. 报告格式（对齐 pascal-ts/reports）

完全对齐参考样例的目录结构与字段：

```
reports/
├─ index.html                          # 所有 run 列表
├─ .cache/                             # 缓存根（cacheDir 默认位置）
│  └─ {suiteName}/
│     └─ {stageName}/{meta.json, results.json, attachments/, ...}
└─ {runId}/
   ├─ index.html                       # 本次 run 摘要 + stage 列表
   ├─ overview.json                    # 结构化数据（核心）
   ├─ console.txt                      # 全 run console 日志聚合
   ├─ debug.txt                        # 全 run debug 日志聚合
   ├─ logs.txt                         # 全 run 普通日志聚合
   └─ stages/
      └─ {id}/
         ├─ logs.txt                   # 该 stage 日志
         ├─ {artifact-name}            # attach 的产物原样落盘
         └─ ...
```

`overview.json` schema（对齐样例）：

```jsonc
{
  "id": "2026-08-14_16-46-07_001",
  "timestamp": "2026-08-14T08:46:07.001Z",
  "success": true,
  "duration": 233603,           // ms
  "env": { "runtime": "deno x.x", "platform": "win32", "arch": "x64" },
  "args": [],
  "stages": [
    {
      "id": "1",
      "title": "parse tangle-official.pas",
      "status": "success",      // success | failed | skipped
      "duration": 180,
      "cached": true,           // ← 新增：是否从缓存恢复
      "artifacts": [
        { "name": "tangle-official.pas", "size": 45963, "lines": 784 }
      ],
      "logs": ["..."],
      "consoleLogs": [],
      "debugLogs": [],
      "stackTrace": [],
      "assertions": [
        { "name": "parse ok", "passed": true, "actual": "ok", "expected": "ok" }
      ]
    }
  ]
}
```

`index.html` 生成规则：
- 顶层 `index.html`：列出所有 `{runId}` 及时间/状态/耗时。
- run 级 `index.html`：环境信息 + 文件清单 + stage 列表（含 `[ok]/[FAIL]/[SKIP]` 标记、耗时、产物链接、`[cached]` 标识）。
- HTML 为**纯静态、无 JS**，仅链接到产物文件。

报告工具：`integration/reporter.ts`，输入 `RunReport` + 产物目录，输出 HTML/JSON/聚合 txt。

**日志分层映射**：DSL 只有 `log(msg)`；`overview.json` 仍保留 `logs`/`consoleLogs`/`debugLogs` 三字段
以兼容样例。默认 `logSink` 把每条 log 同时写入三个字段；用户可自定义 `logSink` 按内容前缀
（如 `[debug] ` / `[console] `）路由到不同字段。

## 10. 目录结构（拟）

```
integration/
├─ deno.json            # 已存在（保留 imports，不加 lint/tasks）
├─ mod.ts               # 导出 DSL：stage/suite/cache/assert/assertEquals/attach/attachText/attachJson/log/before/after/run
├─ design.md            # 本文档
├─ dsl.ts               # 原语 + hook 实现
├─ context.ts           # RunContext / StageContext 上下文栈
├─ runner.ts            # 拓扑排序 + 调度 + 失败策略
├─ cache.ts             # 缓存读写（目录结构）、checksum 计算、恢复判定
├─ reporter.ts          # overview.json + html + 聚合日志
├─ cli.ts               # CLI 入口
└─ scenarios/           # 具体流水线（如 tangle-bootstrap.ts）
```

## 11. 待确认问题

*（本轮更新后暂无未定项；以下为可微调项，无强偏好可按默认实施。）*

- **T1**：缓存命中时 stage 的 `duration` 记 0 还是实际读盘耗时？默认 0（和正常执行明确区分），在 UI 上显示 `[cached]` 标识。
- **T2**：`attach` 的 bytes 与 `CacheableValue` 中的 `Uint8Array` 值是否共享落盘逻辑？默认共享同一写盘函数，避免重复代码。
- **T3**：被 `cache()` 标记但 fn 返回值含 **循环引用**（虽然 `CacheableRecord` 不允许 Record 嵌套，但 Uint8Array 不会有循环引用，其他值均为原始类型）——理论上不会发生，是否仍需防御性检查？默认不需要（类型约束已排除）。
