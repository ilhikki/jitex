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

## Workflow

1. Read `plan.md` to understand current plan and progress
2. Review completed work vs pending tasks
3. Update `plan.md` with new milestones or status changes
4. Suggest next steps based on dependencies
5. Commit at a good time

## Project Structure

```
pascal-ts/
├── src/
│   ├── ast/           # AST node definitions (FP style records)
│   ├── lexer/         # Lexer (pure function: input => token[])
│   ├── parser/        # Parser (pure functions: {tokens, pos} => result)
│   └── index.ts
├── tests/
├── docs/
│   └── productions.md # Grammar productions documentation
├── issue/             # Issue tracking (one file per issue)
├── plan.md            # Project plan
└── pascal-file/
    └── tangle-official.pas
```

## Key Principles

- FP style: AST nodes are records with duck typing, not classes
- Parser functions are pure: `{tokens, position} => Error | {newPosition, astNode}`
- Lexer is a pure function: `{string, offset, offsetToPosition} => token[]`
- Each production has unit tests
- Issues are logged to `/issue` before fixing
- Git commits on major changes
