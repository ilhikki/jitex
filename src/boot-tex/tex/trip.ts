import { assert, assertEquals, attach, attachText, log, stage, type Stage } from '@jitex/integration'
import { createMemoryFileStore, runJs } from '@jitex/runtime'
import type { PascalFileStore } from '@jitex/runtime'
import { ConsoleFile, texFontKey, texFormatKey, texRuntimeSyscalls } from '@jitex/tex-runtime'
import { runTangleJs, validRunTangleResult } from '../tangle/build-tangle.ts'
import type { TangleOutput } from '../tangle/build-tangle.ts'
import { getTripChFile, readBytesFromState, readFile, readTextFile, readTextFromState } from '../utils.ts'
import { transformTex } from './build-tex.ts'

interface TripSources {
  tripTex: Uint8Array
  tripTfm: Uint8Array
  tripinLog: string
  tripLog: string
  tripDvi: Uint8Array
  triposTex: string
  tripFot: string
}

interface Pass1RunResult {
  tripFmt: Uint8Array | undefined
  tripLog: string | undefined
  consoleOutput: string
  status: string
  error: unknown
}

interface Pass2RunResult {
  tripLog: string | undefined
  tripDvi: Uint8Array | undefined
  triposTex: string | undefined
  terminalTex: Uint8Array | undefined
  consoleOutput: string
  status: string
  error: unknown
}

interface RunTripTexArgs {
  tripJs: string
  poolFile: Uint8Array
  tripTex: Uint8Array
  tripTfm: Uint8Array
  ttyInput: string
  extraFiles?: Map<string, PascalFileStore>
}

async function runTripTex(args: RunTripTexArgs) {
  const files = new Map<string, PascalFileStore>()
  files.set('trip.tex', createMemoryFileStore(args.tripTex))
  files.set(texFormatKey('TEX.POOL'), createMemoryFileStore(args.poolFile))
  files.set(texFontKey('trip.tfm'), createMemoryFileStore(args.tripTfm))
  if (args.extraFiles) {
    for (const [key, value] of args.extraFiles) {
      files.set(key, value)
    }
  }
  const consoleFile = new ConsoleFile(args.ttyInput)
  files.set('TTY:', consoleFile)
  const state = await runJs(args.tripJs, {
    files,
    extraSyscalls: texRuntimeSyscalls(),
  })
  return { state, consoleFile }
}

function makeTripPasStage(
  tangleCollect: Stage<{ tangleJs: string }>,
): Stage<TangleOutput> {
  return stage('trip: tangle tex.web => tex.trip', [tangleCollect], async ([{ tangleJs }]) => {
    const texWeb = await readTextFile('./resources/knuth/tex/tex.web')
    const chFileContent = await getTripChFile()
    const result = validRunTangleResult(await runTangleJs(tangleJs, texWeb, chFileContent))
    attachText('tex.trip.web', result.pasFile)
    attach('tex.trip.pool', result.poolFile)
    return { pasFile: result.pasFile, poolFile: result.poolFile }
  })
}

function makeTripTexJsStage(
  isDebug: boolean,
  tripPasStage: Stage<TangleOutput>,
): Stage<{ texTripJs: string }> {
  return stage('trip: compile tex.trip.js', [tripPasStage], ([{ pasFile }]) => {
    const texTripJs = transformTex(pasFile, isDebug)
    attachText('tex.trip.js', texTripJs)
    return { texTripJs }
  })
}

function makeTripSourcesStage(): Stage<TripSources> {
  return stage('trip: load sources', [], async () => {
    const tripTex = await readFile('./resources/knuth/tex/trip.tex')
    const tripTfm = await readFile('./resources/knuth/tex/trip.tfm')
    const tripinLog = await readTextFile('./resources/knuth/tex/tripin.log')
    const tripLog = await readTextFile('./resources/knuth/tex/trip.log')
    const tripDvi = await readFile('./resources/knuth/tex/trip.dvi')
    const triposTex = await readTextFile('./resources/knuth/tex/tripos.tex')
    const tripFot = await readTextFile('./resources/knuth/tex/trip.fot')
    attach('trip.tex', tripTex)
    attach('trip.tfm', tripTfm)
    attachText('tripin.log', tripinLog)
    return { tripTex, tripTfm, tripinLog, tripLog, tripDvi, triposTex, tripFot }
  })
}

