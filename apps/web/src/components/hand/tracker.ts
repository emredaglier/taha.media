import { HandLandmarker } from '@mediapipe/tasks-vision'

import type { HandFrame } from '../../lib/hand-gesture'

/*
 * The hand-tracking files, self-hosted (ADR-0005, #56). Each `new URL(…, import.meta.url)` makes
 * webpack emit the file into `/_next/static/media/<name>.<hash>.<ext>`, which CI uploads to R2 and
 * `cdn.taha.media` serves under the release's `assetPrefix`. The content hash versions each file;
 * the release folder means the browser cache holds them until the next deploy (owner accepted).
 * Nothing comes from jsDelivr or Google at runtime. This module is only ever reached through the
 * controller's dynamic `import()` after Aç, so neither it nor MediaPipe is in the first load, and
 * no file is fetched before Aç.
 *
 * - The WASM loader and binary come from `@mediapipe/tasks-vision`, pinned to an exact version in
 *   `apps/web/package.json`. They are handed to MediaPipe directly instead of `FilesetResolver`,
 *   whose base path is fixed. Next's loaders leave files in `node_modules` untouched, so the
 *   loader script is emitted byte for byte.
 * - The package logs usage to Google from every task (`odml.pa.googleapis.com`); the pnpm patch in
 *   `patches/` removes that logger and its endpoint, and `tracker.test.ts` checks the installed
 *   bundles, so "the picture never leaves the device" holds for its metadata too.
 * - The model is MediaPipe's hand landmarker (only landmarks are needed), vendored once from
 *   https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
 *   (float16, version 1; 7,819,105 bytes). `tracker.test.ts` checks its SHA-256, so a swapped file
 *   fails CI. To update it, download the new version into a new folder named after it.
 */
const WASM_LOADER = new URL('@mediapipe/tasks-vision/vision_wasm_internal.js', import.meta.url)
const WASM_BINARY = new URL('@mediapipe/tasks-vision/vision_wasm_internal.wasm', import.meta.url)
const MODEL = new URL('./models/hand_landmarker-float16-v1/hand_landmarker.task', import.meta.url)

/** The hand tracker the controller runs on every camera frame. */
export type HandTracker = {
  /** The hand in this frame, or null without one. `now` (ms) must rise from frame to frame. */
  detect(video: HTMLVideoElement, now: number): HandFrame | null
  /** Frees the tracker (its WASM memory and GPU context). */
  close(): void
}

/** Loads the tracking files (the browser caches them for later visits) and starts the tracker. */
export async function createHandTracker(): Promise<HandTracker> {
  const fileset = { wasmLoaderPath: String(WASM_LOADER), wasmBinaryPath: String(WASM_BINARY) }
  const start = (delegate: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: String(MODEL), delegate },
      runningMode: 'VIDEO',
      numHands: 1,
    })
  // The GPU delegate is faster; some browsers or GPUs refuse it, and the CPU still works.
  const landmarker = await start('GPU').catch(() => start('CPU'))
  return {
    detect(video, now) {
      return landmarker.detectForVideo(video, now).landmarks[0] ?? null
    },
    close() {
      landmarker.close()
    },
  }
}
