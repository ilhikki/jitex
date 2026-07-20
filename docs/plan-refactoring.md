# 项目重构计划

> **阶段**：M5 Phase 5
> **目标**：移除 VM 和 static-analyzer 依赖，让 JS 编译器独立工作，简化项目结构

## 一、重构背景

项目最初采用"VM 解释器 + JS 编译器"的双引擎架构：
- M4 阶段实现了基于 JsonCode 的 VM 解释器
- M5 阶段新增了 JS 编译器，从 AST 直接生成 JS 代码

随着 JS 编译器逐渐成熟，VM 解释器不再是必需的。保留 VM 和 static-analyzer 带来了以下问题：

1. **维护成本高**：两套执行引擎需要保持语义一致
2. **依赖复杂**：JS 编译器仍然依赖 VM 的类型系统和 syscall 实现
3. **新人上手难**：项目结构复杂，需要理解多层抽象
4. **构建产物大**：包含大量不再使用的代码

## 二、重构目标

### 2.1 核心目标

- [x] JS 编译器可以独立工作，不依赖 VM 和 static-analyzer
- [x] TypeScript 编译通过（`npx tsc --noEmit`）
- [x] tests/m5/ 下所有测试通过（`npx jest tests/m5 --no-coverage`）
- [x] 项目结构清晰，代码职责明确

### 2.2 非目标

- 不修改测试用例的逻辑（只改 import 路径）
- 不修改前端（AST/Lexer/Parser）代码
- 不删除工作流文件（.github）
- 不删除 .trae 下的技能文件

## 三、重构内容

### 3.1 类型系统迁移

- **来源**：`src/types/`（TypePlugin 系统）
- **目标**：`src/js-compiler/types/`
- **内容**：
  - 核心类型定义（PascalValue, TypeDef, TypeTable 等）
  - 类型插件（integer, boolean, char, real, array, record, enum, subrange, set, file, string）
  - 插件索引文件

### 3.2 Syscall 系统移植

- **来源**：`src/vm/io.plugin.ts` + `src/vm/extended-io.plugin.ts`
- **目标**：`src/js-compiler/syscalls.ts`
- **内容**：
  - 标准 I/O syscall（WRITE, WRITELN, READ, READLN 等）
  - 文件操作 syscall（RESET, REWRITE, CLOSE, GET, PUT, ASSIGN 等）
  - 扩展 syscall（多参数 RESET/REWRITE）
- **原则**：只保留 JS 编译器实际使用的部分，移除 VM 状态相关代码

### 3.3 文件模型移植

- **来源**：`src/vm/file-model.ts`
- **目标**：`src/js-compiler/file-model.ts`
- **内容**：
  - PascalFile 接口
  - PascalFileOps 接口
  - PascalIO 接口
  - 默认 I/O 实现
  - 内存文件操作（record file ops）

### 3.4 类型表构建器

- **新增**：`src/js-compiler/type-table-builder.ts`
- **替代**：`src/static-analyzer/` 的类型收集功能
- **功能**：
  - 从 AST 遍历类型声明
  - 构建 TypeTable
  - 支持内置类型和用户自定义类型
  - 支持 array/record/enum/subrange/set/file 等复杂类型

### 3.5 目录清理

- **删除**：`src/vm/`（VM 解释器）
- **删除**：`src/static-analyzer/`（静态分析器）
- **删除**：`src/types/`（类型插件系统，已迁移到 js-compiler）
- **删除**：`issue/`（历史 issue 记录）

### 3.6 文档更新

- **更新**：`plan.md`
  - 移除 VM 和 static-analyzer 相关描述
  - 更新架构图
  - 更新目录结构
  - 更新当前状态（Phase 5 项目重构）
- **更新**：`plan-m5-high-performance.md`
  - M5 Phase 5 改为"项目重构"
  - M5 Phase 6 改为"性能和便利性优化、bug 修复"
  - M5 Phase 7 改为"跑 TEX82"
  - 移除所有 VM 和 static-analyzer 相关描述
  - 移除所有 issue 相关引用