function makePass1RunStage(
  tripTexJsStage: Stage<{ texTripJs: string }>,
  tripPasStage: Stage<TangleOutput>,
  tripSourcesStage: Stage<TripSources>,
): Stage<Pass1RunResult> {
  return stage(
    'trip: pass 1 run',
    [tripTexJsStage, tripPasStage, tripSourcesStage],
    async ([{ texTripJs }, { poolFile }, { tripTex, tripTfm }]) => {
      const { state, consoleFile } = await runTripTex({
        tripJs: texTripJs,
        poolFile,
        tripTex,
        tripTfm,
        ttyInput: '\\input trip\n',
      })

      log(`state.steps = ${state.steps}`)
      log('all files = ' + [...state.files.keys()].join(', '))

      for (const [key, value] of state.files) {
        const data = value.getData()
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
          log(`error ${JSON.stringify(state.error, undefined, 2)}`)
        }
      }

      const tripFmt = state.files.get('trip.fmt')
      if (tripFmt !== undefined) {
        attach('trip.fmt', tripFmt.getData())
      }

      const tripLog = readTextFromState(state, 'trip.log')

      return { tripFmt: tripFmt?.getData(), tripLog, consoleOutput, status: state.status, error: state.error }
    },
  )
}

function makePass1VerifyStage(
  pass1RunStage: Stage<Pass1RunResult>,
  tripSourcesStage: Stage<TripSources>,
): Stage<void> {
  return stage('trip: pass 1 verify', [pass1RunStage, tripSourcesStage], ([{ tripFmt, tripLog, status }, { tripinLog }]) => {
    log(`[pass1 verify] assert status === 'terminated', actual = ${JSON.stringify(status)}`)
    assertEquals(status, 'terminated')
    log(`[pass1 verify] assert trip.fmt exists, tripFmt defined = ${tripFmt !== undefined}`)
    assert(tripFmt !== undefined, 'trip.fmt not found')
    log(
      `[pass1 verify] assert trip.log === tripin.log, tripLog length = ${
        tripLog?.length ?? 'undefined'
      }, tripinLog length = ${tripinLog.length}`,
    )
    assertEquals(tripLog, tripinLog, 'output should equal tripin.log')
  })
}

function makePass2RunStage(
  tripTexJsStage: Stage<{ texTripJs: string }>,
  tripPasStage: Stage<TangleOutput>,
  tripSourcesStage: Stage<TripSources>,
  pass1RunStage: Stage<Pass1RunResult>,
): Stage<Pass2RunResult> {
  return stage(
    'trip: pass 2 run',
    [tripTexJsStage, tripPasStage, tripSourcesStage, pass1RunStage],
    async ([{ texTripJs }, { poolFile }, { tripTex, tripTfm }, { tripFmt }]) => {
      assert(tripFmt !== undefined, 'trip.fmt from pass 1 is required')

      const extraFiles = new Map<string, PascalFileStore>()
      extraFiles.set('trip.fmt', createMemoryFileStore(tripFmt))
      extraFiles.set('TeXformats:trip.fmt', createMemoryFileStore(tripFmt))

      const { state, consoleFile } = await runTripTex({
        tripJs: texTripJs,
        poolFile,
        tripTex,
        tripTfm,
        ttyInput: ' &trip  trip \n',
        extraFiles,
      })

      log(`state.steps = ${state.steps}`)
      log('all files = ' + [...state.files.keys()].join(', '))

      for (const [key, value] of state.files) {
        const data = value.getData()
        log(`fileName = ${key} length = ${data.length}`)
        attach(key.replaceAll(':', '.').replaceAll(' ', ''), data)
      }

      const consoleOutput = consoleFile.getOutput()
      attachText('consoleOutput.pass2.log', consoleOutput)
      attachText('debug.pass2.log', state.debugLog.join('\n'))

      if (state.error) {
        if (state.error instanceof Error) {
          log(`error: ${state.error.message}\n${state.error.stack}`)
        } else {
          log(`error ${JSON.stringify(state.error, undefined, 2)}`)
        }
      }

      const tripLog = readTextFromState(state, 'trip.log')
      const tripDvi = readBytesFromState(state, 'trip.dvi')
      const triposTex = readTextFromState(state, 'tripos.tex')
      const terminalTex = readBytesFromState(state, '8terminal.tex')

      return { tripLog, tripDvi, triposTex, terminalTex, consoleOutput, status: state.status, error: state.error }
    },
  )
}

