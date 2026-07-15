import { parse } from '../../src/index'
import { createInterpreterState, run, runToCompletion, stackTrace, State, Scope } from '../../src/interpreter'

function makeState(source: string): State {
  const result = parse(source)
  if (!result.success) throw new Error(`Parse failed: ${result.error}`)
  return createInterpreterState(result.astNode)
}

function stackKinds(state: State): string[] {
  return state.stack.map(f => f.kind)
}

function hasFrame(state: State, kind: string): boolean {
  return state.stack.some(f => f.kind === kind)
}

// ============================================================================
// Test 1: Simple call/return + stack trace
// ============================================================================
describe('Baby M0: call/return', () => {
  const source = `PROGRAM TEST1; PROCEDURE FOO; BEGIN END; BEGIN FOO END.`
  let state: State

  beforeEach(() => {
    state = makeState(source)
  })

  test('step 1: lazy init pushes ProgramFrame', () => {
    run(state)
    expect(stackKinds(state)).toEqual(['Program'])
  })

  test('step 2: ProgramFrame pushes CompoundFrame', () => {
    run(state); run(state)
    expect(hasFrame(state, 'Program')).toBe(true)
    expect(hasFrame(state, 'Compound')).toBe(true)
  })

  test('step 3: Compound pushes ProcedureCall', () => {
    run(state); run(state); run(state)
    expect(hasFrame(state, 'ProcedureCall')).toBe(true)
  })

  test('step 4: ProcedureCall pushes FunctionFrame', () => {
    run(state); run(state); run(state); run(state)
    expect(hasFrame(state, 'Function')).toBe(true)
  })

  test('step 5: FunctionFrame creates scope, pushes body Compound', () => {
    run(state); run(state); run(state); run(state); run(state)
    expect(hasFrame(state, 'Function')).toBe(true)
    // Scope changed
    expect(state.currentScope).not.toBe(state.globalScope)
    expect(state.currentScope.functionDecl).not.toBeNull()
    expect(state.currentScope.functionDecl!.name.name).toBe('FOO')
  })

  test('runs to completion', () => {
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })

  test('stack trace shows FOO during execution', () => {
    run(state); run(state); run(state); run(state); run(state)
    expect(stackTrace(state)).toContain('FOO')
  })

  test('stack trace empty when no function active', () => {
    run(state); run(state)
    expect(stackTrace(state)).toEqual([])
  })
})

// ============================================================================
// Test 2: Nested calls + scope
// ============================================================================
describe('Baby M0: nested calls', () => {
  const source = `PROGRAM TEST2;
    PROCEDURE OUTER;
      PROCEDURE INNER;
      BEGIN END;
    BEGIN INNER END;
    BEGIN OUTER END.`
  let state: State

  beforeEach(() => {
    state = makeState(source)
  })

  test('runs to completion', () => {
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })

  test('can find INNER in stack during nested call', () => {
    // Step until INNER function is active
    for (let i = 0; i < 20 && state.status === 'running'; i++) {
      run(state)
      if (stackTrace(state).includes('INNER')) break
    }
    expect(stackTrace(state)).toContain('INNER')
    expect(stackTrace(state)).toContain('OUTER')
  })

  test('scope changes during nested call', () => {
    // Step to INNER
    for (let i = 0; i < 20 && state.status === 'running'; i++) {
      run(state)
      if (state.currentScope.functionDecl?.name.name === 'INNER') break
    }
    expect(state.currentScope.functionDecl?.name.name).toBe('INNER')
  })

  test('scope restored to global after completion', () => {
    runToCompletion(state)
    expect(state.currentScope).toBe(state.globalScope)
  })
})

// ============================================================================
// Test 3: Multiple sequential calls (C -> B -> A)
// ============================================================================
describe('Baby M0: multiple sequential calls', () => {
  const source = `PROGRAM TEST3;
    PROCEDURE A; BEGIN END;
    PROCEDURE B; BEGIN A; END;
    PROCEDURE C; BEGIN B; END;
    BEGIN C END.`
  let state: State

  beforeEach(() => {
    state = makeState(source)
  })

  test('runs to completion', () => {
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })

  test('call chain C->B->A visible in stack trace', () => {
    // Step until A is active (deepest call)
    for (let i = 0; i < 30 && state.status === 'running'; i++) {
      run(state)
      const trace = stackTrace(state)
      if (trace.includes('A')) {
        expect(trace).toEqual(['A', 'B', 'C'])
        return
      }
    }
    fail('Did not reach A in call chain')
  })

  test('scope back to global after completion', () => {
    runToCompletion(state)
    expect(state.currentScope).toBe(state.globalScope)
    expect(state.stack.length).toBe(0)
  })
})

