import { assert, assertEquals, attach, attachText, cache, log, stage, type Suite, suite } from '@jitex/integration'
import { createMemoryFileStore, runJs } from '@jitex/runtime'
import type { PascalFileStore } from '@jitex/runtime'
import { ConsoleFile, texFontKey, texFormatKey, texRuntimeSyscalls } from '@jitex/tex-runtime'
import { runTangleJs, validRunTangleResult } from '../tangle/build-tangle.ts'
import { getTripChFile, readBytesFromState, readFile, readTextFile, readTextFromState } from '../utils.ts'
import { createTexStages } from './stages.ts'
import { transformTex } from './build-tex.ts'

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

// suite

/**
 * Black-box entry: callers only supply the "inline" switch; the rest of the
 * stages are orchestrated internally by this suite.
 *
 * Stage durations are recorded by the runner in RunReport.stages[].duration.
 */
export function createBootTexSuite(): Suite {
  return suite('boot tex', ({ debug }) => {
    const isDebug = debug === 'true'
    log(`debug = ${isDebug}`)

    const { tangleJsStage } = createTexStages(isDebug)

    const tripPasStage = cache(stage('tangle tex.web => tex.trip', [tangleJsStage], async ([{ tangleJs }]) => {
      const texWeb = await readTextFile('./resources/knuth/tex/tex.web')
      const chFileContent = await getTripChFile()
      const result = validRunTangleResult(await runTangleJs(tangleJs, texWeb, chFileContent))
      attachText('tex.trip.web', result.pasFile)
      attach('tex.trip.pool', result.poolFile)
      return { pasFile: result.pasFile, poolFile: result.poolFile }
    }))

    const tripTexJsStage = cache(stage('compile tex.trip.pas => tex.trip.js', [tripPasStage], ([{ pasFile }]) => {
      const texTripJs = transformTex(pasFile, isDebug)
      attachText('tex.trip.js', texTripJs)
      return { texTripJs }
    }))

    const tripSourcesStage = cache(stage('load trip sources', [], async () => {
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
    }))

    const pass1RunStage = stage(
      'trip pass 1: run initex',
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

        return { tripFmt, tripLog, consoleOutput, status: state.status, error: state.error }
      },
    )

    stage('trip pass 1: verify', [pass1RunStage, tripSourcesStage], ([{ tripFmt, tripLog, status }, { tripinLog }]) => {
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

    const pass2RunStage = stage('trip pass 2: run with fmt', [
      tripTexJsStage,
      tripPasStage,
      tripSourcesStage,
      pass1RunStage,
    ], async ([{ texTripJs }, { poolFile }, { tripTex, tripTfm }, { tripFmt }]) => {
      assert(tripFmt !== undefined, 'trip.fmt from pass 1 is required')

      const extraFiles = new Map<string, PascalFileStore>()
      extraFiles.set('trip.fmt', tripFmt)
      extraFiles.set('TeXformats:trip.fmt', tripFmt)

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
    })

    stage(
      'trip pass 2: verify',
      [pass2RunStage, tripSourcesStage],
      (
        [
          actual,
          expect,
        ],
      ) => {
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

        // trip.log comparison: tripman Step 5 allows several exceptions (date,
        // glue set, accent kern, capacity values, help messages, string
        // count/length, memory stats). The first pass uses strict assertion;
        // normalization will be added after differences are exposed.
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
  })
}

export default createBootTexSuite()
