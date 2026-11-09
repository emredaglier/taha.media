import { describe, expect, it } from 'vitest'

import {
  handControl,
  handStatus,
  initialHandControl,
  type HandControlEffect,
  type HandControlEvent,
  type HandControlState,
} from './hand-control'

/** Applies `events` in order and returns the last state and every effect, in order. */
const run = (events: readonly HandControlEvent[], from = initialHandControl) => {
  let state = from
  const effects: HandControlEffect[] = []
  for (const event of events) {
    const step = handControl(state, event)
    state = step.state
    effects.push(...step.effects)
  }
  return { state, effects }
}

const kinds = (effects: readonly HandControlEffect[]) => effects.map((e) => e.kind)

/** The events that take Hand control from off to on, for the attempt after `from`'s. */
const turnOn = (from = initialHandControl): HandControlEvent[] => {
  const attempt = from.attempt + 1
  return [
    { kind: 'toggle' },
    { kind: 'accept' },
    { kind: 'cameraGranted', attempt },
    { kind: 'trackerReady', attempt },
  ]
}

const on = run(turnOn()).state

describe('turning Hand control on', () => {
  it('starts off', () => {
    expect(initialHandControl.phase).toBe('off')
  })

  it('opens the consent note on the first press, without asking for the camera', () => {
    const { state, effects } = run([{ kind: 'toggle' }])
    expect(state.phase).toBe('consenting')
    expect(kinds(effects)).not.toContain('requestCamera')
  })

  it('asks the browser for the camera only after Aç', () => {
    const { state, effects } = run([{ kind: 'toggle' }, { kind: 'accept' }])
    expect(state.phase).toBe('asking')
    expect(effects).toEqual([{ kind: 'requestCamera', attempt: state.attempt }])
  })

  it('loads the tracking files once the camera is on, then tracks', () => {
    const asking = run([{ kind: 'toggle' }, { kind: 'accept' }]).state
    const loading = run([{ kind: 'cameraGranted', attempt: asking.attempt }], asking)
    expect(loading.state.phase).toBe('loading')
    expect(loading.effects).toEqual([{ kind: 'loadTracker', attempt: asking.attempt }])
    const ready = run([{ kind: 'trackerReady', attempt: asking.attempt }], loading.state)
    expect(ready.state.phase).toBe('on')
    expect(ready.effects).toEqual([{ kind: 'track', attempt: asking.attempt }])
  })

  it('ignores Aç and camera answers when no note is open', () => {
    expect(run([{ kind: 'accept' }])).toEqual({ state: initialHandControl, effects: [] })
  })
})

describe('staying off', () => {
  it('Vazgeç closes the note, stays off and says so', () => {
    const { state } = run([{ kind: 'toggle' }, { kind: 'decline' }])
    expect(state.phase).toBe('off')
    expect(handStatus(state)).not.toBe('')
  })

  it('pressing the toggle again while the note is open is Vazgeç', () => {
    const { state } = run([{ kind: 'toggle' }, { kind: 'toggle' }])
    expect(state).toEqual(run([{ kind: 'toggle' }, { kind: 'decline' }]).state)
  })

  it.each(['refused', 'unavailable'] as const)(
    'a %s camera stays off and says so, differently from Vazgeç',
    (reason) => {
      const asking = run([{ kind: 'toggle' }, { kind: 'accept' }]).state
      const { state } = run([{ kind: 'cameraFailed', attempt: asking.attempt, reason }], asking)
      expect(state.phase).toBe('off')
      expect(handStatus(state)).not.toBe('')
      expect(handStatus(state)).not.toBe(
        handStatus(run([{ kind: 'toggle' }, { kind: 'decline' }]).state),
      )
    },
  )

  it('tracking files that fail to load turn it off and say so', () => {
    const asking = run([{ kind: 'toggle' }, { kind: 'accept' }]).state
    const { state, effects } = run(
      [
        { kind: 'cameraGranted', attempt: asking.attempt },
        { kind: 'trackerFailed', attempt: asking.attempt },
      ],
      asking,
    )
    expect(state.phase).toBe('off')
    expect(kinds(effects)).toContain('stop')
    expect(handStatus(state)).not.toBe('')
  })
})

