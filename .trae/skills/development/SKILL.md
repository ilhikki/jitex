---
name: "development"
description: "Guides development of pascal-ts: AST, lexer, parser (frozen) and JS compiler. Invoke when implementing compiler logic, type plugins, syscalls, or writing tests."
---

# Development

This skill guides development of the pascal-ts project.

## When to Use

- Implementing JS compiler logic (expression/statement/declaration compilation)
- Working on TypePlugin system (runtime invoke methods)
- Adding new syscalls or file IO features
- Writing or fixing tests in `tests/m5/`
- Working on goto compilation strategies

## Standard Anchor

**ISO Pascal 1983 (ISO 7185) 是唯一行为标准。** 详见 [docs/refactoring-decisions.md](../../../docs/refactoring-decisions.md) 中的"原则 A"。

- 默认行为必须符合 ISO 标准
- 非标特性（如 Berkeley/DEC 扩展）默认必须报错
- 启用非标特性的方式：**注入优先**（如 plugins），无法注入时才用配置项
- 非标特性代码注释中必须引用 ISO 章节，并配备正反测试
- 测试中遵循最小化权限原则——非必要不启用非标

## Architecture

### Layer 1: Lexer (Frozen)
Pure function: `{ string, offset, offsetToPosition } => Token[]`

### Layer 2: Parser (Frozen)
Pure functions: `{ tokens, position } => ParseResult`

### Layer 3: JS Compiler (current focus)

#### Execution Model
```
parse(source) → AST → Compiler.compile(ast) → JS code string → new AsyncFunction('ctx', body) → run(ctx)
```

- Pascal source is parsed to AST, then compiled to a JS source string
- The JS string is wrapped in `new AsyncFunction('ctx', body)` and executed
- `ctx` (JSCtx) provides sysCall/box/steps/outputBuffer/inputQueue
- V8 JIT optimizes hot code; performance target: >20M steps/sec

#### Key Files (`src/js-compiler/`)
- `index.ts` — Public API: `runJS(source, options)` / `compileToJS(source)`
- `compiler.ts` — `Compiler` class: public state fields + `compile()` entry + `emitStmt` thin wrapper
- `emit-decl.ts` — Declaration compilation (`emitBody` / `emitProc` / `collectGlobals` / `collectConsts` / `collectProcs` / `emitGlobalDecls`)
- `emit-stmt.ts` — Statement compilation (`emitStmt` / `emitAssignment` / `emitCompound` / `emitCase` / `emitWith` / `emitRead` / `emitProcedureCall`)
- `emit-expr.ts` — Expression compilation (`emitExpr` / `emitBinary` / `emitFunctionCall` / `emitArrayAccess` / `emitFieldAccess` / `emitSetConstructor`)
- `emit-type.ts` — Type resolution (`resolveTypeId` / `subrangeBounds` / `recordFieldType` / `arrayElementType`)
- `emit-utils.ts` — Utilities + builtin tables + `Scope` / `ProcInfo` / `VarInfo` / `WithRecordInfo`
- `context.ts` — Runtime context (`JSCtx`, `createJSCtx`, `ctxToRunState`)
- `run-state.ts` — `RunState` / `RunError` interfaces (execution result)
- `strategy.ts` — Goto compilation strategies (state machine with labeled break/continue)
- `syscalls.ts` — Syscall handlers (WRITE/READ/ORD/RESET/...)
- `file-model.ts` — Async file IO model (PascalFile/PascalFileOps/PascalIO)
- `type-table-builder.ts` — Build TypeTable from AST
- `types/` — TypePlugin system
  - `types.ts` — Core type definitions (PascalValue, TypeDef, TypeTable, TypeOps)
  - `*.plugin.ts` — Type plugins (integer/boolean/char/real/array/record/enum/subrange/set/file/string)

#### TypePlugin System
Each plugin implements `TypeOps` with `can` (check) and `invoke` (runtime) methods.
JS compiler only calls `invoke` — the old `toCode` (JsonCode generation) was removed in 5.5.1.

**Standard plugins** (loaded by default in both `runJS` and `compileToJS`): integer, boolean, char, real, array, record, enum, subrange, set, file.
**Non-standard plugins** (must be injected by user): `stringPlugin` (string type is a non-standard extension).

#### Goto Compilation
See [docs/design-goto-strategy.md](../../../docs/design-goto-strategy.md) for the full design.

Key principles:
- Transparent blocks (CompoundStatement/CaseStatement/WithStatement): labels hoist to outer state machine
- Opaque blocks (While/Repeat/For/If): can have independent state machine
- All goto uses pure `continue`/`break` with JS labels — NO `throw` for control flow

## Testing Strategy

- `tests/m5/` — 400+ test cases, all run through JS compiler
- `_helper.ts` provides `runPascal(test)` / `runPascalTest(test)` / `runPascalTests(tests)` / `getOutput(state)`
- Test interface `PascalTest` (engine-agnostic name) has: name, code, purpose, features, expectedOutput/expectedContains/expectedNotContains/expectedError, input, plugins, files, programFileUrls, sysCalls, allowUndeclaredLabels, debugEmitJS
- For debugging: `debugEmitJS: true` prints generated JS on failure
- TEX82 end-to-end tests live in `tests-tex/` (long-running, not in default `npx jest` filter)

## Key Principles

- Frozen layers: never modify `src/ast/`, `src/lexer/`, `src/parser/`
- Compiler produces pure JS — no intermediate representation (JsonCode was removed)
- `integer`/`boolean`/`char` compile to bare JS values for JIT optimization
- `array`/`record`/`set`/`file` use PascalValue + plugin.invoke
- Step limit check at loop heads to prevent infinite loops
- Git commits on major changes and milestone boundaries
- 发现问题先记录到 [docs/refactoring-decisions.md](../../../docs/refactoring-decisions.md)，不要随意决策
