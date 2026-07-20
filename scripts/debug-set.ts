import { runJS } from '../src/js-compiler'

const code = `program test;
type T = set of 1..10;
var a, b, c: T;
begin
  a := [1, 2, 3];
  b := [3, 4, 5];
  c := a + b;
  if 1 in c then writeln('1');
  if 5 in c then writeln('5');
end.`

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
  }
}

main()
