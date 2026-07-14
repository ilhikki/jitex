# Issue: Predefined identifiers treated as keywords

## Date
2026-07-14

## Symptom
Multiple tests fail because `INTEGER`, `BOOLEAN`, `CHAR`, `REAL`, `TEXT`, `WRITE`, `READ`, `READLN`, `WRITELN`, `BREAK`, `TRUE`, `FALSE`, `NIL`, `CHR`, `ORD` are treated as keywords in the lexer. This causes:
- `parseType` fails when type name is `INTEGER` (not an IDENTIFIER token)
- `parseStatement` fails when calling `WRITE(X)` (not an IDENTIFIER token)
- `parseVariableDeclaration` fails for `X: INTEGER`

## Root Cause
The lexer's KEYWORDS set includes predefined identifiers like `INTEGER`, `WRITE`, etc. In Pascal, these are predefined identifiers, not reserved words. They should be tokenized as IDENTIFIER, allowing the parser to handle them uniformly.

## Reproduction
```
lex('INTEGER') => token type is 'INTEGER' instead of 'IDENTIFIER'
```

## Fix
Remove predefined identifiers from the KEYWORDS set. Keep only true reserved words. Handle `TRUE`/`FALSE` as special cases in the parser (check identifier name).

## Status
Fixed

## Resolution
Removed predefined identifiers (INTEGER, BOOLEAN, CHAR, REAL, TEXT, READ, READLN, WRITE, WRITELN, TRUE, FALSE, NIL, CHR, ORD) from the KEYWORDS set. Now only true Pascal reserved words are keywords. TRUE/FALSE/NIL are handled as special identifiers in the parser's parsePrimary function. All 87 tests pass.
