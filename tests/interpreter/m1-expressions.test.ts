import {parse} from '../../src/index'
import {createInterpreterState, runToCompletion, State} from '../../src/interpreter'

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
      const value = s.variables.get(upper)
      return value.rawValue
    }
    s = s.parent
  }
  return undefined
}

// ============================================================================
// Test expression evaluation
// ============================================================================
describe('M1: expression evaluation', () => {
    test('integer literals', () => {
        const source = `PROGRAM T; VAR X: INTEGER; BEGIN X := 42 END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'X')).toBe(42)
    })

    test('binary operations: + - * /', () => {
        const source = `PROGRAM T; VAR A,B,C: INTEGER; BEGIN A := 10; B := 3; C := A + B * 2 END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'C')).toBe(16)
    })

    test('DIV and MOD', () => {
        const source = `PROGRAM T; VAR A,B,C,D: INTEGER; BEGIN A := 10; B := 3; C := A DIV B; D := A MOD B END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'C')).toBe(3)
        expect(getVar(state, 'D')).toBe(1)
    })

    test('comparison operators', () => {
        const source = `PROGRAM T; VAR A,B,C,D,E,F,G: BOOLEAN; BEGIN A := 1 = 1; B := 1 <> 2; C := 1 < 2; D := 1 <= 1; E := 2 > 1; F := 2 >= 2; G := 1 > 2 END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'A')).toBe(1)
        expect(getVar(state, 'B')).toBe(1)
        expect(getVar(state, 'C')).toBe(1)
        expect(getVar(state, 'D')).toBe(1)
        expect(getVar(state, 'E')).toBe(1)
        expect(getVar(state, 'F')).toBe(1)
        expect(getVar(state, 'G')).toBe(0)
    })

    test('unary operators', () => {
        const source = `PROGRAM T; VAR A,B: INTEGER; C,D: BOOLEAN; BEGIN A := -5; B := +3; C := NOT FALSE; D := NOT TRUE END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'A')).toBe(-5)
        expect(getVar(state, 'B')).toBe(3)
        expect(getVar(state, 'C')).toBe(1)
        expect(getVar(state, 'D')).toBe(0)
    })

    test('logical AND/OR', () => {
        const source = `PROGRAM T; VAR A,B,C,D: BOOLEAN; BEGIN A := TRUE AND TRUE; B := TRUE AND FALSE; C := FALSE OR TRUE; D := FALSE OR FALSE END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'A')).toBe(1)
        expect(getVar(state, 'B')).toBe(0)
        expect(getVar(state, 'C')).toBe(1)
        expect(getVar(state, 'D')).toBe(0)
    })

    test('parenthesized expressions', () => {
        const source = `PROGRAM T; VAR X: INTEGER; BEGIN X := (1 + 2) * 3 END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'X')).toBe(9)
    })

    test('identifier lookup', () => {
        const source = `PROGRAM T; VAR X,Y: INTEGER; BEGIN X := 10; Y := X END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'X')).toBe(10)
        expect(getVar(state, 'Y')).toBe(10)
    })
})

// ============================================================================
// Test assignment
// ============================================================================
describe('M1: assignment', () => {
    test('simple assignment', () => {
        const source = `PROGRAM T; VAR X: INTEGER; BEGIN X := 5 END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'X')).toBe(5)
    })

    test('assignment with expression', () => {
        const source = `PROGRAM T; VAR X,Y,Z: INTEGER; BEGIN X := 2; Y := 3; Z := X + Y END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'Z')).toBe(5)
    })

    test('multiple assignments', () => {
        const source = `PROGRAM T; VAR A,B,C: INTEGER; BEGIN A := 1; B := 2; C := 3 END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'A')).toBe(1)
        expect(getVar(state, 'B')).toBe(2)
        expect(getVar(state, 'C')).toBe(3)
    })
})

// ============================================================================
// Test IF with real condition evaluation
// ============================================================================
describe('M1: IF statement with real evaluation', () => {
    test('IF THEN branch', () => {
        const source = `PROGRAM T; VAR X,Y: INTEGER; BEGIN X := 1; IF X THEN Y := 10 ELSE Y := 20 END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'Y')).toBe(10)
    })

    test('IF ELSE branch', () => {
        const source = `PROGRAM T; VAR X,Y: INTEGER; BEGIN X := 0; IF X THEN Y := 10 ELSE Y := 20 END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'Y')).toBe(20)
    })

    test('IF with comparison', () => {
        const source = `PROGRAM T; VAR X,Y: INTEGER; BEGIN X := 5; IF X > 3 THEN Y := 100 ELSE Y := 200 END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'Y')).toBe(100)
    })
})

