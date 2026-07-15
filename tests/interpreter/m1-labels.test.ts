import { parse } from '../../src'
import { createInterpreterState, runToCompletion, run, State, PascalValue } from '../../src/interpreter'

function makeState(source: string): State {
  const result = parse(source)
  if (!result.success) throw new Error(`Parse failed: ${result.error}`)
  return createInterpreterState(result.astNode)
}

function getVar(state: State, name: string): any {
  const upper = name.toUpperCase()
  let s: any = state.currentScope
  while (s) {
    if (s.variables.has(upper)) {
      const value: PascalValue = s.variables.get(upper)
      if (value.type.kind === 'boolean') return value.rawValue === 1
      if (value.type.kind === 'char') return String.fromCharCode(value.rawValue as number)
      if (value.type.kind === 'string') return (value.rawValue as number[]).map(c => String.fromCharCode(c)).join('')
      return value.rawValue
    }
    s = s.parent
  }
  return undefined
}

// ============================================================================
// Basic GOTO forward/backward
// ============================================================================
describe('GOTO labels', () => {
  test('GOTO forward jump', () => {
    const source = `PROGRAM T; LABEL 10; VAR X: INTEGER; BEGIN X := 1; GOTO 10; X := 2; 10: X := 3 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'X')).toBe(3)
  })

  test('GOTO backward jump (loop-like)', () => {
    const source = `PROGRAM T; LABEL 10; VAR X: INTEGER; BEGIN X := 0; 10: X := X + 1; IF X < 5 THEN GOTO 10 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'X')).toBe(5)
  })

  test('multiple labels', () => {
    const source = `PROGRAM T; LABEL 10,20,30; VAR X: INTEGER; BEGIN X := 0; GOTO 20; 10: X := X + 1; GOTO 30; 20: X := X + 2; GOTO 10; 30: END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'X')).toBe(3)
  })
})

// ============================================================================
// GOTO across IF blocks
// ============================================================================
describe('GOTO across IF blocks', () => {
  test('GOTO from inside IF body to label outside', () => {
    const source = `PROGRAM T; LABEL 99; VAR X,Y: INTEGER; BEGIN X := 1; IF X = 1 THEN BEGIN Y := 10; GOTO 99 END; Y := 20; 99: Y := 99 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'Y')).toBe(99)
  })

  test('GOTO from inside ELSE body to label outside', () => {
    const source = `PROGRAM T; LABEL 99; VAR X,Y: INTEGER; BEGIN X := 0; IF X = 1 THEN Y := 10 ELSE BEGIN Y := 20; GOTO 99 END; Y := 30; 99: Y := 99 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'Y')).toBe(99)
  })

  test('GOTO into IF body (label inside IF)', () => {
    const source = `PROGRAM T; LABEL 10; VAR X,Y: INTEGER; BEGIN X := 1; GOTO 10; Y := 0; IF X = 1 THEN BEGIN 10: Y := 42 END END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'Y')).toBe(42)
  })

  test('GOTO from IF THEN skips remaining THEN body and ELSE', () => {
    const source = `PROGRAM T; LABEL 10; VAR X,Y,Z: INTEGER; BEGIN X := 1; IF X = 1 THEN BEGIN Y := 10; GOTO 10; Z := 20 END ELSE BEGIN Z := 30 END; 10: Y := 99 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'Y')).toBe(99)
    expect(getVar(state, 'Z')).toBe(0)
  })

  test('GOTO skips ELSE branch', () => {
    const source = `PROGRAM T; LABEL 99; VAR X,Y: INTEGER; BEGIN X := 1; IF X = 1 THEN GOTO 99; Y := 10; 99: Y := 20 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'Y')).toBe(20)
  })
})

// ============================================================================
// GOTO across WHILE blocks
// ============================================================================
describe('GOTO across WHILE blocks', () => {
  test('GOTO from inside WHILE to label outside (break)', () => {
    const source = `PROGRAM T; LABEL 99; VAR I,S: INTEGER; BEGIN I := 0; S := 0; WHILE I < 100 DO BEGIN I := I + 1; S := S + 1; IF I = 5 THEN GOTO 99 END; 99: END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'S')).toBe(5)
    expect(getVar(state, 'I')).toBe(5)
  })

  test('GOTO into WHILE body (label inside WHILE)', () => {
    const source = `PROGRAM T; LABEL 10; VAR X,Y: INTEGER; BEGIN X := 0; GOTO 10; Y := 0; WHILE X < 3 DO BEGIN 10: X := X + 1; Y := Y + 10 END END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'X')).toBe(3)
    expect(getVar(state, 'Y')).toBe(30)
  })

  test('GOTO backward inside WHILE body creates nested loop', () => {
    const source = `PROGRAM T; LABEL 10; VAR I,J: INTEGER; BEGIN I := 0; WHILE I < 3 DO BEGIN J := 0; 10: J := J + 1; IF J < 2 THEN GOTO 10; I := I + 1 END END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'I')).toBe(3)
    expect(getVar(state, 'J')).toBe(2)
  })
})

// ============================================================================
// GOTO across REPEAT blocks
// ============================================================================
describe('GOTO across REPEAT blocks', () => {
  test('GOTO from inside REPEAT to label outside', () => {
    const source = `PROGRAM T; LABEL 99; VAR I,S: INTEGER; BEGIN I := 0; S := 0; REPEAT I := I + 1; S := S + 1; IF I = 3 THEN GOTO 99 UNTIL FALSE; 99: END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'S')).toBe(3)
    expect(getVar(state, 'I')).toBe(3)
  })

  test('GOTO into REPEAT body (label inside REPEAT)', () => {
    const source = `PROGRAM T; LABEL 10; VAR X: INTEGER; BEGIN X := 0; GOTO 10; REPEAT 10: X := X + 1 UNTIL X >= 3 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'X')).toBe(3)
  })
})

// ============================================================================
// GOTO across FOR blocks
// ============================================================================
describe('GOTO across FOR blocks', () => {
  test('GOTO from inside FOR loop to label outside (break)', () => {
    const source = `PROGRAM T; LABEL 99; VAR I,S: INTEGER; BEGIN S := 0; FOR I := 1 TO 10 DO BEGIN S := S + 1; IF I = 4 THEN GOTO 99 END; 99: END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'S')).toBe(4)
  })

  test('GOTO into FOR loop body (label inside FOR)', () => {
    const source = `PROGRAM T; LABEL 10; VAR I,S: INTEGER; BEGIN S := 0; GOTO 10; FOR I := 1 TO 3 DO BEGIN 10: S := S + 1 END END.`
    const state = makeState(source)
    runToCompletion(state)
    // GOTO enters the FOR body once, executes S := S + 1, then the FOR continues
    expect(getVar(state, 'S')).toBe(1)
  })
})

