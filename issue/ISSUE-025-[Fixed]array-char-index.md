# Issue: ARRAY[CHAR] index range incorrectly resolved to {0..0} (P0 Blocking Bug)

## Date
2026-07-18

## Priority
P0 (Blocking — prevents TANGLE from running)

## Type
Silent

## Symptom
`ARRAY[CHAR]` type is incorrectly resolved with index range `{ low: 0, high: 0 }`, resulting in arrays with only 1 element. This causes immediate array index out of bounds when TANGLE tries to access `XORD[CHR(I)]` for I in 0..127.

Failing test: `tests/tangle-run.test.ts` › `VM runs TANGLE`
```
VM: Array index 1 out of range 0..0
```

TANGLE source (line 11):
```pascal
XORD: ARRAY[CHAR] OF ASCIICODE;
```
TANGLE expects 128 elements (0..127) to map each ASCII character to its XOR value.

## Root Cause Analysis
In `src/static-analyzer/index.ts`, the `ArrayType` case in `resolveType` (lines ~694-718) handles array dimensions:

```typescript
// 简单类型作为索引
const idxType = this.resolveType(idx, scope)
if (idxType.kind === 'subrange') {
  return { low: sub.min, high: sub.max, indexTypeId: idxType.id }
}
return { low: 0, high: 0, indexTypeId: idxType.id }  // ❌ BUG: 所有非 subrange 索引退化为 0..0
```

When `idxType` is `char`, `boolean`, or any enumeration type (not a subrange), the code falls through to the default case and returns `{ low: 0, high: 0 }`. This violates Pascal82 §6.4.3.1, which requires that array indices of ordinal types cover the complete range of values.

## Fix Plan
- File: `src/static-analyzer/index.ts`
- Change: In the ArrayType dimension resolution, add special handling for:
  1. `CHAR` type → `{ low: 0, high: 255 }` (extended ASCII)
  2. `BOOLEAN` type → `{ low: 0, high: 1 }` (false=0, true=1)
  3. Enumeration types → `{ low: 0, high: values.length - 1 }`
- Risk: Low — only corrects the range calculation; doesn't change array operations. May affect existing tests that relied on the buggy behavior.

## Reproduction
Run: `npx jest tests/tangle-run.test.ts -t "VM runs TANGLE"`

## Fix
- File: `src/static-analyzer/index.ts`
- Location: ArrayType case in `resolveType` method
- Add: Before the `return { low: 0, high: 0 }` fallback, check if `idxType` is a known ordinal type and return its full range.

## Verification
- `npx jest tests/tangle-run.test.ts` → VM initialization passes without array index errors
- Full test suite: `npx jest --no-coverage` → all tests pass
- New test added to `tests/m4/q13-pascal82-conformance.test.ts` for `ARRAY[CHAR]` and `ARRAY[BOOLEAN]`

## Fix Applied
- File: `src/static-analyzer/index.ts` (lines 713-723)
- Added special handling for ordinal types as array indices (Pascal82 §6.4.3.1):
  - `CHAR` → `{ low: 0, high: 255 }` (extended ASCII)
  - `BOOLEAN` → `{ low: 0, high: 1 }` (false=0, true=1)
  - `ENUM` → `{ low: 0, high: values.length - 1 }`

## Verification
- `npx jest tests/tangle-run.test.ts` → VM initialization passes without array index errors
- `npx jest tests/m4/q13-pascal82-conformance.test.ts` → 5 new tests all pass
- Full test suite: 828 passed / 36 suites (was 823 passed / 35 suites)

## Status
Fixed
