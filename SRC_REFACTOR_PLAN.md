# src/ 重构计划（临时文件，手动删除后不再保留）

## 当前结构

```
src/
├── ast/
│   ├── printer.ts
│   └── types.ts
├── js-compiler/
│   ├── types/
│   │   ├── *.plugin.ts (12个类型插件)
│   │   ├── index.ts
│   │   └── types.ts
│   ├── compiler.ts
│   ├── context.ts
│   ├── emit-decl.ts
│   ├── emit-expr.ts
│   ├── emit-stmt.ts
│   ├── emit-type.ts
│   ├── emit-utils.ts
│   ├── file-model.ts
│   ├── index.ts
│   ├── run-state.ts
│   ├── strategy.ts
│   ├── syscalls.ts
│   └── type-table-builder.ts
├── lexer/
│   └── lexer.ts
├── parser/
│   ├── declarations.ts
│   ├── expressions.ts
│   ├── helpers.ts
│   ├── statements.ts
│   └── types.ts
├── README.md
└── index.ts
```

## 重构目标

1. **消除 Frozen Layers 约束**：将 `src/ast/`、`src/lexer/`、`src/parser/` 的代码与 compiler 整合或重构
2. **统一命名规范**：移除 `emit-` 前缀，改用更清晰的命名
3. **类型系统大重构**：当前 types 的抽象基于 VM，现在不需要了——去掉 VM 概念，直接面向 JS 编译器的类型系统
4. **模块边界清晰化**：明确 compiler、runtime、typesystem 的职责边界
5. **解决循环依赖**：梳理并解决现有循环依赖问题

---

## 循环依赖分析

### 现有循环依赖

| 循环 | 路径 | 风险 | 解决方案 |
|------|------|------|----------|
| **C1** | `js-compiler/index.ts` → `../index.ts` → `./js-compiler` | **高风险**：顶层入口和编译器入口互相导入 | 将 `parse` 从 `src/index.ts` 移到 parser，`js-compiler/index.ts` 直接 import `parser/declarations` |
| **C2** | `compiler.ts` → `emit-utils.ts` → `emit-expr.ts` → `compiler.ts` | 中风险：编译期互相引用 | 用 type-only import + 接口解耦；或拆分 emit-utils |
| **C3** | `compiler.ts` → `emit-stmt.ts` → `strategy.ts` → `compiler.ts` | 中风险：同上 | 同上 |
| **C4** | `compiler.ts` → `emit-decl.ts` → `emit-stmt.ts` → `compiler.ts` | 中风险：同上 | 同上 |
| **C5** | `types/types.ts` → `file-model.ts` → `types/types.ts` | 低风险：仅 type import | 保持 type-only import 即可 |
| **C6** | `parser/types.ts` ↔ `parser/expressions.ts` | 低风险：互相 type import | 保持现状或合并文件 |

### 详细说明

#### C1：顶层入口循环（最高优先级修复）
```
src/index.ts
  └─ export { runJS, compileToJS } from './js-compiler'
js-compiler/index.ts
  └─ import { parse } from '../index'   ← 运行时导入，非 type
```
**问题**：`js-compiler/index.ts` 为了调用 `parse()` 从顶层导入，而顶层又从 js-compiler 导出。
**解决**：`js-compiler/index.ts` 直接 `import { parseProgram } from '../parser/declarations'`，不再通过 `src/index.ts`。

#### C2-C4：Compiler ↔ emit 文件循环
```
compiler.ts (Compiler class)
  └─ import emitStmtImpl from './emit-stmt'
emit-stmt.ts
  └─ import type { Compiler } from './compiler'  ← type-only
```
**现状**：已有 type-only import，风险可控。
**改进**：将 Compiler 接口抽出到 `types.ts` 或 `compiler-types.ts`，彻底打破循环。

---

## Namespace 设计

采用 **目录即 namespace** 的策略，不使用 TS 的 `namespace` 关键字（与 ESM 模块冲突）。

