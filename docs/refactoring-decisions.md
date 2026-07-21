# 重构待决策问题清单

本文档记录 M5 Phase 5 重构期间发现但未决策的问题。每个问题需要用户决策后才能执行。

## 待决策问题

### D1: 顶层 API 导出策略

**现状**：
- `src/index.ts` 导出 parse/AST 类型，但不导出 `runJS`/`compileToJS`
- `src/js-compiler/index.ts` 是实际执行 API 入口
- 用户必须从 `src/js-compiler` 子路径导入

**方案选项**：
- A. 在 `src/index.ts` 加 `export * from './js-compiler'`（简单，但可能污染命名空间）
- B. 在 `src/index.ts` 选择性导出 `runJS`/`compileToJS`/`RunState`/`JSRunOptions`（推荐）
- C. 保持现状（分层清晰，但文档不一致）

**影响**：对外 API 契约，文档需要同步更新

---

### D2: `compiler.ts` 拆分方案

**现状**：`src/js-compiler/compiler.ts` 约 1500 行，包含所有 AST 节点类型的编译逻辑

**方案选项**：
- A. 按 AST 节点类型拆分：`compile-expression.ts`、`compile-statement.ts`、`compile-declaration.ts`、`compile-type.ts`
- B. 按职责拆分：`compiler.ts`（主类）+ `emit-utils.ts`（工具函数）+ `emit-expr.ts`（表达式）+ `emit-stmt.ts`（语句）
- C. 保持现状（单文件便于全局搜索）

**风险**：拆分可能引入循环依赖；strategy.ts 已经 type-import compiler.ts

---

### D3: `item.ts` 拆分方案

**现状**：`src/js-compiler/item.ts` 混合了：
- `BUILTIN_SYSCALLS` / `BUILTIN_NO_ARG`（内置函数表）
- `ProcInfo`（过程信息）
- `Scope`（编译期作用域）
- `builtinReturnType` / `isScalar`（工具函数）

**方案选项**：
- A. 拆为 `builtins.ts`（内置函数表）+ `scope.ts`（Scope/ProcInfo）+ `type-utils.ts`（isScalar 等）
- B. 保持现状（文件不大，拆分收益有限）

---

### D4: `tests-tex/` VM 时代遗留测试的处理

**现状**：
- `tests-tex/tangle-run.test.ts`、`tex82-compile.test.ts`、`tex82-run.test.ts` 仍 import 已删除的 `StaticAnalyzer`
- 这些测试使用 M4 VM 时代的 JsonCode 工作流，在当前架构下已无意义
- `tex82-trip.test.ts` 的 import 已修复，但其他三个未处理

**方案选项**：
- A. 重写这些测试，改用 `runJS` + `compileToJS` 验证（工作量大）
- B. 删除这些测试，Phase 7 跑 TEX82 时重新写（推荐，反正 Phase 7 才需要）
- C. 保留但跳过（添加 `.skip`，避免编译错误）

**影响**：TEX82 移植的测试覆盖

---

### D5: `q10-m35-conformance.test.ts` 中 `expectedError` 误报

**现状**：
- 测试期望 `'Unsupported statement: CaseStatement'` 和 `'Unsupported statement: WithStatement'`
- 但 JS 编译器已支持 CaseStatement 和 WithStatement
- 测试通过是因为 `_helper.ts` 把 `expectedError: true`（boolean）转成空字符串，导致 expectedError 检查形同虚设

**方案选项**：
- A. 移除这两个测试用例的 `expectedError`，改为验证正常执行（推荐）
- B. 修复 `_helper.ts`，让 `expectedError: true` 真正检查错误（可能破坏其他测试）

**影响**：测试覆盖率真实性

---

### D6: 提交信息规范

**现状**：
- 提交信息混用中英文
- 部分提交过于简短（如 `07b1c0f 回滚行号`）
- 拼写错误（如 `227e168 refactory strategy`）
- 一个提交做两件事（如 `cf109c4` 同时 fix + tests-tex 调整）

**方案选项**：
- A. 强制 Conventional Commits（`feat`/`fix`/`refactor`/`docs`/`test`/`chore`）+ 英文
- B. 强制 Conventional Commits + 中文描述
- C. 不强制，但要求每个提交有清晰的 scope 和说明

**影响**：项目历史可读性

---

### D7: `_helper.ts` 向后兼容别名的清理时机

**现状**：
- `_helper.ts` 导出 `VMTest`/`runVM`/`runVMTest`/`runVMTests` 作为 `JSTest`/`runTest`/`runJSTest`/`runJSTests` 的别名
- 大量测试文件仍使用旧名称

**方案选项**：
- A. 一次性全量替换所有测试文件中的 `runVM` → `runTest` 等（工作量大但彻底）
- B. 保留别名，新测试用新名称（渐进式）
- C. 删除别名，强制更新所有调用方（破坏性）

---

### D8: `tests-tex/tex82-trip.test.ts` 中 stringPlugin 的处理

**现状**：
- `tex82-trip.test.ts:5` 从 `src/js-compiler/types` 导入 `stringPlugin`
- 但 `runJS` 默认只加载 4 个 base plugins（integer/boolean/char/real），需要显式传入 stringPlugin
- 这说明 TEX82 需要 string 类型支持

