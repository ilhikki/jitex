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

**M5 — 高性能 JS 编译器** — see `plan-m5-high-performance.md`

### Milestones
- **M0~M3** — AST / Lexer / Parser / 早期解释器（已归档）
- **M4** — VM + TypePlugin + Pascal82 一致性 + TEX82（已归档，代码已在 5.5 删除）
  - M4.0：VM + TypePlugin 模型
  - M4.1：Pascal82 规范一致性（TANGLE 端到端 + 自举）
  - M4.2：TEX82 移植与验证
- **M5** — 高性能 JS 编译器 🚧（当前）
  - Phase 0-4：基础设施 + integer/char/array/record/goto 编译 ✅
  - Phase 5：项目重构 🚧 进行中
    - 5.5：移除 VM/static-analyzer，JS 编译器独立 ✅
    - 5.5.1：深度清理（命名/死代码/文档）🚧 进行中
    - 5.5.2：待决策项（见 `docs/refactoring-decisions.md`）
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

1. Read `plan.md` and `plan-m5-high-performance.md` to understand current phase and progress
2. For refactoring details, read `docs/plan-refactoring.md` and `docs/refactoring-decisions.md`
3. Review completed work vs pending tasks
4. Update plan documents with status changes
5. Commit at milestone boundaries

## Key Documents

- `plan.md` — 总体计划
- `plan-m5-high-performance.md` — M5 当前指导文档
- `docs/plan-refactoring.md` — 项目重构计划
- `docs/refactoring-decisions.md` — 待决策问题清单
- `docs/design-goto-strategy.md` — Goto 编译策略设计
- `docs/archive/` — 已归档的历史文档（M0-M4）

## Key Principles

- 代码冻结：M5 期间不修改 `src/ast/`、`src/lexer/`、`src/parser/`
- 测试复用：M4 测试用例迁移到 M5，验证新引擎语义一致
- 渐进验证：先 integer + 控制流跑通，再逐步扩展
- **JS 编译器是唯一执行引擎**（VM 已在 5.5 删除，不再有 fallback）
- Git commits on major changes and milestone boundaries
- 发现问题先记录到 `docs/refactoring-decisions.md`，不要随意决策
