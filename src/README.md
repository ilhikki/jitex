# src/

> 源码目录。代码即文档——具体文件职责见各文件头部注释。

## 目录结构

```
src/
├── ast/          # AST 节点类型定义（Frozen）
├── lexer/        # 词法分析（Frozen）
├── parser/       # 语法分析（Frozen）
├── compiler/     # 编译器核心
│   ├── emit/     # 代码生成
│   └── run-js.ts # runJS 入口
├── types/        # 类型系统
│   └── plugins/  # 类型插件
├── runtime/      # 运行时
└── index.ts      # 顶层 API
```

## 原则

- **Frozen Layers**：`ast/`、`lexer/`、`parser/` 不可修改，除非明确是重构任务。
- **唯一引擎**：`compiler/` 是唯一的执行引擎，无 fallback。
- **编译策略**：
  - integer/boolean/char 用裸 JS 值（V8 JIT 可优化）
  - array/record/set/file 用 PascalValue + plugin.invoke
  - 异步操作用 async/await 原生处理
- **TypePlugin 系统**：每种类型一个插件，实现 `can`/`invoke` 方法。
- **标准 plugins**（默认加载）：integer, boolean, char, real, array, record, enum, subrange, set, file。
- **非标 plugins**（需用户注入）：string。

## 如何更新本文档

- 架构原则变更 → 修改对应条目。
- 新增子目录 → 在"目录结构"中添加。