import { parse } from '../../src/index'
import { createState, runToCompletion, run, stackTrace, State } from '../../src/interpreter'

function makeState(source: string): State {
  const result = parse(source)
  if (!result.success) throw new Error(`Parse failed: ${result.error}`)
  return createState(result.astNode)
}

function stackKinds(state: State): string[] {
  return state.stack.map(f => f.kind)
}

// ============================================================================
// Test all statement types in M0
// ============================================================================
describe('M0: IF statement', () => {
  test('IF with THEN branch only', () => {
    const source = `PROGRAM T; BEGIN IF 1 THEN WRITE(1) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })

  test('IF with THEN and ELSE', () => {
    const source = `PROGRAM T; BEGIN IF 0 THEN WRITE(1) ELSE WRITE(2) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })

  test('nested IF', () => {
    const source = `PROGRAM T; BEGIN IF 1 THEN IF 1 THEN WRITE(1) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })
})

describe('M0: WHILE statement', () => {
  test('WHILE loop (condition always false)', () => {
    const source = `PROGRAM T; BEGIN WHILE 0 DO WRITE(1) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })

  test('WHILE loop (condition always true - M0: body runs once)', () => {
    const source = `PROGRAM T; BEGIN WHILE 1 DO WRITE(1) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })
})

describe('M0: REPEAT statement', () => {
  test('REPEAT loop (until always true)', () => {
    const source = `PROGRAM T; BEGIN REPEAT WRITE(1) UNTIL 1 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })

  test('REPEAT loop (until always false - M0: body runs once)', () => {
    const source = `PROGRAM T; BEGIN REPEAT WRITE(1) UNTIL 0 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })

  test('REPEAT with multiple statements', () => {
    const source = `PROGRAM T; BEGIN REPEAT WRITE(1); WRITE(2) UNTIL 1 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })
})

describe('M0: FOR statement', () => {
  test('FOR TO loop', () => {
    const source = `PROGRAM T; VAR I: INTEGER; BEGIN FOR I := 1 TO 10 DO WRITE(I) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })

  test('FOR DOWNTO loop', () => {
    const source = `PROGRAM T; VAR I: INTEGER; BEGIN FOR I := 10 DOWNTO 1 DO WRITE(I) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })
})

describe('M0: CASE statement', () => {
  test('CASE with matching branch', () => {
    const source = `PROGRAM T; BEGIN CASE 1 OF 1: WRITE(1); 2: WRITE(2) END END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })

  test('CASE with otherwise', () => {
    const source = `PROGRAM T; BEGIN CASE 3 OF 1: WRITE(1); 2: WRITE(2) OTHERWISE WRITE(3) END END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })

  test('CASE with no match and no otherwise', () => {
    const source = `PROGRAM T; BEGIN CASE 3 OF 1: WRITE(1); 2: WRITE(2) END END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })
})

describe('M0: WITH statement', () => {
  test('WITH record variable', () => {
    const source = `PROGRAM T; TYPE R = RECORD X: INTEGER END; VAR A: R; BEGIN WITH A DO X := 1 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })
})

describe('M0: GOTO statement', () => {
  test('GOTO label', () => {
    const source = `PROGRAM T; LABEL 10; BEGIN GOTO 10; 10: WRITE(1) END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })
})

describe('M0: Assignment', () => {
  test('simple assignment', () => {
    const source = `PROGRAM T; VAR X: INTEGER; BEGIN X := 1 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })

  test('assignment with expression', () => {
    const source = `PROGRAM T; VAR X,Y: INTEGER; BEGIN X := Y + 1 END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })
})

describe('M0: mixed statement types', () => {
  test('program with all statement types', () => {
    const source = `PROGRAM ALL;
      VAR I,X: INTEGER;
      PROCEDURE P; BEGIN END;
      BEGIN
        X := 1;
        IF X THEN P;
        WHILE 0 DO P;
        REPEAT P UNTIL 1;
        FOR I := 1 TO 5 DO P;
        CASE X OF 1: P; 2: P END;
      END.`
    const state = makeState(source)
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })
})

// ============================================================================
// Stack trace verification
// ============================================================================
describe('M0: stack trace with control flow', () => {
  test('IF statement in function', () => {
    const source = `PROGRAM T;
      PROCEDURE F; BEGIN IF 1 THEN WRITE(1) END;
      BEGIN F END.`
    const state = makeState(source)

    // Step until F is active
    for (let i = 0; i < 20 && state.status === 'running'; i++) {
      run(state)
      if (stackTrace(state).includes('F')) {
        expect(stackTrace(state)).toEqual(['F'])
        return
      }
    }
    fail('Function not reached')
  })

  test('nested calls with IF', () => {
    const source = `PROGRAM T;
      PROCEDURE A; BEGIN IF 1 THEN WRITE(1) END;
      PROCEDURE B; BEGIN A END;
      BEGIN B END.`
    const state = makeState(source)

    // Step until A is active
    for (let i = 0; i < 30 && state.status === 'running'; i++) {
      run(state)
      const trace = stackTrace(state)
      if (trace.includes('A')) {
        expect(trace).toEqual(['A', 'B'])
        return
      }
    }
    fail('Function A not reached')
  })
})