// ============================================================================
// Test WHILE with real condition evaluation
// ============================================================================
describe('M1: WHILE loop', () => {
    test('WHILE loop with counter', () => {
        const source = `PROGRAM T; VAR I,SUM: INTEGER; BEGIN I := 0; SUM := 0; WHILE I < 5 DO BEGIN SUM := SUM + I; I := I + 1 END END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'SUM')).toBe(0 + 1 + 2 + 3 + 4)
        expect(getVar(state, 'I')).toBe(5)
    })

    test('WHILE loop with decrement', () => {
        const source = `PROGRAM T; VAR I: INTEGER; BEGIN I := 3; WHILE I > 0 DO I := I - 1 END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'I')).toBe(0)
    })
})

// ============================================================================
// Test REPEAT with real condition evaluation
// ============================================================================
describe('M1: REPEAT loop', () => {
    test('REPEAT loop', () => {
        const source = `PROGRAM T; VAR I,SUM: INTEGER; BEGIN I := 1; SUM := 0; REPEAT SUM := SUM + I; I := I + 1 UNTIL I > 5 END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'SUM')).toBe(1 + 2 + 3 + 4 + 5)
        expect(getVar(state, 'I')).toBe(6)
    })
})

// ============================================================================
// Test CASE with real evaluation
// ============================================================================
describe('M1: CASE statement', () => {
    test('CASE with matching branch', () => {
        const source = `PROGRAM T; VAR X,Y: INTEGER; BEGIN X := 2; CASE X OF 1: Y := 10; 2: Y := 20; 3: Y := 30 END END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'Y')).toBe(20)
    })

    test('CASE with otherwise', () => {
        const source = `PROGRAM T; VAR X,Y: INTEGER; BEGIN X := 5; CASE X OF 1: Y := 10; 2: Y := 20 OTHERWISE Y := 99 END END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'Y')).toBe(99)
    })
})

// ============================================================================
// Test FOR loop
// ============================================================================
describe('M1: FOR loop', () => {
    test('FOR TO loop', () => {
        const source = `PROGRAM T; VAR I,SUM: INTEGER; BEGIN SUM := 0; FOR I := 1 TO 3 DO SUM := SUM + I END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'SUM')).toBe(6)
    })
})

// ============================================================================
// Test function return values
// ============================================================================
describe('M1: function return', () => {
    test('simple function return', () => {
        const source = `PROGRAM T; VAR R: INTEGER; FUNCTION F: INTEGER; BEGIN F := 42 END; BEGIN R := F END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'R')).toBe(42)
    })

    test('function with calculation', () => {
        const source = `PROGRAM T; VAR R: INTEGER; FUNCTION ADD(A,B: INTEGER): INTEGER; BEGIN ADD := A + B END; BEGIN R := ADD(3,5) END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'R')).toBe(8)
    })

    test('nested function calls', () => {
        const source = `PROGRAM T; VAR R: INTEGER; FUNCTION DOUBLE(X: INTEGER): INTEGER; BEGIN DOUBLE := X * 2 END; FUNCTION TRIPLE(X: INTEGER): INTEGER; BEGIN TRIPLE := X * 3 END; BEGIN R := DOUBLE(TRIPLE(2)) END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'R')).toBe(12)
    })
})

// ============================================================================
// Test scope with variables
// ============================================================================
describe('M1: scope with variables', () => {
    test('local variable shadowing', () => {
        const source = `PROGRAM T; VAR X: INTEGER; PROCEDURE P; VAR X: INTEGER; BEGIN X := 20 END; BEGIN X := 10; P END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'X')).toBe(10)
    })

    test('function can access global variables', () => {
        const source = `PROGRAM T; VAR G: INTEGER; FUNCTION F: INTEGER; BEGIN F := G END; BEGIN G := 100; WRITE(F) END.`
        const state = makeState(source)
        runToCompletion(state)
        expect(getVar(state, 'G')).toBe(100)
    })
})
