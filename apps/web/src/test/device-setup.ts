import { beforeEach } from 'vitest'

import { setDevice } from './device'

// jsdom reports the host's real core count and no memory, so a capability-gated component
// (`isWeakDevice`) would pass on a 12-core Mac and fail on a CI runner. Every test starts on a
// capable device; one that needs a weak device calls `setDevice` (./device.ts). The node
// environment has no `navigator` to pin.
beforeEach(() => {
  if (typeof navigator !== 'undefined') setDevice()
})
