---
name: "development"
description: "Guides development of pascal-ts interpreter: AST nodes, lexer, and parser in FP style. Invoke when implementing new productions, writing parser functions, or adding AST node types."
---

# Development

This skill guides the development of the pascal-ts interpreter.

## When to Use

- Implementing new AST node types
- Writing lexer or parser functions
- Adding new grammar productions
- Writing unit tests for productions

## Architecture

### Two-Layer Design

**Layer 1: Lexer** — pure function
```
input: { string, offset, offsetToPosition }
output: Token[]
```
Token contains: `{ type, content, start, end }`

**Layer 2: Parser** — pure functions
```
input: { tokens, position }
output: Error | { newPosition, astNode }
```

### AST Node Style (FP / Duck Typing)

AST nodes are plain records (objects), NOT classes. Each node has a `kind` field for duck typing.

```typescript
type AstNode = {
  kind: string
  // ... fields specific to each node type
}
```

### Parser Function Pattern

Each parser function:
1. Takes `{ tokens, position }` as input
2. Uses lookahead (peek current token) to decide which branch to take
3. Does NOT iterate through all possible branches like parser combinators
4. Returns `ParseError | { newPosition: number, astNode: AstNode }`

```typescript
type ParseResult<T> =
  | { success: false; error: string; position: number }
  | { success: true; newPosition: number; astNode: T }
```

## Grammar Productions

See `docs/productions.md` for the full grammar. Each production should:
1. Have a corresponding parser function
2. Have unit tests in `tests/parser/`
3. Be documented with examples

## Testing Strategy

- Test each production independently
- Use small Pascal snippets as test inputs
- Verify both success and failure cases
- Check AST structure matches expectations
