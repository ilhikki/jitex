import { compileToJS } from './src/compiler'
import * as fs from 'fs'

const source = fs.readFileSync('./tests/e2e/resources/tangle-official.pas', 'utf-8')
const js = compileToJS(source, { extensions: ['string'] })
fs.writeFileSync('./temp/tangle-compiled.js', js)
console.log('JS length:', js.length)
console.log('First 1000 chars:')
console.log(js.slice(0, 1000))
