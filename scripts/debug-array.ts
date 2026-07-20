import { runJS } from '../src/js-compiler'

const code = 'program test; var arr: array[1..5] of integer; begin arr[1] := 10; writeln(arr[1]); end.'

async function main() {
  try {
    const state = await runJS(code, { debug: { emitJS: true }, maxSteps: 1e9 } as any)
    console.log('output:', JSON.stringify(state.outputBuffer.join('')))
    console.log('status:', state.status, 'error:', state.error?.message)
    if ((state as any).__debugJS) {
      console.log('\n=== Generated JS ===')
      console.log((state as any).__debugJS)
    }
  } catch (e: any) {
    console.error('Exception:', e.message)
    console.error(e.stack)
  }
}

main()