function makePass2VerifyStage(
  pass2RunStage: Stage<Pass2RunResult>,
  tripSourcesStage: Stage<TripSources>,
): Stage<void> {
  return stage(
    'trip: pass 2 verify',
    [pass2RunStage, tripSourcesStage],
    ([actual, expect]) => {
      log(`[pass2 verify] assert status === 'terminated', actual = ${JSON.stringify(actual.status)}`)
      assertEquals(actual.status, 'terminated')

      log(`[pass2 verify] assert trip.dvi exists, tripDvi defined = ${actual.tripDvi !== undefined}`)
      assert(actual.tripDvi !== undefined, 'trip.dvi not found')
      log(
        `[pass2 verify] assert trip.dvi length match, actual = ${actual.tripDvi.length}, expected = ${expect.tripDvi.length}`,
      )
      assertEquals(
        actual.tripDvi.length,
        expect.tripDvi.length,
        `trip.dvi length mismatch expect ${expect.tripDvi.length} actual ${actual.tripDvi.length}`,
      )
      let divMismatchCount = 0
      const maxLength = Math.max(actual.tripDvi.length, expect.tripDvi.length)
      for (let i = 0; i < maxLength; i++) {
        if (actual.tripDvi[i] !== expect.tripDvi[i]) {
          divMismatchCount++
        }
      }
      log(`[pass2 verify] assert trip.dvi bytes match, mismatch count = ${divMismatchCount}`)
      assert(divMismatchCount === 0, `mismatch ${divMismatchCount}`)

      log(
        `[pass2 verify] assert tripos.tex match, actual length = ${
          actual.triposTex?.length ?? 'undefined'
        }, expected length = ${expect.triposTex.length}`,
      )
      assertEquals(actual.triposTex, expect.triposTex, 'tripos.tex mismatch')

      log(`[pass2 verify] assert 8terminal.tex exists, terminalTex defined = ${actual.terminalTex !== undefined}`)
      assert(actual.terminalTex !== undefined, '8terminal.tex not found')
      log(`[pass2 verify] assert 8terminal.tex empty, actual length = ${actual.terminalTex.length}`)
      assertEquals(actual.terminalTex.length, 0, '8terminal.tex should be empty')

      log(
        `[pass2 verify] assert trip.log match, actual length = ${
          actual.tripLog?.length ?? 'undefined'
        }, expected length = ${expect.tripLog.length}`,
      )
      assertEquals(actual.tripLog, expect.tripLog, 'trip.log mismatch (may need normalization per tripman Step 5)')
      log(
        `[pass2 verify] assert console output === trip.fot, actual length = ${actual.consoleOutput.length}, expected length = ${expect.tripFot.length}`,
      )
      assertEquals(actual.consoleOutput, expect.tripFot, 'terminal output should equal trip.fot')
    },
  )
}

function makeCollectStage(pass2Verify: Stage<void>): Stage<void> {
  return stage('trip: collect', [pass2Verify], () => {})
}

export function registerTrip(isDebug: boolean, tangleCollect: Stage<{ tangleJs: string }>): Stage<void> {
  const tripPasStage = makeTripPasStage(tangleCollect)
  const tripTexJsStage = makeTripTexJsStage(isDebug, tripPasStage)
  const tripSourcesStage = makeTripSourcesStage()
  const pass1RunStage = makePass1RunStage(tripTexJsStage, tripPasStage, tripSourcesStage)
  makePass1VerifyStage(pass1RunStage, tripSourcesStage)
  const pass2RunStage = makePass2RunStage(tripTexJsStage, tripPasStage, tripSourcesStage, pass1RunStage)
  const pass2VerifyStage = makePass2VerifyStage(pass2RunStage, tripSourcesStage)
  return makeCollectStage(pass2VerifyStage)
}
