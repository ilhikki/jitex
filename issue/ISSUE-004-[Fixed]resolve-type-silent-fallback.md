# Issue: resolveType silently falls back to INTEGER for unknown types

## Date
2026-07-16

## Priority
P0

## Type
Silent

## Symptom
When a Pascal program declares a variable with an unknown type (e.g., `var s: string`), `resolveType` returns `INTEGER_TYPE` instead of throwing an error. This hides real bugs and makes it impossible to verify that non-standard features like `string` have been properly removed.

## Root Cause Analysis
In `src/interpreter/types.ts`, the `resolveType` function has this code:
```typescript
case 'SimpleType': {
  const name = (typeNode as SimpleTypeNode).name.name.toUpperCase()
  const builtin = findType(name)
  if (builtin) return builtin

  const typeDecl = state.declarations.types.get(name)
  if (typeDecl) {
    const resolved = resolveType(typeDecl.typeDef, state)
    registerType(name, resolved)
    return resolved
  }

  return INTEGER_TYPE  // <-- This is the silent fallback
}
```

Instead of throwing an error when the type is not found, it silently returns `INTEGER_TYPE`.

## Fix Plan
- File: src/interpreter/types.ts
- Change: Replace `return INTEGER_TYPE` with `throw new Error(`Undefined type: ${name}`)`
- Risk: Medium; may expose tests that use non-standard types like `string`

## Reproduction
```pascal
program test;
var s: string;  // string is not a Pascal82 type
begin
  writeln(s);
end.
```
Expected: Error "Undefined type: STRING"
Actual: No error, s is treated as INTEGER

## Fix
- `src/interpreter/types.ts`: Changed `resolveType` to throw `Error('Undefined type: ${name}')` instead of silently returning `INTEGER_TYPE`
- `src/interpreter/types/pascal-value.ts`: Removed `StringType` class, `STRING_TYPE` constant, `makeString` function, and char-to-string coercion
- `src/interpreter/frames.ts`: Removed `makeString` and `STRING_TYPE` imports; updated `read` procedure to handle `packed array of char` instead of `string`
- `src/interpreter/evaluator.ts`: Removed `makeString` and `STRING_TYPE` imports; updated string literal evaluation and type inference to return `array of char` instead of `string`; updated `formatValue` to handle `array of char`
- `tests/m3.6/_helper.ts`: Fixed try-catch to include `createState` call; added `State` import
- `tests/interpreter/m3-stdlib.test.ts`: Changed `READ string` test to `READ packed array of char`

## Verification
- `tests/m3.6/q09-nonstandard-rejected.test.ts`: Passes - string type is now rejected with "Undefined type: STRING"
- Total tests: 877 total, 798 passed, 79 failed (baseline was 78 failed, +1 due to tangle-run.test.ts integration test)

## Status
Fixed
