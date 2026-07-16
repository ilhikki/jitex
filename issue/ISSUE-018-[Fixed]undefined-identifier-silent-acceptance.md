# Issue: Undefined identifier silently returns 0 (P0 Silent Bug)

## Date
2026-07-16

## Priority
P0 (Silent Bug)

## Type
Silent

## Symptom
When an undefined identifier is used in an expression, the interpreter silently returns `makeInteger(0)` instead of raising an error. This hides real bugs (e.g. accessing a local variable outside its scope).

Failing test: `tests/m3.6/q01-scope.test.ts` › `local var not accessible outside scope`
```
program test;
procedure proc;
var x: integer;
begin
  x := 5;
end;
begin
  writeln(x);   { x is not in scope here; should error }
end.
```
Test expects an error; got `null` (no error, `x` silently became 0).

## Root Cause Analysis
`evalIdentifier` in `src/interpreter/evaluator.ts` (lines 160-179) falls back to `return makeInteger(0)` when an identifier is not found as a variable, user function, or system function. The comment says "兼容 TANGLE 等使用无参 procedure 名的表达式", but Pascal82 does not permit procedure names in expression context. This silent fallback violates the project's fail-fast principle and masks scope errors.

## Fix Plan
- File: `src/interpreter/evaluator.ts`
- Change: Replace the silent `return makeInteger(0)` fallback in `evalIdentifier` with `throw new Error('Unknown identifier: <name>')`.
- Risk: Medium — TANGLE tests currently pass; if TANGLE relies on the silent fallback, a test will break and need investigation. tangle-run (ISSUE-003) is already failing and out of scope.

## Reproduction
Run: `npx jest tests/m3.6/q01-scope.test.ts -t "local var not accessible outside scope"`

## Fix
- File: `src/interpreter/evaluator.ts`
  - In `evalIdentifier`, replaced `return makeInteger(0)` fallback with `throw new Error('Unknown identifier: <name>')`.
- File: `src/interpreter/frames.ts`
  - Discovered side issue: TANGLE uses non-standard `OTHERS:` as CASE default branch label. Since `OTHERS` is not a keyword (only `OTHERWISE` is), the parser treats it as an identifier case label. Previously the silent fallback returned 0 for it. Fixed `createCaseFrame` to detect branches whose single label is the identifier `OTHERS` and treat them as the default branch (skip label evaluation; use as fallback when no other branch matches). This is an interpreter-level fix (parser is frozen).
- Risk realized: the TANGLE workaround comment was real, but the proper fix is OTHERS-as-default in CaseFrame, not silent 0.

## Verification
- `npx jest tests/m3.6/q01-scope.test.ts tests/interpreter/tangle-min-repro.test.ts tests/interpreter/tangle-functions.test.ts tests/tangle.test.ts tests/tangle-verify.test.ts` → 58 passed, 0 failed.
- Full suite: 867 passed / 10 failed (was 865/12). +2 fixed (subrange boundary + local var scope), no regressions. tangle-run still fails (ISSUE-003, out of scope).

## Status
Fixed
