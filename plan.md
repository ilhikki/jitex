# Pascal TS — 项目计划

> **当前阶段**：M5 Phase 5（项目重构）— 5.5.2 待决策项处理中
> **核心目标**：将 Pascal82（ISO 7185）程序编译为 JS 执行，让 TEX82 在合理时间内跑完
> **标准锚定**：以 ISO Pascal 1983 为唯一行为标准（详见 [docs/refactoring-decisions.md](docs/refactoring-decisions.md)）

## 一、项目概述

本项目是一个 Pascal82（ISO 7185）子集的实现，包含：

- **Lexer / Parser**：完整的前端，将 Pascal 源码解析为 AST
- **JS 编译器**（M5）：将 AST 直接编译为 JS 代码字符串，用 `new AsyncFunction()` 执行

**TEX82 是终极验收标准**——Knuth 写的最复杂 Pascal 程序之一，约 35 万行 Pascal 代码。

## 二、架构

```
Pascal 源码
    │
    ▼
┌─────────────┐
│   Lexer     │  ← src/lexer/ (frozen)
└─────────────┘
    │ Token[]
    ▼
┌─────────────┐
│   Parser    │  ← src/parser/ (frozen)
└─────────────┘
    │ AST
    ▼
┌─────────────┐
│ JS Compiler │  ← src/js-compiler/ (active)
│  (类型推断)  │
└─────────────┘
    │ JS 代码字符串
    ▼
  new AsyncFunction('ctx', body)(ctx)
    │
    ▼
  V8 JIT 执行
```

### 编译策略

| 类型 | 编译方式 | 示例 |
|------|---------|------|
| integer | 裸 number + `\| 0` | `I = (I + 1) \| 0` |
| real | 裸 number | `X = X + 0.5` |
| boolean | 裸 boolean | `B = I < N` |
| char | 裸 number (char code) | `C = 65` |
| string | PascalValue + plugin.invoke（非标，需注入） | `invoke('binary', 'CONCAT', S1, S2)` |
| array/record | PascalValue + plugin.invoke | `invoke('index', A, i)` |
| file | PascalValue + sysCall | `await sysCall('READ', [F])` |

## 三、目录结构

```
src/
├── ast/                 # AST 类型定义 (frozen)
├── lexer/               # 词法分析器 (frozen)
├── parser/              # 语法分析器 (frozen)
├── index.ts             # 顶层 API：parse / runJS / compileToJS
└── js-compiler/         # JS 编译器 (active)
    ├── index.ts         # 公开 API：runJS / compileToJS
    ├── compiler.ts      # Compiler 主类（compile 入口）
    ├── emit-decl.ts     # 声明编译（emitBody / emitProc / collectGlobals...）
    ├── emit-stmt.ts     # 语句编译（emitStmt / emitAssignment / emitRead...）
    ├── emit-expr.ts     # 表达式编译（emitExpr / emitBinary / emitFunctionCall...）
    ├── emit-type.ts     # 类型解析（resolveTypeId / subrangeBounds...）
    ├── emit-utils.ts    # 工具函数 + 内置函数表 + Scope/ProcInfo
    ├── strategy.ts      # goto 编译策略（状态机 + labeled break）
    ├── context.ts       # 运行时上下文（JSCtx / createJSCtx / ctxToRunState）
    ├── run-state.ts     # RunState / RunError 接口
    ├── syscalls.ts      # 系统调用实现（WRITE/READ/ORD/RESET...）
    ├── file-model.ts    # 异步文件 IO 模型
    ├── type-table-builder.ts  # 从 AST 构建 TypeTable
    └── types/           # TypePlugin 系统
        ├── types.ts     # 核心类型定义（PascalValue / TypeDef / TypeOps）
        └── *.plugin.ts  # 类型插件（integer/boolean/char/real/array/...）

tests/
└── m5/                  # 标准测试（402 用例，全部走 JS 编译器）
    ├── _helper.ts       # 测试 helper（PascalTest / runPascalTest）
    ├── q01-basics.test.ts
    ├── q02-control-flow.test.ts
    ├── ...
    └── m36-q10-range.test.ts

tests-tex/               # TEX82 端到端测试（耗时长）
├── resources/           # 测试资源（tex.web, tangle.web, trip.tex...）
├── tangle-run.test.ts
├── tex82-compile.test.ts
├── tex82-run.test.ts
├── tex82-tangle.test.ts
└── tex82-trip.test.ts

knuth/                   # TANGLE/TEX82 原始文件
├── web/
└── tex82/

docs/                    # 设计文档（见下方文档索引）
```

## 四、快速开始

### 安装依赖

```bash
npm install
```

### 运行测试

```bash
# 只跑 m5 标准测试（快）
npx jest tests/m5 --no-coverage

# 全部测试（含覆盖）
npx jest

# 只跑单个文件
npx jest tests/m5/q06-goto.test.ts --runInBand

# 只跑单个用例（按名称匹配）
npx jest tests/m5/q06-goto.test.ts --runInBand -t "goto in main"
```

### 编译 Pascal 到 JS（不执行）

```typescript
import { compileToJS } from 'pascal-ts'

const js = compileToJS(`
program test;
begin
  writeln('hello');
end.
`)
console.log(js)
```

### 执行 Pascal 程序

