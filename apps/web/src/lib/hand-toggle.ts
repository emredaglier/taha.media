import { useEffect, useState, useSyncExternalStore } from 'react'

import { deviceReport, isWeakDevice } from './home-mode'
import { CAN_HOVER, POINTER_FINE, saveDataOn, subscribeToQueries } from './loop-mode'

/** What decides whether the Elinle gez toggle is offered. */
export type HandToggleInputs = {
  /** A mouse or trackpad (`pointer: fine`). */
  finePointer: boolean
  /** A pointer that can hover (`hover: hover`). */
  hover: boolean
  /** The browser lists a video input device (no permission needed to see one exists). */
  hasCamera: boolean
  saveData: boolean
  /** The Helix's weak-device test (`isWeakDevice`). */
  weakDevice: boolean
}

/**
 * Whether to offer Hand control (#45, "Hand control"): only on a desktop (a fine pointer that
 * hovers) with a camera, never under Save-Data or on a weak device. Reduced motion is no reason
 * to hide it.
 */
export function showHandToggle(inputs: HandToggleInputs): boolean {
  const { finePointer, hover, hasCamera, saveData, weakDevice } = inputs
  return finePointer && hover && hasCamera && !saveData && !weakDevice
}

/** Listens to exactly the queries the rule reads, and to Save-Data. */
const subscribe = (onChange: () => void) => subscribeToQueries([POINTER_FINE, CAN_HOVER], onChange)

const matches = (query: string) => () => matchMedia(query).matches
const never = () => false
const noChanges = () => () => {}

type MediaDevicesLike = Pick<MediaDevices, 'enumerateDevices'> & EventTarget

/** Whether the browser lists a camera, live; only asked once `enabled`, false until it answers. */
function useHasCamera(enabled: boolean): boolean {
  const [hasCamera, setHasCamera] = useState(false)
  useEffect(() => {
    const devices = navigator.mediaDevices as MediaDevicesLike | undefined
    if (!enabled || !devices?.enumerateDevices) return
    let live = true
    const check = () => {
      devices
        .enumerateDevices()
        .then((list) => live && setHasCamera(list.some((device) => device.kind === 'videoinput')))
        .catch(() => live && setHasCamera(false))
    }
    check()
    devices.addEventListener('devicechange', check)
    return () => {
      live = false
      devices.removeEventListener('devicechange', check)
    }
  }, [enabled])
  return enabled && hasCamera
}

/**
 * Whether this browser gets the toggle, live. The server and the first client render say no, so
 * the toggle never flashes for visitors who don't get it, and their header never shifts.
 */
export function useHandToggleShown(): boolean {
  const finePointer = useSyncExternalStore(subscribe, matches(POINTER_FINE), never)
  const hover = useSyncExternalStore(subscribe, matches(CAN_HOVER), never)
  const saveData = useSyncExternalStore(subscribe, saveDataOn, never)
  const weakDevice = useSyncExternalStore(noChanges, () => isWeakDevice(deviceReport()), never)
  const hasCamera = useHasCamera(finePointer && hover && !saveData && !weakDevice)
  return showHandToggle({ finePointer, hover, hasCamera, saveData, weakDevice })
}
