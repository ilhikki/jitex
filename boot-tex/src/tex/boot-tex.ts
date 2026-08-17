import { attach, attachText, cache, log, stage, suite } from '@jitex/integration'
import { runJs, transform } from '@jitex/pascal-to-js'
import { runTangleJs, runTanglePascal, validRunTangleResult } from '../tangle/build-tangle.ts'
import { readFile, readTextFile, stringToBytes } from '../utils.ts'

export default suite('boot tex', () => {
  const getTangle = stage('tangle.js', [], async () => {
    const tanglePas = await readTextFile('./resources/kunth/tangle/tangle-official.pas')
    const tangleWeb = await readTextFile('./resources/kunth/tangle/tangle.web')
    const tangleV1 = runTanglePascal({
      tangleContent: tanglePas,
      webContent: tangleWeb,
    })
    const tangleV2 = runTanglePascal({
      tangleContent: tangleV1.pasFile,
      webContent: tangleWeb,
    })
    const jsCode = transform(tangleV2.pasFile)
    attachText('tangle.js', jsCode)
    return jsCode
  })

  // const getPas = cache(stage('tex.web => tex.pas', [getTangle], async ([tangleJs]) => {
  //   const texWeb = await readTextFile('./resources/kunth/tex/tex.web')
  //   const runTangleResult = validRunTangleResult(runTangleJs(tangleJs, texWeb))
  //   attachText('tex.web', runTangleResult.pasFile)
  //   attach('tex.pool', runTangleResult.poolFile)
  //   return runTangleResult
  // }))

  const getTripPas = cache(stage('tex.web => tex.trip.pas', [getTangle], async ([tangleJs]) => {
    const texWeb = await readTextFile('./resources/kunth/tex/tex.web')
    const chFileContent = await readTextFile('./resources/kunth/trip/tex.trip.ch')
    const runTangleResult = validRunTangleResult(runTangleJs(tangleJs, texWeb, chFileContent))
    attachText('tex.trip.web', runTangleResult.pasFile)
    attach('tex.trip.pool', runTangleResult.poolFile)
    return runTangleResult
  }))

  const buildTripTexJs = cache(stage('tex.trip.pas => tex.trip.js', [getTripPas], ([getTripPasResult]) => {
    const texPas = getTripPasResult.pasFile
    const texTripJs = transform(texPas)
    attachText('tex.trip.js', texTripJs)
    return { texTripJs }
  }))
  const getTripSources = cache(stage('get trip sources', [], async () => {
    const tripTex = await readFile('./resources/kunth/trip/trip.tex')
    const tripTfm = await readFile('./resources/kunth/trip/trip.tfm')
    attach('trip.tex', tripTex)
    attach('trip.tfm', tripTfm)
    return { tripTex, tripTfm }
  }))

  stage('run trip', [buildTripTexJs, getTripPas, getTripSources], (result) => {
    const tripJs = result[0].texTripJs
    const poolFile = result[1].poolFile
    const tripTex = result[2].tripTex
    const tripTfm = result[2].tripTfm

    const files = new Map<string, Uint8Array>()
    files.set('trip.tex', tripTex)
    files.set('TeXformats:TEX.POOL', poolFile)
    files.set('TeXfonts:trip.tfm', tripTfm)
    files.set('TTY:', stringToBytes('trip'))
    const debugLog: string[] = []
    const state = runJs(tripJs, {
      input: ['trip'],
      files: files,
      extensions: ['string', 'fileEofBufferSpace', 'pascalHFileModel'],
      debugLog,
    })

    for (const [key, value] of state.files) {
      log(`fileName = ${key} length = ${value.length}`)
      // attach(key.replaceAll(":", "."), value)
    }
    attachText('output.log', state.outputBuffer.join('\n'))
    attachText('debug.log', debugLog.join('\n'))
  })
})
