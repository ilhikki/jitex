# task.md

> 跨对话任务追踪。只保留进行中的任务明细，已完成的只留标题。

## M5 — 高性能 JS 编译器

### Phase 0：基础设施 ✅（明细已删除）

### Phase 1：integer/boolean/基础控制流 ✅（明细已删除）

### Phase 2：char/real/string ✅（明细已删除）

### Phase 3：array/record/set/file/WITH ✅（明细已删除）

### Phase 4：嵌套过程/var参数/goto ✅（明细已删除）

### Phase 5：项目重构 ✅（明细已删除）

---

### Phase 6：完全重新写编译器 🚧

> 旧 Phase 6（性能优化与功能增强）作废。基准测试保留复用。
> 详见 `src/il/req.md`（需求清单）、`src/il/json-code.ts` / `analysis.ts` / `compiler.ts`（设计文档）。

#### 设计原则

- **两阶段流水线**：Analysis（状态化，产出只读 Analysis）+ Compile（纯函数族，零 mutable state）
- **依赖反转**：编译阶段不持 mutable state，通过 `analysis.symbolOf(node)` / `analysis.typeOf(node)` 等查询元信息。不是
  compiler 带着 context 找节点，而是节点去 Analysis 查自己的元信息
- **ID 全局唯一**：VarId / LabelId / Function.id 共用一个计数器，任何 ID 自解释，不需要"在哪个 function 里"的上下文
- **JsonCode 去语言绑定**：IR 不依赖 Pascal（上游）也不依赖 JS（下游），注释无上下文可读
- **代码风格**：哲学一致即可（纯函数 / 无隐式状态 / 依赖反转），组织形式可选用 class / namespace / 顶层函数
    - Analysis 阶段天然有状态 → 可用 class（如 `class Analyzer`）
    - Compile 阶段必须无状态 → 可用 namespace 组织纯函数族
    - 不强制完全照搬 parser 的顶层函数风格
- **syscall 精确选择**：Pascal 无泛型，类型在编译期已知，因此编译期就选定具体 syscall key（`i64.add` vs `f64.add`），不做运行时多态分派

#### 进行中

- 6.3：通过 e2e
-

#### 已完成

- 6.1 完整类型检查 ✅
- 6.2：插件系统设计 ✅

---

## 如何更新本文档

- 新任务 → 在对应阶段"进行中"添加
- 子任务完成 → 删除明细，标题移入同阶段的"已完成"并标记 ✅
- 大任务整个完成 → 保留大任务标题（打 ✅），删除所有子任务明细
- 任务取消 → 完全删除
- 编号规则：不使用编号，用文字描述。大任务用 `###`，子任务用 `####`，具体项用 `-` 列表
