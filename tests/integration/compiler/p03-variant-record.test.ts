import { parse } from '@/index'
import { describe, test, expect } from 'vitest'
describe('ISSUE-026: Variant record parsing', () => {
  test('simple variant record with tag', () => {
    const source = `
PROGRAM TESTVARIANT;
TYPE
  SHAPE = (CIRCLE, RECT, TRI);
  FIG = RECORD
    COL: INTEGER;
    CASE K: SHAPE OF
      CIRCLE: (R: INTEGER);
      RECT: (W, H: INTEGER);
      TRI: (S: INTEGER)
  END;
VAR
  F: FIG;
BEGIN
  F.COL := 1;
  F.K := CIRCLE;
  F.R := 10;
  WRITELN(F.R)
END.
`
    const result = parse(source)
    if (!result.success) {
      console.error('Parse error:', result.error)
    }
    expect(result.success).toBe(true)
  })

  test('variant record without tag name', () => {
    const source = `
PROGRAM TEST;
TYPE
  NODETYPE = (LEAF, BRANCH);
  NODE = RECORD
    CASE NODETYPE OF
      LEAF: (VAL: INTEGER);
      BRANCH: (LEFT, RIGHT: INTEGER)
  END;
VAR
  N: NODE;
BEGIN
END.
`
    const result = parse(source)
    if (!result.success) {
      console.error('Parse error:', result.error)
    }
    expect(result.success).toBe(true)
  })

  test('nested variant records', () => {
    const source = `
PROGRAM TEST;
TYPE
  KIND = (SIMPLE, COMPLEX);
  SUBKIND = (A, B);
  DATA = RECORD
    CASE KIND OF
      SIMPLE: (X: INTEGER);
      COMPLEX: (
        CASE SUBKIND OF
          A: (Y: REAL);
          B: (Z: CHAR)
        END
      )
  END;
VAR
  D: DATA;
BEGIN
END.
`
    const result = parse(source)
    if (!result.success) {
      console.error('Parse error:', result.error)
    }
    expect(result.success).toBe(true)
  })
})
