import { runJS } from '../src/js-compiler'

const code = `program test;
type T = set of 1..5;
var s1, s2: T;
begin
  s1 := [1, 2];
  s2 := s1;
  s1 := s1 + [3];
  if 3 in s1 then writeln('s1 has 3');
  if 3 in s2 then writeln('s2 has 3') else writeln('s2 no 3');
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
