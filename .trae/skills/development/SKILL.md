---
name: "development"
description: "Guides development of pascal-ts interpreter: AST, lexer, parser (frozen) and PDI interpreter. Invoke when implementing frames, state, scope, or writing interpreter tests."
---

# Development

This skill guides development of the pascal-ts project.

## When to Use

- Implementing interpreter frames (Frame types, step logic)
- Working on State, Scope, or DeclarationTable
- Writing interpreter unit tests
- Adding new statement types to the interpreter

## Architecture

### Layer 1: Lexer (Frozen)
Pure function: `{ string, offset, offsetToPosition } => Token[]`

### Layer 2: Parser (Frozen)
Pure functions: `{ tokens, position } => ParseResult`

### Layer 3: Interpreter (PDI — current focus)

#### Execution Model
```
run(state: State, mode: RunMode): void
```
- `state` is the single runtime state, `run` mutates it in place
- Each `run` call advances one control step
- Loop `run` until `state.status === 'terminated'`

#### State
```typescript
interface State {
  stack: Frame[]           // execution stack
  globalScope: Scope       // program-level scope
  currentScope: Scope      // active scope
  program: ProgramNode     // parsed AST
  declarations: DeclarationTable
  status: 'running' | 'terminated'
  returnValue: Value | null
}
```

#### Scope
```typescript
interface Scope {
  variables: Map<string, Value>
  parent: Scope | null          // static link (lexical parent)
  functionDecl: ProcDecl | FuncDecl | null  // null = global
}
```

#### Frame
Each statement type has its own Frame. A Frame is a record with:
```typescript
interface Frame {
  kind: string
  done: boolean
  step(state: State): void  // can mutate self, push new frames, set done
}
```

`run` logic:
1. Get top frame from `state.stack`
2. Call `frame.step(state)`
3. Pop all `done` frames from top

#### Value (placeholder for M0)
```typescript
type Value = number | string | boolean | null | undefined
```
M0 does not implement expression evaluation. Tests mock values.

## Testing Strategy

- Baby M0 uses minimal Pascal programs (handwritten)
- Verify stack state (depth, frame kinds) — not output
- Verify scope creation/destruction
- Verify stackTrace() output
- Mock expression evaluation where needed

## Key Principles

- FP style: records with duck typing, not classes
- Frozen layers: never modify `src/ast/`, `src/lexer/`, `src/parser/`
- State is single source of truth: `run(state, mode)` mutates state
- Each statement has its own Frame with `step(state)`
- Issues logged to `/issue` before fixing
- Git commits on major changes
