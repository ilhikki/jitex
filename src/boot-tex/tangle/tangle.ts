import { assertEquals, attachText, stage, type Stage } from '@jitex/integration'
import { createTangleStage, transformTangle, type TangleInput, type TangleOutput } from './build-tangle.ts'
import { readTextFile } from '../utils.ts'

function makeLoadSourceStage(): Stage<{ tanglePas: string; tangleWeb: string }> {
  return stage('tangle: load source', [], async () => {
    const tanglePas = await readTextFile('./resources/jitex/tangle.pas')
    const tangleWeb = await readTextFile('./resources/knuth/tangle/tangle.web')
    attachText('tangle-v0.pas', tanglePas)
    attachText('tangle.web', tangleWeb)
    return { tanglePas, tangleWeb }
  })
}

function makeV0ToV1Stage(
  isDebug: boolean,
  loadSource: Stage<{ tanglePas: string; tangleWeb: string }>,
): Stage<TangleOutput> {
  return createTangleStage(
    'tangle: v0 => v1',
    [loadSource],
    ([src]): TangleInput => ({
      tangleContent: src.tanglePas,
      webContent: src.tangleWeb,
      debug: isDebug,
    }),
  )
}

function makeV1ToV2Stage(
  isDebug: boolean,
  loadSource: Stage<{ tanglePas: string; tangleWeb: string }>,
  v0ToV1: Stage<TangleOutput>,
): Stage<TangleOutput> {
  return createTangleStage(
    'tangle: v1 => v2',
    [loadSource, v0ToV1],
    ([src, v1]): TangleInput => ({
      tangleContent: v1.pasFile,
      webContent: src.tangleWeb,
      debug: isDebug,
    }),
  )
}

function makeV2ToV3Stage(
  isDebug: boolean,
  loadSource: Stage<{ tanglePas: string; tangleWeb: string }>,
  v1ToV2: Stage<TangleOutput>,
): Stage<TangleOutput> {
  return createTangleStage(
    'tangle: v2 => v3',
    [loadSource, v1ToV2],
    ([src, v2]): TangleInput => ({
      tangleContent: v2.pasFile,
      webContent: src.tangleWeb,
      debug: isDebug,
    }),
  )
}

function makeValidStage(
  v1ToV2: Stage<TangleOutput>,
  v2ToV3: Stage<TangleOutput>,
): Stage<void> {
  return stage('tangle: valid v2 === v3', [v1ToV2, v2ToV3], ([v2, v3]) => {
    assertEquals(v2.pasFile, v3.pasFile)
  })
}

function makeBuildTangleJsStage(
  isDebug: boolean,
  v1ToV2: Stage<TangleOutput>,
  valid: Stage<void>,
): Stage<{ tangleJs: string }> {
  return stage('tangle: build tangle.js', [v1ToV2, valid], ([v2]) => {
    const tangleJs = transformTangle(v2.pasFile, isDebug)
    attachText('tangle.js', tangleJs)
    return { tangleJs }
  })
}

function makeCollectStage(buildTangleJs: Stage<{ tangleJs: string }>): Stage<{ tangleJs: string }> {
  return stage('tangle: collect', [buildTangleJs], ([result]) => result)
}

export function registerTangle(isDebug: boolean): Stage<{ tangleJs: string }> {
  const loadSource = makeLoadSourceStage()
  const v0ToV1 = makeV0ToV1Stage(isDebug, loadSource)
  const v1ToV2 = makeV1ToV2Stage(isDebug, loadSource, v0ToV1)
  const v2ToV3 = makeV2ToV3Stage(isDebug, loadSource, v1ToV2)
  const valid = makeValidStage(v1ToV2, v2ToV3)
  const buildTangleJs = makeBuildTangleJsStage(isDebug, v1ToV2, valid)
  return makeCollectStage(buildTangleJs)
}
