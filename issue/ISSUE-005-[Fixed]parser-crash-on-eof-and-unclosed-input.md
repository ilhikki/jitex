# Issue: Parser crashes on EOF and unclosed input

## Date
2026-07-16

## Priority
P1

## Type
Crash

## Symptom
Parser throws unhandled exceptions (e.g., `Cannot read properties of undefined`) when encountering:
1. Unclosed `{ }` comments
2. Unclosed `(* *)` comments
3. EOF after keywords: `program`, `var`, `type`, `const`, `label`, `begin`, `case`, `repeat`
4. Unclosed string literals

7 tests fail in `tests/m3.5/p08-parser-robustness.test.ts`.

## Root Cause Analysis
`parseCompoundStatement` (statements.ts:81) blindly skips the current token with `let pos = input.position + 1` assuming it's `BEGIN`. When the token is actually `EOF` (e.g., after `program test;` or unclosed comments eating the rest of input), position+1 goes past the EOF token, `peek()` returns `undefined`, and accessing `.type` throws `TypeError: Cannot read properties of undefined (reading 'type')`.

This affects 7 crash test cases:
- Unclosed `{ }` or `(* *)` comments (lexer eats everything → EOF comes too early)
- EOF after `program;`, `var`, `type`, `const` keywords

5 other cases (`label`, `begin`, `case`, `repeat`, unclosed string) already return `fail()` correctly.

## Fix Plan
- File: src/parser/statements.ts
- Change: Add `expectKeyword(input, 'BEGIN')` check at the start of `parseCompoundStatement` before skipping. If not BEGIN, return `fail()`.
- Risk: Low; only adds a check where there was none.

## Reproduction
```pascal
program test;
{ unclosed comment
begin
end.
```
Expected: `parse()` returns `{ success: false, error: "..." }`
Actual: `parse()` throws `TypeError: Cannot read properties of undefined`

## Fix
- `src/parser/statements.ts`: Added `expectKeyword(input, 'BEGIN')` check at the start of `parseCompoundStatement` before skipping. If not BEGIN, returns `fail()`.

## Verification
- `tests/m3.5/p08-parser-robustness.test.ts`: 16/16 passed
- Total: 877 tests, 805 passed, 72 failed (baseline was 79 failed, -7)

## Status
Fixed