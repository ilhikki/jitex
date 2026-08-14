# src/

> 源码目录。代码即文档——具体文件职责见各文件头部注释。

## 原则

- **Frozen Layers**：`ast/`、`lexer/`、`parser/` 不可修改，除非明确是重构任务。
- **唯一引擎**：`compiler/` 是唯一的执行引擎（IL 管线），无 fallback。
- **两阶段流水线**：
  1. Analysis（`compiler/analysis.ts`）：AST → 符号表 + 类型信息 + id 到名字映射
  2. Compile（`compiler/compiler.ts` + `compiler/json-code-compiler.ts`）：AST + Analysis → JsonCode → JS 代码
- **同步运行时**：`compiler/runtime.ts` 提供同步 syscall dispatcher（`__sys(key, args)`），无 async/await。
- **语义编译器**：`compiler/transform.ts` 中的 `PascalSemanticCompiler` 决定哪些 syscall inline（算术/比较），哪些走
  dispatcher（IO/file/cell/mem/set）。
- **非标扩展**：默认未启用的非标特性遇到即抛错（如 `string` 类型需显式启用）。

## 如何更新本文档

- 架构原则变更 → 修改对应条目。
- 新增子目录 → 在"原则"中说明其定位（不写文件列表）。
