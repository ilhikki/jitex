import * as fs from 'fs'
import * as path from 'path'
import { compileToJS } from './src/index'

const source = fs.readFileSync(
  path.join(__dirname, 'tests', 'e2e', 'resources', 'tangle-official.pas'),
  'utf-8'
)

const tempDir = path.join(__dirname, 'temp')
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir)
}

try {
  const js = compileToJS(source, { extensions: ['string'] })
  fs.writeFileSync(path.join(tempDir, 'tangle.js'), js, 'utf-8')
  console.log('Generated JS saved to:', path.join(tempDir, 'tangle.js'))
  console.log('JS length:', js.length, 'chars')

  // 搜索 goto 相关的代码
  const gotoMatches = js.match(/__goto_loop|__pc|labelCases/g) || []
  console.log('goto-related patterns:', gotoMatches.length)

  // 搜索 DEBUGHELP
  const debugHelpIdx = js.indexOf('function DEBUGHELP')
  if (debugHelpIdx !== -1) {
    const snippet = js.slice(debugHelpIdx, debugHelpIdx + 2000)
    fs.writeFileSync(path.join(tempDir, 'debughelp-snippet.js'), snippet, 'utf-8')
    console.log('DEBUGHELP snippet saved')
  }
} catch (e) {
  console.error('Compile error:', e)
}
