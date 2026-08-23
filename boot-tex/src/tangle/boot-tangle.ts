import { assertEquals, attachText, cache, stage, suite } from '@jitex/integration'
import { createTangleStage, TangleInput, transformTangle } from './build-tangle.ts'
import { readTextFile } from '../utils.ts'

const tangleBootstrapSuite = suite('TANGLE Bootstrap', () => {
  const stageLoadTangleSource = cache(
    stage('load tangle source', [], async () => {
      const tanglePas = await readTextFile('./resources/jitex/tangle.pas')
      const tangleWeb = await readTextFile('./resources/kunth/tangle/tangle.web')
      attachText('tangle-v0.pas', tanglePas)
      attachText('tangle.web', tangleWeb)
      return { tanglePas, tangleWeb }
    }),
  )

  const getTangleV1 = createTangleStage(
    'tangleV0 => tangleV1',
    [stageLoadTangleSource],
    ([tangleSource]): TangleInput => {
      return { tangleContent: tangleSource.tanglePas, webContent: tangleSource.tangleWeb }
    },
  )
  const getTangleV2 = createTangleStage(
    'tangleV1 => tangleV2',
    [stageLoadTangleSource, getTangleV1],
    ([src, tangleOutput]) => {
      return { tangleContent: tangleOutput.pasFile, webContent: src.tangleWeb }
    },
  )
  const getTangleV3 = createTangleStage(
    'tangleV2 => tangleV3',
    [stageLoadTangleSource, getTangleV2],
    ([src, tangleOutput]) => {
      return { tangleContent: tangleOutput.pasFile, webContent: src.tangleWeb }
    },
  )

  const valid = stage('valid tangle-v2.pas === tangle-v3.pas', [getTangleV2, getTangleV3], (result) => {
    assertEquals(result[0].pasFile, result[1].pasFile)
  })

  stage('storeJs', [getTangleV2, valid], (results) => {
    const tangleJs = transformTangle(results[0].pasFile)
    attachText('tangle.js', tangleJs)
  })
})
export default tangleBootstrapSuite
