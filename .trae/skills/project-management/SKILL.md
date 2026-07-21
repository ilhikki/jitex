---
name: "project-management"
description: "Manages project plans, progress tracking, and milestone reviews for pascal-ts. Invoke when user asks to review plan, check progress, or plan next steps."
---

# Project Management

This skill manages the pascal-ts project lifecycle.

## When to Use

- User asks to review or update the project plan (`plan.md`)
- User asks to check progress or milestones
- User wants to plan the next development phase
- User asks about project structure or architecture decisions

## Current Phase

**M5 — 高性能 JS 编译器** — see `plan.md`

### Milestones
- **M0~M3** — AST / Lexer / Parser / 早期解释器（已归档，git 历史即归档）
- **M4** — VM + TypePlugin + Pascal82 一致性 + TEX82（已归档，代码已在 5.5 删除）
- **M5** — 高性能 JS 编译器 🚧（当前）
  - Phase 0-4：基础设施 + integer/char/array/record/goto 编译 ✅
  - Phase 5：项目重构 🚧 进行中
    - 5.5：移除 VM/static-analyzer，JS 编译器独立 ✅
    - 5.5.1：深度清理（命名/死代码 -864 行/文档归档/SKILL.md 重写）✅
    - 5.5.2：执行决策 D1-D8 + I1-I3 ✅（详见 [docs/refactoring-decisions.md](../../../docs/refactoring-decisions.md)）
    - 5.5.3：待决策项（I2: types/ 目录整体重构 / D6: 提交信息规范 / 文档分层制度落地）
  - Phase 6：性能优化 / bug 修复 ⏳
  - Phase 7：跑 TEX82 ⏳

### Frozen Layers
- `src/ast/` — AST node definitions
- `src/lexer/` — Lexer (pure function)
- `src/parser/` — Parser (pure functions)
- **Do not modify these** unless explicitly part of a refactoring task

### Active Code
- `src/js-compiler/` — JS 编译器（M5 主攻，包含 TypePlugin 系统和 syscall）

## Workflow

1. **每次任务开始必读** `plan.md`（项目总览 + 文档索引）
2. 涉及架构/规范决策时读 [docs/refactoring-decisions.md](../../../docs/refactoring-decisions.md)（原则 A + 决策记录）
3. Review completed work vs pending tasks
4. Update plan documents with status changes
5. Commit at milestone boundaries（D6: 积极提交，避免用户手动提交）

## Key Documents

| 文档 | 用途 | 何时读 |
|------|------|--------|
| `plan.md` | 项目总览、当前状态、文档索引 | 每次任务开始必读 |
| [docs/refactoring-decisions.md](../../../docs/refactoring-decisions.md) | 顶层原则 A、待决策问题、决策记录 | 涉及架构/规范决策时读 |
| [docs/design-goto-strategy.md](../../../docs/design-goto-strategy.md) | goto 编译策略详细设计 | 涉及 goto 相关工作时读 |
| [docs/productions.md](../../../docs/productions.md) | Pascal 语法产生式参考 | 涉及语法解析时读 |

**注意**：历史文档（M0-M4 时代的设计文档、VM 相关文档、`plan-m5-high-performance.md`、`docs/plan-refactoring.md`、`docs/archive/`）已删除，git 历史就是归档。

## Key Principles

- **标准锚定**：ISO Pascal 1983 是唯一行为标准（详见"原则 A"）
- 代码冻结：M5 期间不修改 `src/ast/`、`src/lexer/`、`src/parser/`
- 测试复用：M4 测试用例迁移到 M5，验证新引擎语义一致
- 渐进验证：先 integer + 控制流跑通，再逐步扩展
- **JS 编译器是唯一执行引擎**（VM 已在 5.5 删除，不再有 fallback）
- Git commits on major changes and milestone boundaries
- 发现问题先记录到 [docs/refactoring-decisions.md](../../../docs/refactoring-decisions.md)，不要随意决策
- **文档单一入口**：`plan.md` 是唯一 L0 入口，其他文档通过文档索引引用，避免文档分散导致 AI 遗漏
