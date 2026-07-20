import { compileToJS, runJS } from '../src/js-compiler'
import * as fs from 'fs'

const code = `program test;
type Point = record x, y: integer end;
var arr: array[1..2] of array[1..2] of Point;
begin
  arr[1,1].x := 1;
  writeln(arr[1,1].x);
end.`

async function main() {
  try {
    console.log('Compiling...')
    const body = compileToJS(code)
    console.log('Compiled successfully')
    fs.writeFileSync('debug-out.js', body, 'utf-8')
    console.log('=== Generated JS ===')
    console.log(body)
  } catch (e: any) {
    console.error('Compile error:', e.message)
    console.error(e.stack)
  }
}

main()