| 命名空间 | 目录 | 职责 | 导出前缀 |
|---------|------|------|---------|
| `AST` | `src/ast/` | AST 节点类型定义 | `AstNode`, `ProgramNode`, `BlockNode`... |
| `Lexer` | `src/lexer/` | 词法分析 | `lex`, `tokenize`, `Token`... |
| `Parser` | `src/parser/` | 语法分析 | `parseProgram`, `parseExpression`... |
| `Compiler` | `src/compiler/` | 代码生成（emit） | `Compiler`, `compileToJS`... |
| `Types` | `src/types/` | 类型系统（TypePlugin / TypeDef / TypeTable） | `TypePlugin`, `TypeDef`, `TypeTable`... |
| `Runtime` | `src/runtime/` | 运行时（runJS 的执行环境） | `runJS`, `RunState`, `RuntimeCtx`... |

### 导出方式

- **命名导出**为主，不使用 default export
- 每个目录有一个 `index.ts` 作为公开 API 边界
- 跨目录 import 必须通过 `index.ts`（禁止直接 import 内部文件）
- 例外：type import 可以直接导入类型文件

---

## 类型系统大重构

### 当前问题（基于 VM 的抽象）

当前 `TypePlugin`/`TypeDef` 有大量 VM 时代的遗留概念：
- `PascalValue`：装箱的值对象（VM 时代需要，现在 integer/boolean/real/char 都是 JS 裸值）
- `RuntimeCtx` 与类型系统耦合过深
- `ops` 接口设计偏 VM 指令风格，不匹配 JS 代码生成
- `coerce` / `builtinReturnType` 等函数散落在 emit-utils 中

### 重构方向

#### 1. 拆分 PascalValue
- **标量类型**（integer/real/boolean/char）：直接用 JS 原生值，不再用 PascalValue 包装
- **复合类型**（array/record/set/file）：保留 PascalValue（需要引用语义）
- `PascalValue` → `PascalHeapValue`（仅用于堆分配的复合类型）

#### 2. TypePlugin 接口简化

| 现有成员 | 保留/删除 | 说明 |
|---------|----------|------|
| `name` | 保留 | 插件标识 |
| `version` | 删除 | 无实际用途 |
| `types` | 保留 | 类型定义列表 |
| `ops.arithmetic` | 简化 | 改为 emit 时直接生成 JS 运算符 |
| `ops.comparison` | 简化 | 同上 |
| `ops.coerce` | 移到 compiler/ | 归代码生成管 |
| `ops.literal` | 保留 | 字面量生成 |
| `ops.builtins` | 移到 compiler/builtins/ | 内建函数独立管理 |
| `ops.memory` | 删除 | VM 时代的概念，JS 不需要 |
| `onInit` | 保留/简化 | 初始化钩子 |

#### 3. TypeTable 重构
- 去掉与 VM 相关的方法（`alloc`/`deref`/`store` 等）
- 保留：类型查找、子类型判断、类型兼容检查
- 新增：`emitLiteral(type, value)` → JS 代码字符串生成

#### 4. 运行时与类型系统解耦
- `RuntimeCtx` 只保留：`typeTable` / `sysCalls` / `io` / `outputBuffer` / `inputQueue`
- 类型相关的运行时操作（如数组索引）改为直接调用 JS 方法
- `sysCalls` 与 TypePlugin 的 `ops` 职责重新划分

---

## 接口重构

### 顶层入口 `src/index.ts`

```typescript
// 只导出公开 API，不包含内部实现
export namespace Lexer {
  export { lex, tokenize, createOffsetToPosition } from './lexer/lexer'
  export type { Token, Position, LexerInput } from './ast/types'
}

export namespace Parser {
  export { parse } from './parser'
  export { parseProgram, parseExpression, ... } from './parser/declarations'
  export type { ParseResult, ParserInput } from './ast/types'
}

export namespace Compiler {
  export { compileToJS } from './compiler'
  export type { CompileOptions } from './compiler'
}

export namespace Runtime {
  export { runJS } from './runtime'
  export type { RunState, RunError, JSRunOptions } from './runtime'
}

export namespace Types {
  export type { TypeDef, TypePlugin, TypeTable } from './types'
}

// AST 节点类型
export * as AST from './ast/types'
```

### 关键接口变化

