import { assert, assertEquals, attach, attachText, cache, log, stage, suite } from '@jitex/integration'
import { MemoryRecordFile, MemoryTextFile, PascalFileStore, runJs } from '@jitex/pascal-to-js'
import { runTangleJs, runTanglePascal, transformTangle, validRunTangleResult } from '../tangle/build-tangle.ts'
import { bytesToString, ConsoleFile, readFile, readTextFile } from '../utils.ts'
import { texExtraSyscalls, transformTex } from './build-tex.ts'
function getTripChFile() {
  return `% tex.trip.ch — TRIP 测试专用 WEB change file（tripman.tex Appendix A step 2）
%
% 按 tripman.tex step 2 "Prepare a special version of INITEX" 要求：
%   1. init/tini 宏改为 null（启用 INITEX 模式的全部初始化代码）
%   2. stat/tats 宏改为 @t@>（启用统计代码：var_used/dyn_used 跟踪等）
%   3. mem_min/mem_bot: 0 → 1, mem_top/mem_max: 30000 → 3000
%   4. error_line: 72 → 64, half_error_line: 42 → 32, max_print_line: 79 → 72
%      （这些参数影响 show_context 截断/缩进、print 行宽、内存统计数字）
%
% @x 块按 tex.web 行号递增排列（TANGLE 单调扫描，不可逆序）。
% @x 后的旧行必须与 tex.web 中的行字节级匹配（不含行尾符）。

@x
@d stat==@{ {change this to \`$\\\\{stat}\\equiv\\null$' when gathering
  usage statistics}
@d tats==@t@>@} {change this to \`$\\\\{tats}\\equiv\\null$' when gathering
  usage statistics}
@y
@d stat==@t@>
@d tats==@t@>
@z

@x
@d init== {change this to \`$\\\\{init}\\equiv\\.{@@\\{}$' in the production version}
@d tini== {change this to \`$\\\\{tini}\\equiv\\.{@@\\}}$' in the production version}
@y
@d init==
@d tini==
@z

@x
@!mem_max=30000; {greatest index in \\TeX's internal |mem| array;
@y
@!mem_max=3000; {greatest index in \\TeX's internal |mem| array;
@z

@x
@!mem_min=0; {smallest index in \\TeX's internal |mem| array;
@y
@!mem_min=1; {smallest index in \\TeX's internal |mem| array;
@z

@x
@!error_line=72; {width of context lines on terminal error messages}
@y
@!error_line=64; {width of context lines on terminal error messages}
@z

@x
@!half_error_line=42; {width of first lines of contexts in terminal
  error messages; should be between 30 and |error_line-15|}
@y
@!half_error_line=32; {width of first lines of contexts in terminal
  error messages; should be between 30 and |error_line-15|}
@z

@x
@!max_print_line=79; {width of longest text lines output; should be at least 60}
@y
@!max_print_line=72; {width of longest text lines output; should be at least 60}
@z

@x
@d mem_bot=0 {smallest index in the |mem| array dumped by \\.{INITEX};
@y
@d mem_bot=1 {smallest index in the |mem| array dumped by \\.{INITEX};
@z

@x
@d mem_top==30000 {largest index in the |mem| array dumped by \\.{INITEX};
@y
@d mem_top==3000 {largest index in the |mem| array dumped by \\.{INITEX};
@z
`
}
export default suite('boot tex', () => {
  const getTangle = stage('tangle.js', [], async () => {
    const tanglePas = await readTextFile('./resources/jitex/tangle.pas')
    const tangleWeb = await readTextFile('./resources/kunth/tangle/tangle.web')
    const tangleV1 = runTanglePascal({
      tangleContent: tanglePas,
      webContent: tangleWeb,
    })
    const tangleV2 = runTanglePascal({
      tangleContent: tangleV1.pasFile,
      webContent: tangleWeb,
    })
    const jsCode = transformTangle(tangleV2.pasFile)
    attachText('tangle.js', jsCode)
    return jsCode
  })

  const getTripPas = cache(stage('tex.web => tex.trip.pas', [getTangle], async ([tangleJs]) => {
    const texWeb = await readTextFile('./resources/kunth/tex/tex.web')
    const chFileContent = getTripChFile()
    const runTangleResult = validRunTangleResult(runTangleJs(tangleJs, texWeb, chFileContent))
    attachText('tex.trip.web', runTangleResult.pasFile)
    attach('tex.trip.pool', runTangleResult.poolFile)
    return runTangleResult
  }))

  const buildTripTexJs = cache(stage('tex.trip.pas => tex.trip.js', [getTripPas], ([getTripPasResult]) => {
    const texPas = getTripPasResult.pasFile
    const texTripJs = transformTex(texPas)
    attachText('tex.trip.js', texTripJs)
    return { texTripJs }
  }))

  const getTripSources = cache(stage('get trip sources', [], async () => {
    const tripTex = await readFile('./resources/kunth/tex/trip.tex')
    const tripTfm = await readFile('./resources/kunth/tex/trip.tfm')
    const tripInLog = await readTextFile('./resources/kunth/tex/tripin.log')
    attach('trip.tex', tripTex)
    attach('trip.tfm', tripTfm)
    attach('tripin.log', tripTfm)
    return { tripTex, tripTfm, tripInLog }
  }))

  stage('run trip pass 1', [buildTripTexJs, getTripPas, getTripSources], (result) => {
    const tripJs = result[0].texTripJs
    const poolFile = result[1].poolFile
    const tripTex = result[2].tripTex
    const srcTripTfm = result[2].tripTfm
    const tripInLog = result[2].tripInLog

    const files = new Map<string, PascalFileStore>()
    files.set('trip.tex', new MemoryTextFile(tripTex))
    files.set('TeXformats:TEX.POOL', new MemoryTextFile(poolFile))
    files.set('TeXfonts:trip.tfm', new MemoryTextFile(srcTripTfm))
    const consoleFile = new ConsoleFile('\\input trip\n')
    files.set('TTY:', consoleFile)
    const state = runJs(tripJs, {
      files: files,
      extraSyscalls: texExtraSyscalls,
    })
    let tripLog: string | undefined = undefined
    for (const key of ['trip.tex', 'TeXformats:TEX.POOL', 'TeXfonts:trip.tfm', 'trip.log']) {
      const value = state.files.get(key)
      if (value === undefined) {
        log(`miss file ${key}`)
        continue
      }
      const textFile = value as MemoryTextFile
      const data = textFile.getData()
      if ('trip.log' === name) {
        tripLog = bytesToString(data)
      }
      log(`fileName = ${key} length = ${data.length}`)
      attach(key.replaceAll(':', '.').replaceAll(' ', ''), data)
    }

    const consoleOutput = consoleFile.getOutput()
    log(`fileName = consoleOutput.log length = ${consoleOutput.length}`)
    attachText('consoleOutput.log', consoleOutput)
    attachText('debug.log', state.debugLog.join('\n'))
    if (state.error) {
      if (state.error instanceof Error) {
        log(`error: ${state.error.message}\n${state.error.stack}`)
      } else {
        log(`error ${JSON.stringify(state.error, null, 2)}`)
      }
    }
    const tripTfm = state.files.get('trip.fmt')
    if (tripTfm !== undefined) {
      const store = tripTfm as MemoryRecordFile
      const records = store.getRecords()
      attachText('trip.fmt.json', JSON.stringify(records, null, 2))
    }
    log('all files = ' + [...state.files.keys()].join(', '))
    assertEquals(state.status, 'terminated')
    assert(tripTfm !== undefined, 'trip.tfm not fount')
    assertEquals(tripLog, tripInLog, 'output should equals with tripin.log')
  })
})
