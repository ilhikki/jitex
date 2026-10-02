import { suite } from '@jitex/integration'
import { registerTangle } from './tangle/tangle.ts'
import { registerTexCommon } from './tex/common.ts'
import { registerTrip } from './tex/trip.ts'
import { registerPlain } from './tex/plain.ts'
import { registerJitex } from './jitex/jitex.ts'

export default suite('boot-tex', () => {
  const tangleCollect = registerTangle()
  const tripCollect = registerTrip(tangleCollect)
  const texCollect = registerTexCommon(tangleCollect, tripCollect)
  const plainCollect = registerPlain(texCollect, tripCollect)
  registerJitex(texCollect, plainCollect)
})