| 现有接口 | 目标接口 | 说明 |
|---------|---------|------|
| `parse(source)` | `Parser.parse(source)` | 顶层入口命名空间化 |
| `runJS(source, options)` | `Runtime.runJS(source, options)` | 同上 |
| `compileToJS(source)` | `Compiler.compileToJS(source)` | 同上 |
| `TypePlugin.ops` | 简化版 TypePlugin | 去掉 VM 相关 ops |
| `RuntimeCtx` | 简化版 RuntimeCtx | 类型相关操作移到 compiler |

---

## 重构方案（分阶段）

### Phase A：打破循环依赖 + 目录重命名
1. `js-compiler/index.ts` 直接导入 `parser/declarations`，不通过 `src/index.ts`
2. `js-compiler/` → `compiler/`
3. `js-compiler/types/` → `types/`（顶层）
4. `run-state.ts` / `syscalls.ts` / `file-model.ts` → `runtime/`

### Phase B：类型系统大重构
1. 拆分 PascalValue → 标量裸值 + PascalHeapValue
2. 简化 TypePlugin 接口
3. 重构 TypeTable（去掉 VM 方法）
4. 将 builtins 从 types/plugins 移到 compiler/builtins/

### Phase C：接口重构 + Namespace
1. 建立各目录的 index.ts 边界
2. 顶层导出命名空间化
3. 更新所有测试的 import 路径

### Phase D：emit 代码整理
1. `emit-*.ts` → `emit/*.ts`
2. `emit-utils.ts` 拆分到合理位置
3. Compiler 类接口抽出到独立类型文件

---

## 目标结构（最终）

```
src/
├── ast/
│   ├── types.ts          # AST 节点类型
│   └── printer.ts        # AST → 源码（调试用）
├── lexer/
│   ├── lexer.ts
│   └── index.ts
├── parser/
│   ├── declarations.ts
│   ├── expressions.ts
│   ├── statements.ts
│   ├── types.ts
│   ├── helpers.ts
│   └── index.ts
├── compiler/
│   ├── compiler.ts       # Compiler 类
│   ├── compiler-types.ts # Compiler 接口定义（打破循环）
│   ├── context.ts        # 编译期 context
│   ├── strategy.ts       # 编译策略（goto 等）
│   ├── emit/
│   │   ├── declarations.ts
│   │   ├── expressions.ts
│   │   ├── statements.ts
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── builtins/         # 内建函数代码生成
│   │   ├── arithmetic.ts
│   │   ├── io.ts
│   │   └── ...
│   └── index.ts
├── types/
│   ├── types.ts          # TypeDef / TypePlugin 核心接口
│   ├── table-builder.ts  # 从 AST 构建 TypeTable
│   ├── plugins/
│   │   ├── integer.plugin.ts
│   │   ├── boolean.plugin.ts
│   │   ├── char.plugin.ts
│   │   ├── real.plugin.ts
│   │   ├── array.plugin.ts
│   │   ├── record.plugin.ts
│   │   ├── enum.plugin.ts
│   │   ├── subrange.plugin.ts
│   │   ├── set.plugin.ts
│   │   ├── file.plugin.ts
│   │   ├── string.plugin.ts    # 非标
│   │   └── tangle.plugin.ts    # Knuth 扩展
│   └── index.ts
├── runtime/
│   ├── run-state.ts      # RunState / RunError
│   ├── syscalls.ts       # 系统调用实现
│   ├── file-model.ts     # 文件模型
│   ├── run-js.ts         # runJS 实现
│   └── index.ts
├── README.md
└── index.ts              # 顶层 API（命名空间导出）
```

---

## 注意事项

1. **测试兼容性**：`tests/` 中使用 `@/` 别名，重构后路径变化需同步更新
2. **Frozen Layers**：重构 ast/lexer/parser 需谨慎，确保不破坏现有功能
3. **TypeScript 检查**：每步重构后运行 `npx tsc --noEmit`
4. **回归测试**：每步重构后运行 `npx jest tests/integration --no-coverage`
5. **type-only import**：循环依赖的 type 导入必须用 `import type`

## 执行顺序建议

1. Phase A0：打破 C1 循环（js-compiler 直接 import parser）
2. Phase A1：目录重命名（js-compiler → compiler，types/runtime 独立）
3. Phase A2：更新 @ 别名路径，验证 tsc + jest 通过
4. Phase B：类型系统大重构
5. Phase C：接口重构 + Namespace
6. Phase D：emit 代码整理
