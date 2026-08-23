import { assert, assertEquals, attach, attachText, cache, log, stage, suite } from '@jitex/integration'
import { MemoryRecordFile, MemoryTextFile, PascalFileStore, runJs } from '@jitex/pascal-to-js'
import { runTangleJs, runTanglePascal, transformTangle, validRunTangleResult } from '../tangle/build-tangle.ts'
import { bytesToString, ConsoleFile, readFile, readTextFile } from '../utils.ts'
import { texExtraSyscalls, transformTex } from './build-tex.ts'
function getTripChFile() {
  return ``
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
      const value = state.files.get(key)!
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
