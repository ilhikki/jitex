# Issue: Test code uses non-standard multiple VAR sections (P0 Test code)

## Date
2026-07-16

## Priority
P0 (Test code)

## Type
Test

## Symptom
Three tests in `tests/m3.6/q05-operations.test.ts` use two separate `var` sections in one block:
```
program test; var i: integer; var c: char; begin ... end.
```
Pascal82 allows exactly one `var` section per block (label/const/type/var/proc-func/begin). The parser correctly rejects the second `var` with `Expected keyword BEGIN but got VAR (var)`.

Failing tests:
- `Type Conversions › integer to char`
- `Type Conversions › char to integer`
- `Type Conversions › mixed type operations`

## Root Cause Analysis
Test code uses non-standard syntax. The parser is correct (matches Pascal82 §6.2.2.1 block structure: each declaration section appears at most once). The tests are wrong.

## Fix Plan
- File: `tests/m3.6/q05-operations.test.ts`
- Change: Combine `var i: integer; var c: char;` into a single `var i: integer; c: char;` section in the three affected tests.
- Risk: None — test-only change to valid Pascal82 syntax.

## Reproduction
Run: `npx jest tests/m3.6/q05-operations.test.ts -t "integer to char"`

## Fix
Combined `var i: integer; var c: char;` into a single `var i: integer; c: char;` section in the three affected tests (`integer to char`, `char to integer`, `mixed type operations`) in `tests/m3.6/q05-operations.test.ts`.

## Verification
`npx jest tests/m3.6/q05-operations.test.ts` — all 43 tests pass (including the three previously failing tests).

## Status
Fixed
