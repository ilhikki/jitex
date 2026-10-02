import { suite } from '@jitex/integration'
import { registerTangle } from './tangle/tangle.ts'
import { registerTexCommon } from './tex/common.ts'
import { registerTrip } from './tex/trip.ts'
import { registerPlain } from './tex/plain.ts'
import { registerJitex } from './jitex/jitex.ts'

export default suite('boot-tex', ({ debug }) => {
  const isDebug = debug === 'true'
  const tangleCollect = registerTangle(isDebug)
  const tripCollect = registerTrip(isDebug, tangleCollect)
  const texCollect = registerTexCommon(isDebug, tangleCollect, tripCollect)
  const plainCollect = registerPlain(texCollect, tripCollect)
  registerJitex(texCollect, plainCollect)
})