- **新增**：`docs/plan-refactoring.md`（本文档）

## 四、重构前后对比

### 4.1 重构前

```
src/
├── ast/
├── lexer/
├── parser/
├── static-analyzer/     # 待删除
├── types/               # 待迁移
├── vm/                  # 待删除
└── js-compiler/
    ├── index.ts
    ├── context.ts
    ├── complier.ts
    └── ...
```

### 4.2 重构后

```
src/
├── ast/
├── lexer/
├── parser/
└── js-compiler/
    ├── index.ts         # 公开 API
    ├── context.ts       # 运行时上下文
    ├── complier.ts      # 编译器核心
    ├── type-table-builder.ts  # 类型表构建
    ├── syscalls.ts      # 系统调用
    ├── file-model.ts    # 文件模型
    ├── types/           # TypePlugin 系统
    │   ├── types.ts
    │   ├── index.ts
    │   ├── integer.plugin.ts
    │   ├── boolean.plugin.ts
    │   └── ...
    └── ...
```

## 五、关键设计决策

### 5.1 为什么移除 VM？

1. **JS 编译器已经成熟**：400+ 测试全部通过，覆盖了 Pascal82 的核心特性
2. **性能优势明显**：JS 编译器利用 V8 JIT，性能远超解释器
3. **维护成本降低**：只需要维护一套执行引擎
4. **代码更简洁**：去掉 JsonCode 中间表示层

### 5.2 为什么移除 static-analyzer？

1. **JS 编译器自带类型推断**：编译过程中直接做类型检查和推断
2. **不需要 JsonCode**：从 AST 直接生成 JS，不需要中间表示
3. **类型表构建更轻量**：只需要收集类型信息，不需要生成指令

### 5.3 为什么保留 TypePlugin 系统？

1. **扩展性好**：新增类型只需要添加插件，不需要修改核心代码
2. **关注点分离**：类型特定的逻辑封装在插件中
3. **已经验证有效**：在 M4 阶段经过充分验证

## 六、风险与应对

### 6.1 风险：行为不一致

**风险**：JS 编译器和 VM 解释器在某些边缘场景下行为可能不一致。

**应对**：
- 400+ 测试用例覆盖核心特性
- 后续跑 TEX82 TRIP 测试进一步验证
- 发现差异及时修复

### 6.2 风险：功能缺失

**风险**：VM 中的某些功能在 JS 编译器中没有实现。

**应对**：
- 移植前梳理 VM 中 JS 编译器实际使用的功能
- 只移植必要的部分，避免过度工程
- 测试驱动，确保所有测试通过

### 6.3 风险：回归 bug

**风险**：重构过程中引入新的 bug。

**应对**：
- 每一步都运行完整测试套件
- 小步提交，便于回滚
- 保持测试用例不变，只改 import 路径

## 七、后续计划

重构完成后，进入 M5 Phase 6 和 Phase 7：

### Phase 6: 性能和便利性优化、bug 修复

- 性能优化：热点代码内联、减少装箱拆箱
- 开发便利性：更好的错误提示、调试工具
- bug 修复：边缘场景修复
- 代码质量：重构、类型完善

### Phase 7: 跑 TEX82

- TRIP 测试在新引擎下跑通
- 测量 TEX82 实际运行时间
- 性能优化（如需要）

## 八、验证标准

重构完成的标志：

- [x] `npx tsc --noEmit` 无错误
- [x] `npx jest tests/m5 --no-coverage` 全部通过（402/402）
- [x] `src/vm/` 目录已删除
- [x] `src/static-analyzer/` 目录已删除
- [x] `src/types/` 目录已删除（内容迁移到 js-compiler/types）
- [x] `issue/` 目录已删除
- [x] 计划文档已更新
- [x] 重构计划文档已创建