**问题**：是否应该让 `runJS` 默认加载所有 plugins？

**方案选项**：
- A. `runJS` 默认加载所有 11 个 plugins（简单，但可能影响性能）
- B. 保持显式传入（灵活，但容易遗漏）
- C. `runJS` 默认加载 base + string + file（常用组合）

---

## Discovered Issues

（重构过程中发现的非阻塞问题，待后续处理）

### I1: `compileToJS` 与 `runJS` plugins 不一致

`compileToJS` 只用 4 个 base plugins，`runJS` 也是 4 个 base plugins。
但 `tex82-trip.test.ts` 需要显式传入 stringPlugin，说明调试时 `compileToJS` 看到的代码可能和 `runJS` 不同。

### I2: `context.ts:86` StaticAnalyzer 注释残留

`// 多维数组：StaticAnalyzer 把 array[1..2,1..3] of integer 压成...` —— StaticAnalyzer 已删除，注释应改为描述当前 type-table-builder 的行为。

### I3: tests-tex 的 console.log 中的 VM 字样

`tex82-trip.test.ts`、`tex82-tangle.test.ts`、`tangle-run.test.ts`、`tex82-run.test.ts` 中有 `'VM status:'`、`'VM error:'` 等 log，不影响功能但命名过时。

---

## 顶层原则

### 原则 A：以 ISO Pascal 1983 为标准

- **默认满足标准**：所有默认行为必须符合 ISO Pascal 1983 规范
- **非标默认报错**：非标特性在默认配置下必须报错（不允许静默接受）
- **注入优先**：非标特性通过"额外注入"方式启用（如传入 plugin/sysCall），无法注入时才用配置选项
- **ISO 章节引用**：非标特性的代码注释中必须引用对应的 ISO 章节
- **正反测试**：每个非标特性必须有正反两个测试：
  - 正：添加非标配置后，特性正常工作
  - 反：默认配置下，特性报错
- **最小化权限**：测试中遵循最小化权限原则——非必要不启用非标特性

---

## 决策记录

| 日期 | 问题 | 决策 | 执行情况 |
|------|------|------|---------|
| 2026-07-20 | 原则 A | 以 ISO Pascal 1983 为标准，详见上方"顶层原则" | 已记录 |
| 2026-07-20 | D1 | B：在 `src/index.ts` 选择性导出 `runJS`/`compileToJS`/`RunState`/`JSRunOptions` | 待执行 |
| 2026-07-20 | D2 | B：按职责拆分 `compiler.ts` → `compiler.ts`(主类) + `emit-utils.ts` + `emit-expr.ts` + `emit-stmt.ts` | 待执行 |
| 2026-07-20 | D3 | 改名，拆分到 D2 拆分的文件中（`item.ts` 内容分散到 emit-utils 等） | 待执行 |
| 2026-07-20 | D4 | A：重写 tests-tex 测试用 `runJS`+`compileToJS`；但不立即测试，`tests/resources` 移到 `tests-tex/` | 待执行 |
| 2026-07-20 | D5 | 以原则 A 为准（移除 expectedError，改为验证正常执行） | 待执行 |
| 2026-07-20 | D6 | 积极提交，避免用户提交；规范仍需遵循 Conventional Commits | 待执行 |
| 2026-07-20 | D7 | A：一次性全量替换；但不用 `JSTest`/`runJSTest`，用更通用的名字（测试的是 Pascal，与引擎无关） | 待执行 |
| 2026-07-20 | D8 | 以原则 A 为准（默认只加载标准 plugins，非标通过注入） | 待执行 |
| 2026-07-20 | I1 | 以原则 A 为准（`compileToJS` 和 `runJS` 默认行为一致） | 待执行 |
| 2026-07-20 | I2 | 暂缓，整个 `types/` 目录都需要重构 | 待执行 |
| 2026-07-20 | I3 | 更新（清理 tests-tex 中 VM 字样的 console.log） | 待执行 |
| 2026-07-20 | 工作流 | 合并 plan.md 和 plan-m5-high-performance.md 为一个文档；过时文档直接删除（git 有历史）；plan.md 加文档索引表 | 已执行 |

---

## 元哲学：决策依据

1. **标准锚定**：以 ISO Pascal 1983 为唯一行为标准，不争论，查标准
2. **默认安全**：默认行为必须标准、安全、可预测；非标特性必须显式启用
3. **命名反映意图**：命名指向"做什么"而非"怎么做"（如测试接口名反映"Pascal 测试"而非"JS 测试"）
4. **减少认知负担**：文档集中、精简，一个概念只在一个地方定义

## 工作流改进

### 问题根因
文档分散 + 没有更新机制 = 文档必然过时。AI 每次只读几个文档，必然遗漏。

### 改进方案
1. **合并文档**：`plan.md` + `plan-m5-high-performance.md` → 合并为一个 `plan.md`
2. **文档索引**：`plan.md` 末尾维护文档索引表，标明每个文档用途
3. **过时文档直接删除**：不再移动到 archive/，git 历史就是归档
4. **决策必记录**：所有架构/规范决策记录到 `docs/refactoring-decisions.md`
