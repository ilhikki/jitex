import { parse } from '../src/index'
import { createState, run, State } from '../src/interpreter'
import { createStatementFrame } from '../src/interpreter/frames'

const source = `PROGRAM T; VAR X: INTEGER; BEGIN X := 42 END.`
const result = parse(source)
if (!result.success) {
  console.error(`Parse failed: ${result.error}`)
  process.exit(1)
}

const state = createState(result.astNode)
console.log('Initial state:')
console.log('  stack:', state.stack.length)
console.log('  X =', state.globalScope.variables.get('X'))

let step = 0
while (state.status === 'running' && step < 20) {
  console.log(`\n--- Step ${step} ---`)
  console.log('  stack kinds:', state.stack.map((f: any) => f.kind))
  console.log('  X =', state.globalScope.variables.get('X'))

  run(state)
  step++
}

console.log(`\nFinal state after ${step} steps:`)
console.log('  status:', state.status)
console.log('  X =', state.globalScope.variables.get('X'))
