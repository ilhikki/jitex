import { runVM } from '../src/vm'
import { parse } from '../src/index'
import { StaticAnalyzer } from '../src/static-analyzer'

const code = 'program test; var x, y: integer; begin x := 15; y := 3; writeln(x / y); end.'

async function main() {
  const ast = parse(code)
  const analyzer = new StaticAnalyzer()
  const result = analyzer.analyze(ast as any)
  console.log('=== Generated Instructions ===')
  console.log(JSON.stringify(result.instructions.slice(0, 30), null, 2))
  console.log('...')
  console.log('Total instructions:', result.instructions.length)

  console.log('\n=== VM Output ===')
  const state = await runVM(code, {})
  console.log('output:', JSON.stringify(state.outputBuffer.join('')))
}

main()
