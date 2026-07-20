import { runJS } from '../src/js-compiler'
import { runVM } from '../src/vm'

const code = 'program test; var x, y: integer; begin x := 15; y := 3; writeln(x / y); end.'

async function main() {
  console.log('=== JS path ===')
  const jsState = await runJS(code, { maxSteps: 1e9 } as any)
  console.log('output:', JSON.stringify(jsState.outputBuffer.join('')))
  console.log('status:', jsState.status, 'error:', jsState.error?.message)

  console.log('=== VM path ===')
  const vmState = await runVM(code, {})
  console.log('output:', JSON.stringify(vmState.outputBuffer.join('')))
  console.log('status:', vmState.status, 'error:', vmState.error?.message)
}

main()
