import { parse } from '../src/index'
import { createState, runToCompletion, State } from '../src/interpreter'

const source = `PROGRAM T; VAR R: INTEGER; FUNCTION F: INTEGER; BEGIN F := 42 END; BEGIN R := F END.`
const result = parse(source)
if (!result.success) {
  console.error(`Parse failed: ${result.error}`)
  process.exit(1)
}

const state = createState(result.astNode)
console.log('Initial:')
console.log('  R =', state.globalScope.variables.get('R'))

let step = 0
while (state.status === 'running' && step < 30) {
  console.log(`\n--- Step ${step} ---`)
  console.log('  stack kinds:', state.stack.map((f: any) => f.kind))
  console.log('  R =', state.globalScope.variables.get('R'))
  console.log('  returnValue =', state.returnValue)

  runToCompletion(state)
  step++
}

console.log(`\nFinal:`)
console.log('  R =', state.globalScope.variables.get('R'))
console.log('  returnValue =', state.returnValue)
