# Issue: Test expects 16-bit integer overflow but INTEGER is 32-bit (P0 Test code)

## Date
2026-07-16

## Priority
P0 (Test code)

## Type
Test

## Symptom
`tests/m3.6/q05-operations.test.ts` › `integer overflow` expects `32767 + 1 = -32768` (16-bit wraparound):
```
program test; var x: integer; begin x := 32767; x := x + 1; writeln(x); end.
expectedOutput: '-32768\n'
```
Actual output: `32768\n`. The interpreter defines `INTEGER` as `Integer32Type` (range -2147483648..2147483647), so `32767+1=32768` is correct for this implementation. Pascal82 leaves INTEGER's range implementation-defined; the test's 16-bit expectation is non-standard.

## Root Cause Analysis
`INTEGER_TYPE` in `src/interpreter/types/pascal-value.ts` is `Integer32Type`. The test assumes 16-bit INTEGER, which is not mandated by Pascal82 and does not match the implementation. Test expectation is wrong.

## Fix Plan
- File: `tests/m3.6/q05-operations.test.ts`
- Change: Update the `integer overflow` test to exercise actual 32-bit overflow: use `x := 2147483647; x := x + 1;` with `expectedOutput: '-2147483648\n'` (Integer32Type wraps at 32-bit boundary via `truncateNumber`).
- Risk: None — test-only change; verifies real wraparound behavior of the implementation.

## Reproduction
Run: `npx jest tests/m3.6/q05-operations.test.ts -t "integer overflow"`

## Fix
Updated the `integer overflow` test in `tests/m3.6/q05-operations.test.ts` to exercise actual 32-bit overflow: `x := 2147483647; x := x + 1;` with `expectedOutput: '-2147483648\n'`. Also updated the `maximum value operations` test to use `2147483647` instead of `32767` to match the 32-bit INTEGER type.

## Verification
`npx jest tests/m3.6/q05-operations.test.ts -t "integer overflow"` — passes; `x := 2147483647; x := x + 1;` wraps to `-2147483648` via `Integer32Type.truncateNumber`.

## Status
Fixed
