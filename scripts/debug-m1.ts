import { parse } from '../src/index'
import { createState, runToCompletion, State } from '../src/interpreter'

const source = `PROGRAM T; VAR X: INTEGER; BEGIN X := 42 END.`
const result = parse(source)
if (!result.success) {
  console.error(`Parse failed: ${result.error}`)
  process.exit(1)
}

const state = createState(result.astNode)
console.log('Before running:')
console.log('currentScope:', state.currentScope === state.globalScope ? 'global' : 'local')
console.log('globalScope variables:', Array.from(state.globalScope.variables.entries()))

runToCompletion(state)

console.log('\nAfter running:')
console.log('status:', state.status)
console.log('currentScope:', state.currentScope === state.globalScope ? 'global' : 'local')
console.log('globalScope variables:', Array.from(state.globalScope.variables.entries()))

function getVar(state: State, name: string): any {
  const upper = name.toUpperCase()
  let s: any = state.currentScope
  while (s) {
    console.log(`Checking scope:`, s === state.globalScope ? 'global' : 'local', 'has var:', s.variables.has(upper))
    if (s.variables.has(upper)) {
      return s.variables.get(upper)
    }
    s = s.parent
  }
  return undefined
}

console.log('\nLooking up X:')
const x = getVar(state, 'X')
console.log('X =', x)
