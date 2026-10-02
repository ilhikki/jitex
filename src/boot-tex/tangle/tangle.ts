import { assertIs, attachText, type Stage, stage } from '@jitex/integration'
import { createTangleStage, type TangleInput, type TangleOutput, transformTangle } from './build-tangle.ts'
import { readTextFile } from '../utils.ts'

function makeLoadSourceStage(): Stage<{ tanglePas: string; tangleWeb: string }> {
  return stage('tangle: load source').nodeps(async () => {
    const tanglePas = await readTextFile('./resources/jitex/tangle.pas')
    const tangleWeb = await readTextFile('./resources/knuth/tangle/tangle.web')
    attachText('tangle-v0.pas', tanglePas)
    attachText('tangle.web', tangleWeb)
    return { tanglePas, tangleWeb }
  })
}

function makeV0ToV1Stage(
  loadSource: Stage<{ tanglePas: string; tangleWeb: string }>,
): Stage<TangleOutput> {
  return createTangleStage(
    'tangle: v0 => v1',
    [loadSource],
    ([src]): TangleInput => ({
      tangleContent: src.tanglePas,
      webContent: src.tangleWeb,
      debug: false,
    }),
  )
}

function makeV1ToV2Stage(
  loadSource: Stage<{ tanglePas: string; tangleWeb: string }>,
  v0ToV1: Stage<TangleOutput>,
): Stage<TangleOutput> {
  return createTangleStage(
    'tangle: v1 => v2',
    [loadSource, v0ToV1],
    ([src, v1]): TangleInput => ({
      tangleContent: v1.pasFile,
      webContent: src.tangleWeb,
      debug: false,
    }),
  )
}

function makeV2ToV3Stage(
  loadSource: Stage<{ tanglePas: string; tangleWeb: string }>,
  v1ToV2: Stage<TangleOutput>,
): Stage<TangleOutput> {
  return createTangleStage(
    'tangle: v2 => v3',
    [loadSource, v1ToV2],
    ([src, v2]): TangleInput => ({
      tangleContent: v2.pasFile,
      webContent: src.tangleWeb,
      debug: false,
    }),
  )
}

function makeValidStage(
  v1ToV2: Stage<TangleOutput>,
  v2ToV3: Stage<TangleOutput>,
): Stage<void> {
  return stage('tangle: valid v2 === v3').deps([v1ToV2, v2ToV3], (v2, v3) => {
    assertIs(v2.pasFile, v3.pasFile)
  })
}

function makeBuildTangleJsStage(
  v1ToV2: Stage<TangleOutput>,
  valid: Stage<void>,
): Stage<{ tangleJs: string }> {
  return stage('tangle: build tangle.js').deps([v1ToV2, valid], (v2) => {
    const tangleJs = transformTangle(v2.pasFile, false)
    attachText('tangle.js', tangleJs)
    return { tangleJs }
  })
}

function makeCollectStage(buildTangleJs: Stage<{ tangleJs: string }>): Stage<{ tangleJs: string }> {
  return stage('tangle: collect').dep(buildTangleJs, (result) => result)
}

export function registerTangle(): Stage<{ tangleJs: string }> {
  const loadSource = makeLoadSourceStage()
  const v0ToV1 = makeV0ToV1Stage(loadSource)
  const v1ToV2 = makeV1ToV2Stage(loadSource, v0ToV1)
  const v2ToV3 = makeV2ToV3Stage(loadSource, v1ToV2)
  const valid = makeValidStage(v1ToV2, v2ToV3)
  const buildTangleJs = makeBuildTangleJsStage(v1ToV2, valid)
  return makeCollectStage(buildTangleJs)
}
