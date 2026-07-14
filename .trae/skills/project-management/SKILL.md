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

**Pascal Debug Interpreter (PDI)** — see `plan.md`

### Milestones
- **M0** — Control flow and function jumping (current)
  - Baby M0: call/return, scope lifetime, stack trace
  - M0 Full: all statement types
- **M1** — Simple expressions and assignment
- **M2** — Pascal type system
- **M3** — Standard library
- **M4** — Non-debugger mode and optimization

### Frozen Layers
- `src/ast/` — AST node definitions (FP records)
- `src/lexer/` — Lexer (pure function)
- `src/parser/` — Parser (pure functions)
- **Do not modify these layers**

### Previous Phase
- AST/Lexer/Parser implementation — archived in `docs/plan-ast-phase.md`

## Workflow

1. Read `plan.md` to understand current milestone and progress
2. Review completed work vs pending tasks
3. Update `plan.md` with status changes
4. Suggest next steps based on dependencies
5. Commit at milestone boundaries

## Project Structure

```
pascal-ts/
├── src/
│   ├── ast/              # ❄️ Frozen - AST node definitions
│   ├── lexer/             # ❄️ Frozen - Lexer
│   ├── parser/            # ❄️ Frozen - Parser
│   ├── interpreter/       # 🆕 PDI implementation
│   └── index.ts
├── tests/
│   ├── lexer/             # Lexer tests
│   ├── parser/            # Parser tests
│   └── interpreter/       # Interpreter tests
├── docs/
│   ├── productions.md     # Grammar productions
│   └── plan-ast-phase.md  # Archived AST phase plan
├── issue/                 # Issue tracking
├── knuth/web/             # Target Pascal files
├── scripts/               # Utility scripts
└── plan.md                # Current plan (PDI)
```

## Key Principles

- FP style: records with duck typing, not classes
- State is the single runtime state: `run(state, mode)` mutates state in place
- Each statement type has its own Frame with `step(state)` method
- Issues are logged to `/issue` before fixing
- Git commits on major changes and milestone boundaries
