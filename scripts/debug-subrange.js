const { compileJS } = require('./dist/js-compiler/index.js')
const code = `program test; type T = 'A'..'Z'; var c: T; begin c := 'a'; end.`
try {
  const r = compileJS(code, { emitJS: true })
  console.log(r.jsCode)
} catch(e) {
  console.log('ERR:', e.message)
}
