import { runJS } from '../src/js-compiler'

const code = `program test; type T = 'A'..'Z'; var c: T; begin c := 'a'; end.`
async function main() {
  try {
    const state = await runJS(code, { debug: { emitJS: true } } as any)
    console.log('status:', state.status)
    console.log('error:', state.error)
  } catch(e) {
    console.log('ERR:', (e as Error).message)
  }
}
main()