describe('turning off', () => {
  it.each<[string, HandControlEvent]>([
    ['the toggle', { kind: 'toggle' }],
    ['the ×', { kind: 'close' }],
    ['a hidden tab', { kind: 'hidden' }],
    ['leaving the page', { kind: 'unmount' }],
  ])('%s turns it off and stops the camera', (_, event) => {
    const { state, effects } = run([event], on)
    expect(state.phase).toBe('off')
    expect(effects).toEqual([{ kind: 'stop' }])
  })

  it.each(['asking', 'loading'] as const)('a hidden tab while %s stops the camera too', (phase) => {
    const steps = turnOn().slice(0, phase === 'asking' ? 2 : 3)
    const before = run(steps).state
    expect(before.phase).toBe(phase)
    const { state, effects } = run([{ kind: 'hidden' }], before)
    expect(state.phase).toBe('off')
    expect(kinds(effects)).toContain('stop')
  })

  it('every path that ends off stops the camera', () => {
    // Every sequence of up to five events from off (camera answers for the current and the
    // previous attempt): whenever one turns Hand control off, it stops the camera.
    const eventsFor = (state: HandControlState): HandControlEvent[] => {
      const answers = [state.attempt, state.attempt - 1].flatMap((attempt): HandControlEvent[] => [
        { kind: 'cameraGranted', attempt },
        { kind: 'cameraFailed', attempt, reason: 'refused' },
        { kind: 'trackerReady', attempt },
        { kind: 'trackerFailed', attempt },
      ])
      return [
        { kind: 'toggle' },
        { kind: 'accept' },
        { kind: 'decline' },
        { kind: 'close' },
        { kind: 'hidden' },
        { kind: 'unmount' },
        ...answers,
      ]
    }
    let frontier = [initialHandControl]
    let checked = 0
    for (let depth = 0; depth < 5; depth++) {
      const next: HandControlState[] = []
      for (const state of frontier) {
        for (const event of eventsFor(state)) {
          const step = handControl(state, event)
          if (state.phase !== 'off' && step.state.phase === 'off') {
            expect(kinds(step.effects), `${state.phase} + ${event.kind}`).toContain('stop')
            checked++
          }
          next.push(step.state)
        }
      }
      frontier = next
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('late answers', () => {
  it('a camera granted after Hand control was turned off is released at once', () => {
    const asking = run([{ kind: 'toggle' }, { kind: 'accept' }]).state
    const off = run([{ kind: 'toggle' }], asking).state
    const { state, effects } = run([{ kind: 'cameraGranted', attempt: asking.attempt }], off)
    expect(state).toEqual(off)
    expect(effects).toEqual([{ kind: 'release', attempt: asking.attempt }])
  })

  it('an earlier attempt’s camera is released, and the current attempt goes on asking', () => {
    const first = run([{ kind: 'toggle' }, { kind: 'accept' }]).state
    const second = run([{ kind: 'toggle' }, { kind: 'toggle' }, { kind: 'accept' }], first).state
    expect(second.phase).toBe('asking')
    const { state, effects } = run([{ kind: 'cameraGranted', attempt: first.attempt }], second)
    expect(state).toEqual(second)
    expect(effects).toEqual([{ kind: 'release', attempt: first.attempt }])
  })

  it('a tracker ready after Hand control was turned off is released', () => {
    const steps = turnOn()
    const loading = run(steps.slice(0, 3)).state
    const off = run([{ kind: 'close' }], loading).state
    const { state, effects } = run([steps[3]!], off)
    expect(state).toEqual(off)
    expect(effects).toEqual([{ kind: 'release', attempt: loading.attempt }])
  })

  it('a refusal for an earlier attempt changes nothing', () => {
    const first = run([{ kind: 'toggle' }, { kind: 'accept' }]).state
    const second = run([{ kind: 'toggle' }, { kind: 'toggle' }, { kind: 'accept' }], first).state
    const late: HandControlEvent = {
      kind: 'cameraFailed',
      attempt: first.attempt,
      reason: 'refused',
    }
    expect(run([late], second)).toEqual({ state: second, effects: [] })
  })
})

describe('the status line', () => {
  it('says nothing before Hand control was ever used', () => {
    expect(handStatus(initialHandControl)).toBe('')
  })

  it('says when it is on, and when it was turned off', () => {
    expect(handStatus(on)).not.toBe('')
    expect(handStatus(run([{ kind: 'toggle' }], on).state)).not.toBe('')
  })

  it('clears a note when it is dismissed', () => {
    const refused = run([
      { kind: 'toggle' },
      { kind: 'accept' },
      { kind: 'cameraFailed', attempt: 1, reason: 'refused' },
    ]).state
    expect(handStatus(run([{ kind: 'dismissNotice' }], refused).state)).toBe('')
  })
})
