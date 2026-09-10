import { assert, assertEquals, attach, attachText, cache, log, stage, type Suite, suite } from '@jitex/integration'
import { MemoryRecordFile, MemoryTextFile, PascalFileStore, runJs } from '@jitex/pascal-to-js'
import { runTangleJs, runTanglePascal, transformTangle, validRunTangleResult } from '../tangle/build-tangle.ts'
import { bytesToString, ConsoleFile, getTripChFile, readFile, readTextFile } from '../utils.ts'
import { texExtraSyscalls, transformTex } from './build-tex.ts'

// ------------------------------------------------------------
// 辅助函数：运行 trip tex（pass1 / pass2 共享）
// ------------------------------------------------------------

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

function readTextFromState(
  state: ReturnType<typeof runJs>,
  key: string,
): string | undefined {
  const value = state.files.get(key)
  if (value === undefined) {
    return undefined
  }
  return bytesToString((value as MemoryTextFile).getData())
}

function readBytesFromState(
  state: ReturnType<typeof runJs>,
  key: string,
): Uint8Array | undefined {
  const value = state.files.get(key)
  if (value === undefined) {
    return undefined
  }
  return (value as MemoryTextFile).getData()
}

// ------------------------------------------------------------
// suite
// ------------------------------------------------------------

/** boot-tex 流水线选项 */
export interface BootTexOptions {
  /** syscall 内联开关（透传给 transform 的 inlineSyscalls） */
  inlineSyscalls?: boolean | string[]
}

/**
 * 构建 boot tex 流水线。
 *
 * 作为黑盒入口：调用方只需提供「是否内联」开关，其余阶段由本 suite 内部编排，
 * 各阶段耗时由 runner 记录在 RunReport.stages[].duration 中。
 */