```typescript
import { runJS } from 'pascal-ts'

const state = await runJS(`
program test;
var i: integer;
begin
  for i := 1 to 5 do writeln(i);
end.
`, { maxSteps: 1e9 })

console.log(state.status)          // 'terminated'
console.log(state.outputBuffer)    // ['1', '\n', '2', '\n', ...]
```

### 调试：打印编译后的 JS

```typescript
// 方式一：运行时打印
await runJS(code, { debug: { emitJS: true } })

// 方式二：输出到文件
await runJS(code, { debug: { emitJSFile: 'out.js' } })

// 方式三：仅编译不执行
const js = compileToJS(code)
```

### 非标扩展

默认行为符合 ISO Pascal 1983 标准。非标特性通过注入或配置启用：

```typescript
// 注入 stringPlugin（string 类型是非标扩展）
import { stringPlugin } from 'pascal-ts/js-compiler/types'
await runJS(code, { plugins: [stringPlugin] })

// 配置：允许无 LABEL 声明的 goto（Berkeley/DEC 扩展）
await runJS(code, { allowUndeclaredLabels: true })
```

## 五、当前状态（M5）

| 阶段 | 状态 | 说明 |
|------|------|------|
| Phase 0 基础设施 | ✅ 完成 | tests/m5/ 创建，基础运行时 |
| Phase 1 integer/boolean/基础控制流 | ✅ 完成 | 全部通过 |
| Phase 2 char/real/string | ✅ 完成 | 全部通过 |
| Phase 3 array/record/set/file/WITH | ✅ 完成 | 全部通过 |
| Phase 4 嵌套过程/var参数/goto | ✅ 完成 | 全部通过 |
| **Phase 5 项目重构** | 🚧 **进行中** | 见下方详细进度 |
| Phase 6 性能优化/bug 修复 | ⏳ 未开始 | 等待重构完成 |
| Phase 7 跑 TEX82 | ⏳ 未开始 | 等待优化完成 |

### Phase 5 详细进度

- [x] 5.5：移除 VM/static-analyzer，JS 编译器独立
- [x] 5.5.1：深度清理（命名修正 / 死代码删除 -864 行 / 文档归档 / SKILL.md 重写）
- [x] 5.5.2：执行决策 D1-D8 + I1-I3
  - [x] D1: 顶层 API 导出（src/index.ts 导出 runJS/compileToJS）
  - [x] D2: 拆分 compiler.ts → compiler.ts + emit-{utils,type,expr,stmt,decl}.ts
  - [x] D3: 拆分 item.ts → 内容分散到 emit-utils.ts 等
  - [x] D4: tests/resources 移到 tests-tex/，重写 tests-tex 测试
  - [x] D5: 移除 q10-m35-conformance.test.ts 错误的 expectedError
  - [x] D7: 测试接口重命名为 PascalTest/runPascalTest（与引擎无关）
  - [x] D8: runJS 默认只加载标准 plugins（string 非标需注入）
  - [x] I1: compileToJS 与 runJS 默认 plugins 一致
  - [x] I3: 清理 tests-tex 中 VM 字样
- [ ] 5.5.3：待决策项（见 [docs/refactoring-decisions.md](docs/refactoring-decisions.md)）
  - [ ] I2: types/ 目录整体重构
  - [ ] D6: 提交信息规范
  - [ ] 文档分层制度落地

## 六、难点与方案

| 难点 | 状态 | 方案 |
|------|------|------|
| var 参数（传引用） | ✅ | 包装对象 `{ value: T }` |
| 嵌套过程访问外层变量 | ✅ | JS 闭包天然支持 |
| 过程作为参数 | ✅ | JS 函数对象 + 闭包 |
| goto 语句 | ✅ | 分策略：透明块/不透明块 + labeled break/continue（详见 [docs/design-goto-strategy.md](docs/design-goto-strategy.md)） |
| 步数限制 | ✅ | 循环开头插检查点 |
| 异步操作（file IO） | ✅ | `async function` + `await` |
| 数组越界检查 | ✅ | `ctx.checkArrayIndex` 运行时函数 |
| subrange 边界检查 | ✅ | IIFE 内联检查 + char 特殊处理 |
| 嵌套 WITH 变量冲突 | ✅ | 全局计数器生成唯一临时变量 |

## 七、性能目标

| 指标 | 目标 |
|------|------|
| 1 亿步（纯计算） | < 5 秒，> 2000 万步/秒 |
| TEX82 TRIP | 完成且输出一致 |
| TEX82 texbook | 可行（合理时间内） |

## 八、文档索引

| 文档 | 用途 | 何时读 |
|------|------|--------|
| `plan.md`（本文件） | 项目总览、当前状态、文档索引 | 每次任务开始必读 |
| [docs/refactoring-decisions.md](docs/refactoring-decisions.md) | 顶层原则、待决策问题、决策记录 | 涉及架构/规范决策时读 |
| [docs/design-goto-strategy.md](docs/design-goto-strategy.md) | goto 编译策略详细设计 | 涉及 goto 相关工作时读 |
| [docs/productions.md](docs/productions.md) | Pascal 语法产生式参考 | 涉及语法解析时读 |
| [.trae/skills/](.trae/skills/) | 开发/问题修复/项目管理工作流 | skill 自动触发时读 |

**注意**：历史文档（M0-M4 时代的设计文档、VM 相关文档）已删除，git 历史就是归档。
