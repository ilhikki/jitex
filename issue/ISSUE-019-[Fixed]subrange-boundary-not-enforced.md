# Issue: Subrange boundary check not enforced on assignment (P0 Silent Bug)

## Date
2026-07-16

## Priority
P0 (Silent Bug)

## Type
Silent

## Symptom
Assigning an out-of-range value to a subrange variable does not raise an error. Pascal82 requires runtime bounds checking for subrange types.

Failing test: `tests/m3.6/q05-operations.test.ts` › `subrange boundary check`
```
program test; type Age = 0..120; var a: Age; begin a := 120; a := a + 1; end.
```
Test expects an error (121 is out of `0..120`); got `null` (no error, `a` silently became 121).

## Root Cause Analysis
In `src/interpreter/types/pascal-value.ts`, `coerceToType` (lines 763-805) handles `integer → subrange` conversion by simply wrapping the rawValue without checking the range:
```typescript
if ((value.type.kind === 'integer' && targetType.kind === 'subrange') || ...) {
  return { type: targetType, rawValue: value.rawValue }  // no checkRange!
}
```
`SubrangeType.checkRange` exists but is never called during coercion/assignment.

## Fix Plan
- File: `src/interpreter/types/pascal-value.ts`
- Change: In `coerceToType`, when target type is `subrange`, call `targetType.checkRange(value)` and throw `Error('Value <n> out of range <min>..<max>')` if it returns false.
- Risk: Low — only adds a check where none existed. May surface previously-hidden out-of-range assignments in other tests (those would be real bugs or test expectations to update).

## Reproduction
Run: `npx jest tests/m3.6/q05-operations.test.ts -t "subrange boundary check"`

## Fix
- File: `src/interpreter/types/pascal-value.ts`
- In `coerceToType`, added `targetType.checkRange(value)` checks for three paths where the target is a `subrange`:
  1. integer → subrange
  2. char → subrange
  3. subrange → subrange (the "same kind" branch)
- Throws `Value <n> out of range <min>..<max>` when out of bounds.

## Verification
- `npx jest tests/m3.6/q05-operations.test.ts -t "subrange boundary check"` → PASS
- Full m3.6 suite: 266 passed / 10 failed (was 265 passed / 11 failed). No regressions; the previously-failing subrange test now passes.

## Status
Fixed
