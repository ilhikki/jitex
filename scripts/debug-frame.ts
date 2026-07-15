import { parse } from '../src/index'
import { createStatementFrame } from '../src/interpreter/frames'

const source = `PROGRAM T; VAR X: INTEGER; BEGIN X := 42 END.`
const result = parse(source)

if (!result.success) {
  console.error(`Parse failed: ${result.error}`)
  process.exit(1)
}

const program = result.astNode
const stmt = program.block.compound.statements[0]
console.log('Statement:', JSON.stringify(stmt, null, 2))

const frame = createStatementFrame(stmt)
console.log('\nFrame:', JSON.stringify(frame, null, 2))
