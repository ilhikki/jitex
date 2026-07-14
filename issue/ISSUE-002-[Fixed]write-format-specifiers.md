# Issue: WRITE/WRITELN format specifiers not parsed

## Date
2026-07-14

## Symptom
Parsing fails at line 50: `WRITE(TERMOUT,'. (l.',LINE:1,')')` with error "Expected RPAREN but got COLON".

## Root Cause
Pascal's WRITE/WRITELN statements support format specifiers: `write(expr : width [: precision])`. The parser currently treats WRITE as a regular procedure call and doesn't handle the `:width` syntax.

## Reproduction
```
parse('PROGRAM T; BEGIN WRITE(LINE:1) END.')
=> fails with "Expected RPAREN but got COLON"
```

## Fix
Add special handling in the statement parser for WRITE/WRITELN: parse arguments as `expression [: expression [: expression]]` instead of just `expression`.

## Status
Fixed

## Resolution
Added special handling for WRITE/WRITELN in the statement parser. When the procedure name is WRITE or WRITELN (case insensitive), arguments are parsed with format specifier support: `expr : width [: precision]`. Format specifiers are represented as BinaryExpression nodes with `:` operator. `tangle-official.pas` now parses successfully.