export function createBootTexSuite(options: BootTexOptions = { inlineSyscalls: true }): Suite {
  return suite('boot tex', () => {
    // ---- 阶段 A：构建 TeX（trip 版本）----
    const inline = true;
    const tangleJsStage = cache(stage('build tangle.js', [], async () => {
      const tanglePas = await readTextFile('./resources/jitex/tangle.pas')
      const tangleWeb = await readTextFile('./resources/kunth/tangle/tangle.web')
      const tangleV1 = runTanglePascal({
        tangleContent: tanglePas,
        webContent: tangleWeb,
      }, inline)
      const tangleV2 = runTanglePascal({
        tangleContent: tangleV1.pasFile,
        webContent: tangleWeb,
      }, inline)
      const tangleJs = transformTangle(tangleV2.pasFile, inline)
      attachText('tangle.js', tangleJs)
      return { tangleJs }
    }))

    const tripPasStage = cache(stage('tangle tex.web => tex.trip', [tangleJsStage], async ([{ tangleJs }]) => {
      const texWeb = await readTextFile('./resources/kunth/tex/tex.web')
      const chFileContent = getTripChFile()
      const result = validRunTangleResult(runTangleJs(tangleJs, texWeb, chFileContent))
      attachText('tex.trip.web', result.pasFile)
      attach('tex.trip.pool', result.poolFile)
      return { pasFile: result.pasFile, poolFile: result.poolFile }
    }))

    const tripTexJsStage = cache(stage('compile tex.trip.pas => tex.trip.js', [tripPasStage], ([{ pasFile }]) => {
      const texTripJs = transformTex(pasFile, inline)
      attachText('tex.trip.js', texTripJs)
      return { texTripJs }
    }))

    // ---- 阶段 B：准备测试资源 ----

    const tripSourcesStage = cache(stage('load trip sources', [], async () => {
      const tripTex = await readFile('./resources/kunth/tex/trip.tex')
      const tripTfm = await readFile('./resources/kunth/tex/trip.tfm')
      const tripinLog = await readTextFile('./resources/kunth/tex/tripin.log')
      const tripLog = await readTextFile('./resources/kunth/tex/trip.log')
      const tripDvi = await readFile('./resources/kunth/tex/trip.dvi')
      const triposTex = await readTextFile('./resources/kunth/tex/tripos.tex')
      const tripFot = await readTextFile('./resources/kunth/tex/trip.fot')
      attach('trip.tex', tripTex)
      attach('trip.tfm', tripTfm)
      attachText('tripin.log', tripinLog)
      return { tripTex, tripTfm, tripinLog, tripLog, tripDvi, triposTex, tripFot }
    }))

    // ---- 阶段 C：pass 1 — INITEX dump ----

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
            log(`error ${JSON.stringify(state.error, null, 2)}`)
          }
        }

        const tripFmt = state.files.get('trip.fmt') as MemoryRecordFile | undefined
        if (tripFmt !== undefined) {
          attachText('trip.fmt.json', JSON.stringify(tripFmt.getRecords(), null, 2))
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

    // ---- 阶段 D：pass 2 — load fmt + run ----

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
          log(`error ${JSON.stringify(state.error, null, 2)}`)
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
          { tripLog, tripDvi, triposTex, terminalTex, consoleOutput, status },
          { tripLog: masterTripLog, tripDvi: masterTripDvi, triposTex: masterTriposTex, tripFot },
        ],
      ) => {
        log(`[pass2 verify] assert status === 'terminated', actual = ${JSON.stringify(status)}`)
        assertEquals(status, 'terminated')

        // trip.dvi 字节级比较
        log(`[pass2 verify] assert trip.dvi exists, tripDvi defined = ${tripDvi !== undefined}`)
        assert(tripDvi !== undefined, 'trip.dvi not found')
        log(
          `[pass2 verify] assert trip.dvi length match, actual = ${tripDvi.length}, expected = ${masterTripDvi.length}`,
        )
        assertEquals(
          tripDvi.length,
          masterTripDvi.length,
          `trip.dvi length mismatch expect ${masterTripDvi.length} actual ${tripDvi.length}`,
        )
        let divMismatchCount = 0
        const maxLength = Math.max(tripDvi.length, masterTripDvi.length)
        for (let i = 0; i < maxLength; i++) {
          if (tripDvi[i] !== masterTripDvi[i]) {
            divMismatchCount++
          }
        }
        log(`[pass2 verify] assert trip.dvi bytes match, mismatch count = ${divMismatchCount}`)
        assert(divMismatchCount === 0, `mismatch ${divMismatchCount}`)

        // tripos.tex 直接比较
        log(
          `[pass2 verify] assert tripos.tex match, actual length = ${
            triposTex?.length ?? 'undefined'
          }, expected length = ${masterTriposTex.length}`,
        )
        assertEquals(triposTex, masterTriposTex, 'tripos.tex mismatch')

        // 8terminal.tex 应为空
        log(`[pass2 verify] assert 8terminal.tex exists, terminalTex defined = ${terminalTex !== undefined}`)
        assert(terminalTex !== undefined, '8terminal.tex not found')
        log(`[pass2 verify] assert 8terminal.tex empty, actual length = ${terminalTex.length}`)
        assertEquals(terminalTex.length, 0, '8terminal.tex should be empty')

        // trip.log 比较：tripman Step 5 允许若干例外（日期、glue set、accent kern、
        // 容量值、help messages、strings 总数/长度、内存统计）。
        // 第一版先做严格断言，暴露差异后再做归一化。
        log(
          `[pass2 verify] assert trip.log match, actual length = ${
            tripLog?.length ?? 'undefined'
          }, expected length = ${masterTripLog.length}`,
        )
        assertEquals(tripLog, masterTripLog, 'trip.log mismatch (may need normalization per tripman Step 5)')
        // 终端输出 == trip.fot
        log(
          `[pass2 verify] assert console output === trip.fot, actual length = ${consoleOutput.length}, expected length = ${tripFot.length}`,
        )
        assertEquals(consoleOutput, tripFot, 'terminal output should equal trip.fot')
      },
    )
  })
}

export default createBootTexSuite()
