import type { State, RunMode } from './types'
import { createProgramFrame } from './frames'

export function run(state: State, _mode: RunMode = 'STEP_INTO'): void {
  if (state.status === 'terminated') return

  // Lazy initialization: push ProgramFrame on first call
  if (state.stack.length === 0) {
    state.stack.push(createProgramFrame(state.program))
    if (state.stepCallback) state.stepCallback(state)
    return
  }

  const frame = state.stack[state.stack.length - 1]
  frame.step(state)

  // Clean up done frames from top
  while (state.stack.length > 0 && state.stack[state.stack.length - 1].done) {
    state.stack.pop()
  }

  // If stack is empty after cleanup, program is done
  if (state.stack.length === 0) {
    state.status = 'terminated'
  }

  // Call step callback if set
  if (state.stepCallback) {
    state.stepCallback(state)
  }
}

export function runToCompletion(state: State, maxSteps: number = 100000): void {
  let steps = 0
  while (state.status === 'running' && steps < maxSteps) {
    run(state)
    steps++
  }
}
