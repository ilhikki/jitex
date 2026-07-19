---
name: "project-management"
description: "Manages project plans, progress tracking, and milestone reviews for the pascal-ts interpreter. Invoke when user asks to review plan, check progress, or plan next steps."
---

# Project Management

This skill manages the pascal-ts interpreter project lifecycle.

## When to Use

- User asks to review or update the project plan (`plan.md`)
- User asks to check progress or milestones
- User wants to plan the next development phase
- User asks about project structure or architecture decisions

## Current Phase

**M5 — 高性能执行** — see `docs/plan-m5-high-performance.md`

### Milestones
- **M0~M3** — AST / Lexer / Parser / 早期解释器（已归档）
- **M4** — VM + TypePlugin + Pascal82 一致性 + TEX82 ✅（代码冻结）
  - M4.0：VM + TypePlugin 模型
  - M4.1：Pascal82 规范一致性（TANGLE 端到端 + 自举）
  - M4.2：TEX82 移植与验证（tex.pas 编译通过、初始化通过、TRIP 启动）
  - 性能优化：89万→264万步/秒（~2.9x）
- **M5** — 高性能执行 🚧（当前）
  - 代码冻结：`src/` 下所有现有代码不修改
  - 方案：编译为 JS（从 AST），不排除其他可能
  - 测试复用：`tests/m4` → `tests/m5`，修改 helper 支持新引擎
  - 目标：1 亿步 < 5 秒，TEX82 可行

### Frozen Layers（M5 代码冻结）
- `src/ast/` — AST node definitions (FP records)
- `src/lexer/` — Lexer (pure function)
- `src/parser/` — Parser (pure functions)
- `src/static-analyzer/` — AST → JsonCode
- `src/types/` — TypePlugin system
- `src/vm/` — Interpreter VM (fallback)
- **Do not modify any of these in M5**

### New Code Location
- `src/js-compiler/` — M5 新增的 JS 编译器

## Workflow

1. Read `docs/plan-m5-high-performance.md` to understand current phase and progress
2. Review completed work vs pending tasks
3. Update plan documents with status changes
4. Suggest next steps based on dependencies
5. Commit at milestone boundaries

## Key Documents

- `docs/plan.md` — 总体计划（M0-M5 里程碑概览）
- `docs/plan-m5-high-performance.md` — M5 当前指导文档
- `docs/plan-m4.1-pascal82-conformance.md` — M4.1 归档
- `plan-tex82.md` — M4.2 TEX82 移植归档
- `issue/` — Issue 跟踪

## Key Principles

- FP style: records with duck typing, not classes
- 代码冻结：M5 不修改 `src/` 下任何现有文件
- 测试复用：M4 测试用例重命名为 M5，验证新引擎语义一致
- 渐进验证：先 integer + 控制流跑通 bench，再逐步扩展
- VM 作为 fallback：新引擎处理不了的场景回退到 VM
- Issues are logged to `/issue` before fixing
- Git commits on major changes and milestone boundaries
