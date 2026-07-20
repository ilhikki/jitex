import { compileToJS } from '../src/js-compiler'
import { parse } from '../src/parser'
import { StaticAnalyzer } from '../src/static-analyzer'
import { loadBuiltins } from '../src/types'

const code = `program test;
type Point = record x, y: integer end;
var arr: array[1..2] of array[1..2] of Point;
begin
  arr[1,1].x := 1;
  writeln(arr[1,1].x);
end.`

async function main() {
  try {
    const ast = parse(code)
    const { typeTable } = loadBuiltins()
    const sa = new StaticAnalyzer(typeTable)
    sa.analyze(ast)
    
    // 打印所有类型
    console.log('Types in typeTable:')
    for (const [key, val] of Array.from((typeTable as any).entries())) {
      console.log(`  ${key}: kind=${(val as any).kind}`)
      if ((val as any).kind === 'array') {
        console.log(`    dimensions:`, JSON.stringify((val as any).dimensions))
        console.log(`    elementTypeId:`, (val as any).elementTypeId)
      }
      if ((val as any).kind === 'record') {
        console.log(`    fields:`, (val as any).fields.map((f: any) => `${f.name}:${f.typeId}`))
      }
    }
  } catch (e: any) {
    console.error('Error:', e.message)
    console.error(e.stack)
  }
}

main()