// ============================================================================
// GOTO across CASE blocks
// ============================================================================
describe('GOTO across CASE blocks', () => {
  test('GOTO from inside CASE branch to label outside', () => {
    const source = `PROGRAM T; LABEL 99; VAR X,Y: INTEGER; BEGIN X := 2; CASE X OF 1: Y := 10; 2: BEGIN Y := 20; GOTO 99 END; 3: Y := 30 END; Y := 40; 99: Y := 99 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'Y')).toBe(99)
  })

  test('GOTO into CASE branch (label inside CASE)', () => {
    const source = `PROGRAM T; LABEL 10; VAR X,Y: INTEGER; BEGIN X := 2; GOTO 10; CASE X OF 1: Y := 10; 2: BEGIN 10: Y := 42 END; 3: Y := 30 END END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'Y')).toBe(42)
  })
})

// ============================================================================
// GOTO across nested blocks
// ============================================================================
describe('GOTO across nested blocks', () => {
  test('GOTO from deeply nested IF inside WHILE inside IF', () => {
    const source = `PROGRAM T; LABEL 99; VAR I,X,Y: INTEGER; BEGIN X := 0; Y := 0; FOR I := 1 TO 10 DO BEGIN IF I > 3 THEN BEGIN IF I = 5 THEN BEGIN Y := I; GOTO 99 END END; X := X + 1 END; 99: END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'Y')).toBe(5)
    // X is incremented for I=1..4 (I=5 GOTOs out before increment)
    expect(getVar(state, 'X')).toBe(4)
  })

  test('GOTO to label in nested compound inside IF', () => {
    const source = `PROGRAM T; LABEL 10; VAR X,Y,Z: INTEGER; BEGIN GOTO 10; X := 1; IF X = 0 THEN BEGIN Y := 2; 10: Z := 99 END END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'Z')).toBe(99)
  })
})

// ============================================================================
// GOTO scope: intra-procedural only
// ============================================================================
describe('GOTO scope (intra-procedural)', () => {
  test('local label in procedure', () => {
    const source = `PROGRAM T; LABEL 10; VAR X: INTEGER; PROCEDURE P; LABEL 10; VAR Y: INTEGER; BEGIN Y := 0; GOTO 10; Y := 1; 10: Y := 2; X := Y END; BEGIN X := 0; P; GOTO 10; X := 999; 10: X := X + 100 END.`
    const state = makeState(source)
    runToCompletion(state)
    // Procedure P jumps to its own label 10, setting X=2.
    // Main block jumps to its own label 10, skipping X:=999.
    expect(getVar(state, 'X')).toBe(102)
  })

  test('GOTO cannot cross function boundary (label not found != ignored)', () => {
      // 快速失败！
    const source = `PROGRAM T; LABEL 99; VAR X: INTEGER; PROCEDURE P; BEGIN GOTO 99; X := 1 END; BEGIN X := 0; P; 99: X := 42 END.`
    const state = makeState(source)
    expect(()=>runToCompletion(state)).toThrow()
  })

  test('GOTO to non-existent label in same procedure throws (fast fail)', () => {
    const source = `PROGRAM T; LABEL 10; VAR X: INTEGER; BEGIN X := 0; GOTO 99; X := 1; 10: X := 42 END.`
    const state = makeState(source)
    expect(()=>runToCompletion(state)).toThrow()
  })
})

// ============================================================================
// GOTO continuation after jump
// ============================================================================
describe('GOTO continuation', () => {
  test('after GOTO, remaining statements in compound execute', () => {
    const source = `PROGRAM T; LABEL 10; VAR A,B,C: INTEGER; BEGIN GOTO 10; A := 1; 10: B := 2; C := 3 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'A')).toBe(0)
    expect(getVar(state, 'B')).toBe(2)
    expect(getVar(state, 'C')).toBe(3)
  })

  test('GOTO into BEGIN...END block, continues with rest of block', () => {
    const source = `PROGRAM T; LABEL 10; VAR A,B,C: INTEGER; BEGIN GOTO 10; A := 1; IF A = 0 THEN BEGIN 10: B := 2; C := 3 END END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'A')).toBe(0)
    expect(getVar(state, 'B')).toBe(2)
    expect(getVar(state, 'C')).toBe(3)
  })
})
