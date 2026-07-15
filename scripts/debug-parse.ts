import { parse } from '../src/index'

const source = `PROGRAM T; VAR X: INTEGER; BEGIN X := 42 END.`
const result = parse(source)

if (!result.success) {
  console.error(`Parse failed: ${result.error}`)
  process.exit(1)
}

const program = result.astNode
console.log('Program name:', program.name.name)
console.log('Block statements:', program.block.compound.statements.length)

for (let i = 0; i < program.block.compound.statements.length; i++) {
  const stmt = program.block.compound.statements[i]
  console.log(`Statement ${i}: kind=${stmt.kind}`)
  if (stmt.kind === 'Assignment') {
    const assign = stmt as any
    console.log(`  left: ${assign.left.kind} ${assign.left.name}`)
    console.log(`  right: ${assign.right.kind} ${assign.right.value}`)
  }
}

console.log('\nVariable declarations:', program.block.variableDeclarations.length)
for (const v of program.block.variableDeclarations) {
  console.log(`  ${v.names.map(n => n.name).join(', ')}: ${v.type.kind}`)
}
