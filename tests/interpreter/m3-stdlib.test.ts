import { parse } from '../../src/index'
import { createState, runToCompletion, State } from '../../src/interpreter'

function makeState(source: string, input?: string[]): State {
  const result = parse(source)
  if (!result.success) throw new Error(`Parse failed: ${result.error}`)
  const state = createState(result.astNode)
  if (input) {
    state.inputQueue = [...input]
  }
  return state
}

function getVar(state: State, name: string): any {
  const upper = name.toUpperCase()
  let s: any = state.currentScope
  while (s) {
    if (s.variables.has(upper)) {
      return s.variables.get(upper)
    }
    s = s.parent
  }
  return undefined
}

// ============================================================================
// Test builtin functions
// ============================================================================
describe('M3: builtin functions', () => {
  test('CHR function', () => {
    const source = `PROGRAM T; VAR C: CHAR; BEGIN C := CHR(65) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'C')).toBe('A')
  })

  test('ORD function', () => {
    const source = `PROGRAM T; VAR I: INTEGER; BEGIN I := ORD('A') END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'I')).toBe(65)
  })

  test('ABS function', () => {
    const source = `PROGRAM T; VAR A,B: INTEGER; BEGIN A := ABS(-5); B := ABS(3) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'A')).toBe(5)
    expect(getVar(state, 'B')).toBe(3)
  })

  test('ROUND function', () => {
    const source = `PROGRAM T; VAR A,B: INTEGER; BEGIN A := ROUND(3.7); B := ROUND(3.2) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'A')).toBe(4)
    expect(getVar(state, 'B')).toBe(3)
  })

  test('TRUNC function', () => {
    const source = `PROGRAM T; VAR A,B: INTEGER; BEGIN A := TRUNC(3.7); B := TRUNC(-3.7) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'A')).toBe(3)
    expect(getVar(state, 'B')).toBe(-3)
  })
})

// ============================================================================
// Test WRITE/WRITELN
// ============================================================================
describe('M3: WRITE/WRITELN', () => {
  test('WRITE with integer', () => {
    const source = `PROGRAM T; BEGIN WRITE(42) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.outputBuffer.join('')).toBe('42')
  })

  test('WRITE with string', () => {
    const source = `PROGRAM T; BEGIN WRITE('Hello') END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.outputBuffer.join('')).toBe('Hello')
  })

  test('WRITE with multiple arguments', () => {
    const source = `PROGRAM T; BEGIN WRITE('A=', 10, ', B=', 20) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.outputBuffer.join('')).toBe('A=10, B=20')
  })

  test('WRITELN adds newline', () => {
    const source = `PROGRAM T; BEGIN WRITELN('Line1'); WRITELN('Line2') END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.outputBuffer.join('')).toBe('Line1\nLine2\n')
  })

  test('WRITELN with expression', () => {
    const source = `PROGRAM T; VAR X: INTEGER; BEGIN X := 5; WRITELN(X * 2) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.outputBuffer.join('')).toBe('10\n')
  })
})

// ============================================================================
// Test READ/READLN
// ============================================================================
describe('M3: READ/READLN', () => {
  test('READ integer', () => {
    const source = `PROGRAM T; VAR X: INTEGER; BEGIN READ(X) END.`
    const state = makeState(source, ['42'])
    runToCompletion(state)
    expect(getVar(state, 'X')).toBe(42)
  })

  test('READ multiple variables', () => {
    const source = `PROGRAM T; VAR A,B: INTEGER; BEGIN READ(A,B) END.`
    const state = makeState(source, ['10', '20'])
    runToCompletion(state)
    expect(getVar(state, 'A')).toBe(10)
    expect(getVar(state, 'B')).toBe(20)
  })

  test('READ string', () => {
    const source = `PROGRAM T; VAR S: STRING; BEGIN READ(S) END.`
    const state = makeState(source, ['Hello'])
    runToCompletion(state)
    expect(getVar(state, 'S')).toBe('Hello')
  })
})

// ============================================================================
// Test EOF/EOLN
// ============================================================================
describe('M3: EOF/EOLN', () => {
  test('EOF when input is empty', () => {
    const source = `PROGRAM T; VAR B: BOOLEAN; BEGIN B := EOF END.`
    const state = makeState(source, [])
    runToCompletion(state)
    expect(getVar(state, 'B')).toBe(true)
  })

  test('EOF when input has data', () => {
    const source = `PROGRAM T; VAR B: BOOLEAN; BEGIN B := EOF END.`
    const state = makeState(source, ['data'])
    runToCompletion(state)
    expect(getVar(state, 'B')).toBe(false)
  })

  test('EOLN when input is empty', () => {
    const source = `PROGRAM T; VAR B: BOOLEAN; BEGIN B := EOLN END.`
    const state = makeState(source, [])
    runToCompletion(state)
    expect(getVar(state, 'B')).toBe(true)
  })

  test('EOLN when input has data', () => {
    const source = `PROGRAM T; VAR B: BOOLEAN; BEGIN B := EOLN END.`
    const state = makeState(source, ['data'])
    runToCompletion(state)
    expect(getVar(state, 'B')).toBe(false)
  })
})

// ============================================================================
// Test EXIT
// ============================================================================
describe('M3: EXIT', () => {
  test('EXIT from procedure', () => {
    const source = `PROGRAM T; VAR X: INTEGER; PROCEDURE P; BEGIN X := 1; EXIT; X := 2 END; BEGIN X := 0; P END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'X')).toBe(1)
  })

  test('EXIT from nested procedure', () => {
    const source = `PROGRAM T; VAR X: INTEGER; PROCEDURE OUTER; PROCEDURE INNER; BEGIN X := 10; EXIT; X := 99 END; BEGIN X := 5; INNER; X := 20 END; BEGIN X := 0; OUTER END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(getVar(state, 'X')).toBe(20)
  })
})
