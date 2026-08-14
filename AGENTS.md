# AGENTS.md

> 项目唯一入口文档。AI 每次任务开始必读。

## 这是什么项目

**JITEX**：Pascal82（ISO 7185）到 JS 的编译器 + TeX 自举套件，基于 Deno workspace 的 monorepo。

核心能力：

- `@jitex/pascal-to-js`：将 Pascal 源码编译为 JS 代码字符串，用 `new Function()` 同步执行。
- `@jitex/integration`：TANGLE 自举流水线（WEB→Pascal 的自举验证）+ tie/reporter 工具（e2e
  代码待重写，当前为占位模块）。
- `@jitex/boot-tex`：TeX82 / XeTeX 编译流水线（TRIP 测试 + DVI 工具；e2e 代码待重写，当前为占位模块）。

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
3. **回归测试**：修改 pascal-to-js 代码后必须运行 `deno task test:integration`（顶层 `deno.json` task）。
4. **TypeScript 检查**：修改 pascal-to-js/src/ 后运行 `deno task check`（顶层 `deno.json` task）。

### 标准锚定（原则 A）

5. **ISO Pascal 1983 是唯一行为标准**。默认行为必须符合 ISO 标准。
6. **非标特性默认必须报错**。用户未显式启用的非标特性，遇到即抛错。
7. **注入优先，无法注入才配置**。启用非标特性时，优先用插件注入（如
   `plugins: [pascalHPlugin]`），无法用注入实现的才用配置项（如 `extensions: ['fileEofBufferSpace']`）。
   - **现状**：il 编译器尚未实现插件系统，当前所有非标特性都通过 `extensions: string[]`
     配置项实现。插件系统是计划中的方向（见 task.md）。
8. **非标注释引用 ISO 章节**。代码中实现非标特性时，注释必须说明违反了 ISO 7185 的哪个章节。
9. **非标特性配正反测试**。每个非标特性必须有：
   - 正测试：启用非标配置，验证功能正常
   - 反测试：默认配置下，验证非标特性报错
10. **最小化权限**。测试中非必要不启用非标。

### 架构约束

11. **Frozen Layers**：不修改
    `pascal-to-js/src/ast/`、`pascal-to-js/src/lexer/`、`pascal-to-js/src/parser/`，除非明确是重构任务。
12. **唯一引擎**：`pascal-to-js/src/compiler/` 是唯一执行引擎（IL 管线），无 fallback。
13. **代码即文档**：文件列表、API 签名、实现细节不写进本文档，写进代码注释。
14. **最新原则**：本文档只保留当前有效信息，历史进 git。

---

## 一级目录（Deno Workspace 结构）

顶层为 Deno workspace（见
`deno.json`），包含三个子模块。依赖关系：`boot-tex → integration → pascal-to-js`（单向，无循环）。

| 目录                           | 说明                                                                                                                                                            | 文档                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `deno.json`                    | 顶层 workspace 配置：workspace 列表、import map、tasks、fmt/lint/compilerOptions、unstable.sloppy-imports                                                       | —                                                                                                                       |
| `pascal-to-js/`                | **核心子模块**：Pascal82→JS 编译器（lexer/parser/AST/IL 管线/runtime） + 全部单元/集成/基准测试（1133+ 用例）。无 Node API 依赖，纯 Deno。                      | [pascal-to-js/src/README.md](pascal-to-js/src/README.md) / [pascal-to-js/tests/README.md](pascal-to-js/tests/README.md) |
| `pascal-to-js/_vitest_shim.ts` | 测试运行时：Deno 原生测试之上的 Vitest 兼容层（describe/test/expect/afterAll）。使 `.test.ts` 保持 vitest 风格写法不变。                                        | 代码即文档                                                                                                              |
| `integration/`                 | **占位子模块**（e2e 待重写）：TANGLE 自举流水线 + tie 合并 WEB change file + reporter 报告生成。当前仅空 `mod.ts` + `deno.json`。                               | —                                                                                                                       |
| `boot-tex/`                    | **占位子模块**（e2e 待重写）：TeX82 / XeTeX 编译流水线、TRIP 测试、CM 字体、DVI 解析与可视化。当前仅空 `mod.ts` + `deno.json`。e2e 资源已备份，不在本仓库恢复。 | —                                                                                                                       |

> **说明**：旧的 `src/`、`tests/`（含 e2e/）目录**已废弃**，被拆分到上述三个子模块。e2e
> 代码按用户指示放弃迁移、后续重写；原 e2e 资源用户有独立备份。

---

## 常用命令（顶层 workspace 运行）

所有命令在项目根目录（本文件所在目录）执行：

| 命令                         | 说明                                                         |
|------------------------------| ------------------------------------------------------------ |
| `deno task check`            | TypeScript 类型检查 `pascal-to-js/src/index.ts`              |
| `deno test`                  | 运行 pascal-to-js 全部测试（unit + integration + benchmark） |
| `deno lint`                  | 代码规范检查                                                 |
| `deno fmt --check`           | 格式检查；不带 `--check` 则自动格式化                        |

子模块内部也有对应的 `deno task`（如 `cd pascal-to-js && deno task test`）。

---

## 如何更新本文档

- 新增铁律 → 添加到对应分组，按编号顺延。删除铁律时后面的编号**不回补**，保证编号唯一且稳定。当前铁律共 14
  条（#1-#14）。
- 新增任务类型 → 在"任务路由"表格添加。
- 新增一级目录 → 在"一级目录"表格添加。
- 原则/描述性文字 → 直接修改，无需编号。
