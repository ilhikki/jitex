# task.md

> 跨对话任务追踪。只保留进行中的任务明细，已完成的只留标题。

## M5 — 高性能 JS 编译器

### Phase 0：基础设施 ✅（明细已删除）

### Phase 1：integer/boolean/基础控制流 ✅（明细已删除）

### Phase 2：char/real/string ✅（明细已删除）

### Phase 3：array/record/set/file/WITH ✅（明细已删除）

### Phase 4：嵌套过程/var参数/goto ✅（明细已删除）

### Phase 5：项目重构 ✅（明细已删除）

### Phase 6：完全重新写编译器 ✅（明细已删除）

> 旧 Phase 6（性能优化与功能增强）作废。基准测试保留复用。
> 详见 `pascal-to-js/src/compiler/req.md`（需求清单）、`pascal-to-js/src/compiler/decide.md`（决策记录）。
> 集成测试 1058/1058 全通过，E2E 测试 16/16 全通过（含 TRIP 100%、plain.fmt 生成、tripman.tex 编译）。

---

## 如何更新本文档

- 新任务 → 在对应阶段"进行中"添加
- 子任务完成 → 删除明细，标题移入同阶段的"已完成"并标记 ✅
- 大任务整个完成 → 保留大任务标题（打 ✅），删除所有子任务明细
- 任务取消 → 完全删除
- 编号规则：不使用编号，用文字描述。大任务用 `###`，子任务用 `####`，具体项用 `-` 列表