// ============================================================================
// Test 4: Empty programs
// ============================================================================
describe('Baby M0: empty programs', () => {
  test('empty main terminates', () => {
    const state = makeState('PROGRAM EMPTY; BEGIN END.')
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })

  test('main with multiple empty statements', () => {
    const state = makeState('PROGRAM MULTI; BEGIN ;;; END.')
    runToCompletion(state)
    expect(state.status).toBe('terminated')
  })
})

// ============================================================================
// Test 5: Step counting
// ============================================================================
describe('Baby M0: step counting', () => {
  test('simple call: PROGRAM T; PROCEDURE F; BEGIN END; BEGIN F END.', () => {
    const state = makeState('PROGRAM T; PROCEDURE F; BEGIN END; BEGIN F END.')
    let steps = 0
    while (state.status === 'running' && steps < 100) {
      run(state)
      steps++
    }
    // Steps:
    // 1: init -> [Program]
    // 2: Program.step -> [Program, Compound]
    // 3: Compound.step -> [Program, Compound, ProcedureCall]
    // 4: ProcedureCall.step -> [Program, Compound, ProcedureCall(done), Function]
    // 5: Function.step(init) -> [Program, Compound, ProcedureCall(done), Function, Compound]
    // 6: Compound.step(done) -> cleanup -> [Program, Compound, ProcedureCall(done), Function]
    // 7: Function.step(running,done) -> cleanup -> [Program, Compound]
    // 8: Compound.step(done) -> cleanup -> [Program]
    // 9: Program.step(done) -> cleanup -> [] -> terminated
    expect(steps).toBe(9)
    expect(state.status).toBe('terminated')
  })

  test('empty program: PROGRAM E; BEGIN END.', () => {
    const state = makeState('PROGRAM E; BEGIN END.')
    let steps = 0
    while (state.status === 'running' && steps < 100) {
      run(state)
      steps++
    }
    // 1: init -> [Program]
    // 2: Program.step -> [Program, Compound]
    // 3: Compound.step (empty, done) -> cleanup -> [Program]
    // 4: Program.step (done) -> cleanup -> [] -> terminated
    expect(steps).toBe(4)
    expect(state.status).toBe('terminated')
  })
})

// ============================================================================
// Test 6: Scope lifetime verification
// ============================================================================
describe('Baby M0: scope lifetime', () => {
  test('each call creates a fresh scope', () => {
    const source = `PROGRAM T; PROCEDURE F; BEGIN END; BEGIN F; F END.`
    const state = makeState(source)

    // Run to first F call
    let firstScope: Scope | null = null
    for (let i = 0; i < 20 && state.status === 'running'; i++) {
      run(state)
      if (state.currentScope.functionDecl?.name.name === 'F') {
        firstScope = state.currentScope
        break
      }
    }
    expect(firstScope).not.toBeNull()

    // Run until we leave F scope (back to global)
    for (let i = 0; i < 20 && state.status === 'running'; i++) {
      run(state)
      if (state.currentScope === state.globalScope) break
    }
    expect(state.currentScope).toBe(state.globalScope)

    // Run to second F call
    let secondScope: Scope | null = null
    for (let i = 0; i < 30 && state.status === 'running'; i++) {
      run(state)
      if (state.currentScope.functionDecl?.name.name === 'F') {
        secondScope = state.currentScope
        break
      }
    }
    expect(secondScope).not.toBeNull()
    expect(secondScope).not.toBe(firstScope)
  })

  test('nested call has different scope than parent', () => {
    const state = makeState(`PROGRAM T;
      PROCEDURE OUTER;
        PROCEDURE INNER;
        BEGIN END;
      BEGIN INNER END;
      BEGIN OUTER END.`)

    // Step to OUTER
    for (let i = 0; i < 20; i++) {
      run(state)
      if (state.currentScope.functionDecl?.name.name === 'OUTER') break
    }
    const outerScope = state.currentScope
    expect(outerScope.functionDecl?.name.name).toBe('OUTER')

    // Step to INNER
    for (let i = 0; i < 20; i++) {
      run(state)
      if (state.currentScope.functionDecl?.name.name === 'INNER') break
    }
    expect(state.currentScope).not.toBe(outerScope)
    expect(state.currentScope.functionDecl?.name.name).toBe('INNER')
  })
})
