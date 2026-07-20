# Pascal TS — 项目计划

> **当前阶段**：M5（高性能 JS 编译器）
> **核心目标**：将 Pascal82 程序编译为 JS 执行，让 TEX82 在合理时间内跑完

## 一、项目概述

本项目是一个 Pascal82（ISO 7185）子集的实现，包含：

- **Lexer / Parser**：完整的前端，将 Pascal 源码解析为 AST
- **JS 编译器**（M5）：将 AST 直接编译为 JS 代码字符串执行

**TEX82 是终极验收标准**——Knuth 写的最复杂 Pascal 程序之一，约 35 万行 Pascal 代码。

## 二、架构

```
Pascal 源码
    │
    ▼
┌─────────────┐
│   Lexer     │  ← src/lexer/
└─────────────┘
    │
    ▼
┌─────────────┐
│   Parser    │  ← src/parser/
└─────────────┘
    │ AST
    ▼
┌─────────────┐
│ JS Compiler │  ← src/js-compiler/ (M5 主攻)
│  (类型推断)  │
└─────────────┘
    │
    ▼
  JS 代码 (V8 JIT)
```

### 代码组织

M5 的核心代码在 `src/js-compiler/` 下。前端（AST/Lexer/Parser）保持稳定。

## 三、目录结构

```
src/
├── ast/                 # AST 类型定义
├── lexer/               # 词法分析器
├── parser/              # 语法分析器
└── js-compiler/         # JS 编译器（M5）
    ├── index.ts         # 公开 API：compileToJS / runJS
    ├── context.ts       # RuntimeContext
    ├── types/           # TypePlugin 系统
    ├── syscalls.ts      # 系统调用实现
    └── file-model.ts    # 文件模型

tests/
├── m5/                  # 标准测试（400+ 用例，全部走 JS 编译器）
│   ├── _helper.ts       # 测试 helper
│   ├── q01-basics.test.ts
│   ├── q02-control-flow.test.ts
│   ├── ...
│   └── m36-q03-goto.test.ts
├── temp/                # 临时调试脚本
│   ├── bench-js.ts      # JS 编译器基准测试
│   └── debug-test.ts    # 调试用例
└── resources/           # 测试资源（tex.web, tangle.web 等）

tests-tex/               # TEX82 端到端测试（耗时长）
├── tangle-run.test.ts
├── tangle-bootstrap.test.ts
├── tex82-tangle.test.ts
├── tex82-compile.test.ts
├── tex82-run.test.ts
└── tex82-trip.test.ts

knuth/
├── web/                 # TANGLE 原始文件
└── tex82/               # TEX82 原始文件

docs/                    # 设计文档
├── design-goto-strategy.md  # goto 编译策略设计
└── plan-refactoring.md      # 项目重构计划
```

## 四、快速开始

### 安装依赖

```bash
npm install
```

### 运行测试

```bash
# 全部测试（含覆盖）
npx jest

# 只跑 m5 标准测试
npx jest tests/m5

# 只跑单个文件
npx jest tests/m5/q06-goto.test.ts --runInBand

# 只跑单个用例（按名称匹配）
npx jest tests/m5/q06-goto.test.ts --runInBand -t "goto in main"
```

### 编译 Pascal 到 JS（不执行）

```typescript
import { compileToJS } from './src/js-compiler'

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
import { runJS } from './src/js-compiler'

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

## 五、调试工作流

### 5.1 打印编译后的 JS 代码

**方式一：运行时打印**

```typescript
const state = await runJS(code, {
  debug: { emitJS: true }
})
// 控制台输出：
// ===== Generated JS =====
// async function p_proc(ctx) { ... }
// ========================
```

**方式二：输出到文件**

```typescript
const state = await runJS(code, {
  debug: { emitJSFile: 'out.js' }
})
```

**方式三：仅编译不执行**

```typescript
import { compileToJS } from './src/js-compiler'
const js = compileToJS(code)
console.log(js)
```

### 5.2 测试失败时自动打印 JS

在测试用例中设置 `debugEmitJS: true`：

```typescript
const result = await runVMTest({
  name: 'my-test',
  code: '...',
  expectedContains: 'hello',
  debugEmitJS: true,   // 失败时自动打印生成的 JS
})
```

### 5.3 排查 goto 问题

goto 是编译中最复杂的部分。参考 `docs/design-goto-strategy.md` 了解分策略方案。

常用调试命令：

```bash
# 编译一个 goto 用例并查看生成的 JS
npx ts-node -e "
import { compileToJS } from './src/js-compiler';
const code = \`program test;
begin
  goto 100;
  writeln('skipped');
100:
  writeln('ok');
end.\`;
console.log(compileToJS(code));
"
```

## 六、开发工作流

```
1. 运行测试 → 发现失败
   ↓
2. 分析问题
   - 根因分析
   - Pascal82 规范依据（引用 §章节号）
   - 最小复现用例
   ↓
3. 复现问题
   - 必要时在 tests/temp/ 保存中间文件
   - 用 compileToJS() 查看生成的 JS
   ↓
4. 实现修复
   - 改 src/js-compiler/ 下相关代码
   - 加最小复现测试到 tests/m5/
   ↓
5. 验证
   - npx jest tests/m5 全绿
   - 相关 TEX82 测试更接近目标
```

## 七、当前状态（M5）

| 阶段 | 状态 | 说明 |
|------|------|------|
| Phase 0 基础设施 | ✅ 完成 | tests/m5/ 创建，基础运行时 |
| Phase 1 integer/boolean/基础控制流 | ✅ 完成 | 全部通过 |
| Phase 2 char/real/string | ✅ 完成 | 全部通过 |
| Phase 3 array/record/set/file/WITH | ✅ 完成 | 全部通过 |
| Phase 4 嵌套过程/var参数/goto | ✅ 完成 | 全部通过 |
| **Phase 5 项目重构** | 🚧 **进行中** | **移除 VM/static-analyzer，JS 编译器独立** |
| Phase 6 性能优化/bug 修复 | ⏳ 未开始 | 等待重构完成 |
| Phase 7 跑 TEX82 | ⏳ 未开始 | 等待优化完成 |

## 八、参考文档

| 文档 | 说明 |
|------|------|
| [plan-m5-high-performance.md](plan-m5-high-performance.md) | M5 详细计划（Phase 拆分、性能目标） |
| [docs/design-goto-strategy.md](docs/design-goto-strategy.md) | goto 编译策略设计 |
| [docs/plan-refactoring.md](docs/plan-refactoring.md) | 项目重构计划 |
| [docs/archive/](docs/archive/) | 已归档的历史文档 |

## 九、性能基准

| 指标 | 目标 |
|------|------|
| 1 亿步（纯计算） | < 5 秒，> 2000 万步/秒 |
| TEX82 TRIP | 完成且输出一致 |
