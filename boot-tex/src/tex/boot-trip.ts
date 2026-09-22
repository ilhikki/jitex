import { assert, assertEquals, attach, attachText, cache, log, stage, type Suite, suite } from '@jitex/integration'
import { MemoryTextFile, PascalFileStore, runJs } from '@jitex/pascal-to-js'
import { runTangleJs, validRunTangleResult } from '../tangle/build-tangle.ts'
import { ConsoleFile, getTripChFile, readBytesFromState, readFile, readTextFile, readTextFromState } from '../utils.ts'
import { createStageOfGetTangleJs, texExtraSyscalls, transformTex } from './build-tex.ts'

interface RunTripTexArgs {
  tripJs: string
  poolFile: Uint8Array
  tripTex: Uint8Array
  tripTfm: Uint8Array
  ttyInput: string
  extraFiles?: Map<string, PascalFileStore>
}

function runTripTex(args: RunTripTexArgs) {
  const files = new Map<string, PascalFileStore>()
  files.set('trip.tex', new MemoryTextFile(args.tripTex))
  files.set('TeXformats:TEX.POOL', new MemoryTextFile(args.poolFile))
  files.set('TeXfonts:trip.tfm', new MemoryTextFile(args.tripTfm))
  if (args.extraFiles) {
    for (const [key, value] of args.extraFiles) {
      files.set(key, value)
    }
  }
  const consoleFile = new ConsoleFile(args.ttyInput)
  files.set('TTY:', consoleFile)
  const state = runJs(args.tripJs, {
    files,
    extraSyscalls: texExtraSyscalls,
  })
  return { state, consoleFile }
}

// suite

/**
 * 构建 boot tex 流水线。
 *
 * 作为黑盒入口：调用方只需提供「是否内联」开关，其余阶段由本 suite 内部编排，
 * 各阶段耗时由 runner 记录在 RunReport.stages[].duration 中。
 */
export function createBootTexSuite(): Suite {
  return suite('boot tex', ({ debug }) => {
    const isDebug = debug === 'true'
    log(`debug = ${isDebug}`)

    const tangleJsStage = cache(createStageOfGetTangleJs(isDebug))

    const tripPasStage = cache(stage('tangle tex.web => tex.trip', [tangleJsStage], async ([{ tangleJs }]) => {
      const texWeb = await readTextFile('./resources/knuth/tex/tex.web')
      const chFileContent = await getTripChFile()
      const result = validRunTangleResult(runTangleJs(tangleJs, texWeb, chFileContent))
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
      ([{ texTripJs }, { poolFile }, { tripTex, tripTfm }]) => {
        const { state, consoleFile } = runTripTex({
          tripJs: texTripJs,
          poolFile,
          tripTex,
          tripTfm,
          ttyInput: '\\input trip\n',
        })

        log(`state.steps = ${state.steps}`)
        log('all files = ' + [...state.files.keys()].join(', '))

        // attach 调试产物（仅 MemoryTextFile 类型）
        for (const [key, value] of state.files) {
          if (!(value instanceof MemoryTextFile)) {
            continue
          }
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

        const tripFmt = state.files.get('trip.fmt') as MemoryTextFile | undefined
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
    ], ([{ texTripJs }, { poolFile }, { tripTex, tripTfm }, { tripFmt }]) => {
      assert(tripFmt !== undefined, 'trip.fmt from pass 1 is required')

      const extraFiles = new Map<string, PascalFileStore>()
      extraFiles.set('trip.fmt', tripFmt)
      extraFiles.set('TeXformats:trip.fmt', tripFmt)

      const { state, consoleFile } = runTripTex({
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
        if (!(value instanceof MemoryTextFile)) {
          continue
        }
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

        // trip.dvi 字节级比较
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

        // tripos.tex 直接比较
        log(
          `[pass2 verify] assert tripos.tex match, actual length = ${
            actual.triposTex?.length ?? 'undefined'
          }, expected length = ${expect.triposTex.length}`,
        )
        assertEquals(actual.triposTex, expect.triposTex, 'tripos.tex mismatch')

        // 8terminal.tex 应为空
        log(`[pass2 verify] assert 8terminal.tex exists, terminalTex defined = ${actual.terminalTex !== undefined}`)
        assert(actual.terminalTex !== undefined, '8terminal.tex not found')
        log(`[pass2 verify] assert 8terminal.tex empty, actual length = ${actual.terminalTex.length}`)
        assertEquals(actual.terminalTex.length, 0, '8terminal.tex should be empty')

        // trip.log 比较：tripman Step 5 允许若干例外（日期、glue set、accent kern、
        // 容量值、help messages、strings 总数/长度、内存统计）。
        // 第一版先做严格断言，暴露差异后再做归一化。
        log(
          `[pass2 verify] assert trip.log match, actual length = ${
            actual.tripLog?.length ?? 'undefined'
          }, expected length = ${expect.tripLog.length}`,
        )
        assertEquals(actual.tripLog, expect.tripLog, 'trip.log mismatch (may need normalization per tripman Step 5)')
        // 终端输出 == trip.fot
        log(
          `[pass2 verify] assert console output === trip.fot, actual length = ${actual.consoleOutput.length}, expected length = ${expect.tripFot.length}`,
        )
        assertEquals(actual.consoleOutput, expect.tripFot, 'terminal output should equal trip.fot')
      },
    )
  })
}

export default createBootTexSuite()
