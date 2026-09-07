# AGENTS.md

> 项目唯一入口文档。AI 每次任务开始必读。

## 这是什么项目

**JITEX**：Pascal82（ISO 7185）到 JS 的编译器 + TeX 自举套件，基于 Deno workspace 的 monorepo。

核心能力：

- `@jitex/pascal-to-js`：将 Pascal 源码编译为 JS 代码字符串，用 `new Function()` 同步执行。
- `@jitex/integration`：E2E 流水线 DSL——多阶段、有依赖、可缓存、可产出结构化报告的流水线框架， 用于编排"编译 → 运行 →
  比对产物"类长任务（TANGLE 自举、TeX TRIP 等）；不含任何 TeX 代码。
- `@jitex/boot-tex`：TeX82 编译流水线——TANGLE 自举 + TeX TRIP 测试，基于 `@jitex/integration` 编排。

**终极目标**：让 TEX82 在合理时间内跑完。

---

## 任务路由

根据当前任务类型，参考以下文档：

| 任务类型       | 必读                                      | 可选                      |
| -------------- | ----------------------------------------- | ------------------------- |
| 修复 bug       | 本文档#铁律, issue.md                     | 相关模块 README           |
| 添加功能       | 本文档#铁律, task.md                      | 相关模块 README           |
| 重构代码       | 本文档#铁律, task.md                      | 相关模块 README, issue.md |
| 编写/修复测试  | 本文档#铁律, pascal-to-js/tests/README.md |                           |
| 不了解项目背景 | 本文档（本文件）                          | 相关模块 README           |

---

## 铁律（所有任务必须遵守）

### 执行规范

1. **任务开始先规划**：每次执行任务时，需思考——需要更新哪些文档？什么时候提交代码？更新哪些文档？
2. **积极提交**：每个逻辑单元完成后立即提交，不等用户催促。
3. **回归测试**：修改 pascal-to-js 代码后必须运行 `deno test`（顶层 workspace 全部测试）。
4. **TypeScript 检查**：修改 pascal-to-js/src/ 后运行 `deno check`（顶层 `deno.json`）。
5. 每次提交前 fmt 和 lint

### 标准锚定（原则 A）

6. **ISO Pascal 1983 是唯一行为标准**。默认行为必须符合 ISO 标准。
7. **非标特性默认必须报错**。用户未显式启用的非标特性，遇到即抛错。
8. **注入优先，无法注入才配置**。启用非标过程/函数时，优先用"额外 callable"注入： 编译期 `extraCallables`（name →
   `{ sysCallName, kind: 'function'|'procedure', allowOverrideNative }`） 声明非标过程/函数，运行期
   `extraSyscalls`（syscallName → `SyscallHandler`）提供实现。 无法用注入实现的非标语义才用配置项（如
   `extensions: ['string']`）。
   - **合并与覆盖**：分析阶段把原生内建与 `extraCallables` 合并到同一命名空间；名称冲突时， `allowOverrideNative` 为
     `false` 则抛错，为 `true` 则外部覆盖原生。
   - **现状**：`extensions: string[]` 真正强制的只有 `'string'`；Pascal-H 扩展（BREAK/BREAKIN/ERSTAT/CLOSE）通过
     boot-tex 的 `extraCallables`/`extraSyscalls` 注入实现，无独立插件文件。
9. **非标注释引用 ISO 章节**。代码中实现非标特性时，注释必须说明违反了 ISO 7185 的哪个章节。
10. **非标特性配正反测试**。每个非标特性必须有：

- 正测试：启用非标配置，验证功能正常
- 反测试：默认配置下，验证非标特性报错

11. **最小化权限**。测试中非必要不启用非标。

### 架构约束

12. **Frozen Layers**：不修改
    `pascal-to-js/src/ast/`、`pascal-to-js/src/lexer/`、`pascal-to-js/src/parser/`，除非明确是重构任务。
13. **唯一引擎**：`pascal-to-js/src/compiler/` 是唯一执行引擎（IL 管线），无 fallback。
14. **代码即文档**：文件列表、API 签名、实现细节不写进本文档，写进代码注释。
15. **最新原则**：本文档只保留当前有效信息，历史进 git。

---

## 一级目录（Deno Workspace 结构）

顶层为 Deno workspace（见
`deno.json`），包含三个子模块。依赖关系：`boot-tex → integration → pascal-to-js`（单向，无循环）。

| 目录                           | 说明                                                                                                                                                             | 文档                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `deno.json`                    | 顶层 workspace 配置：workspace 列表、import map、tasks、fmt/lint/compilerOptions、unstable.sloppy-imports                                                        | —                                                                                                                       |
| `pascal-to-js/`                | **核心子模块**：Pascal82→JS 编译器（lexer/parser/AST/IL 管线/runtime） + 全部单元/集成/基准测试（1133+ 用例）。无 Node API 依赖，纯 Deno。                       | [pascal-to-js/src/README.md](pascal-to-js/src/README.md) / [pascal-to-js/tests/README.md](pascal-to-js/tests/README.md) |
| `pascal-to-js/_vitest_shim.ts` | 测试运行时：Deno 原生测试之上的 Vitest 兼容层（describe/test/expect/afterAll）。使 `.test.ts` 保持 vitest 风格写法不变。                                         | 代码即文档                                                                                                              |
| `integration/`                 | **E2E 流水线 DSL**：suite/stage/cache/assert/attach/log 原语 + before/after hook + 拓扑调度（Kahn）+ 缓存恢复 + 报告（HTML/JSON/txt）+ CLI（`src/cli.ts run`）。 | [integration/README.md](integration/README.md)                                                                          |
| `boot-tex/`                    | TeX82 编译流水线：TANGLE 自举（`src/tangle/`）+ TeX TRIP 测试（`src/tex/`）。`mod.ts` 暂为空，流水线通过顶层 `deno task boot-tangle` / `boot-tex` 运行。         | —                                                                                                                       |

> **说明**：旧的 `src/`、`tests/`（含 e2e/）目录**已废弃**，被拆分到上述三个子模块。原 e2e
> 代码按用户指示放弃迁移、后续重写；其中 integration 与 boot-tex 已重写完成。 原 e2e 资源用户有独立备份。

---

## 常用命令（顶层 workspace 运行）

所有命令在项目根目录（本文件所在目录）执行：

| 命令               | 说明                                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| `deno test`        | 运行 workspace 全部测试（pascal-to-js 的 unit + integration + benchmark） |
| `deno lint`        | 代码规范检查                                                              |
| `deno fmt --check` | 格式检查；不带 `--check` 则自动格式化                                     |

子模块内部命令直接进子目录运行 `deno test` / `deno lint` 等。

boot-tex 流水线通过顶层 task 运行：`deno task boot-tangle`（TANGLE 自举）、`deno task boot-tex`（TeX TRIP 测试）。

---

## 如何更新本文档

- 新增铁律 → 添加到对应分组，按编号顺延。删除铁律时后面的编号**不回补**，保证编号唯一且稳定。当前铁律共 15
  条（#1-#15）。
- 新增任务类型 → 在"任务路由"表格添加。
- 新增一级目录 → 在"一级目录"表格添加。
- 原则/描述性文字 → 直接修改，无需编号。
