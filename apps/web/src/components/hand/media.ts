/**
 * Our own player under the hand's cursor (#59): a `<video>` with its controls, as a Work's main
 * video. Preview loops have none (they play in view or on hover, `LoopVideo`), so they are left
 * alone. A hand click on a `<video>` doesn't play it by itself: a synthetic click has no default.
 */
export const playerAt = (element: Element): HTMLVideoElement | null => {
  const video = element.closest('video')
  return video?.controls ? video : null
}

/**
 * Plays a paused `video`, or pauses a playing one. A synthetic click carries no user activation,
 * so a browser may refuse to start sound (Safari, or after a reload): then it plays muted, and the
 * player's own controls show it, for the visitor to unmute with the mouse.
 */
export function togglePlayback(video: HTMLVideoElement) {
  if (!video.paused) {
    video.pause()
    return
  }
  Promise.resolve()
    .then(() => video.play())
    .catch((error: unknown) => {
      if (!(error instanceof DOMException) || error.name !== 'NotAllowedError' || video.muted)
        return
      video.muted = true
      return video.play()
    })
    .catch(() => {})
}

/** The mark `ExternalVideo` puts on its loaded player's iframe. */
export const EXTERNAL_PLAYER_ATTR = 'data-external-player'

/**
 * The loaded external player (Vimeo or YouTube, `ExternalVideo`) under the hand's cursor, if any:
 * an iframe the hand can't reach inside (browser security). Only ours, by its mark, not any
 * iframe. The click-to-load poster before it is an ordinary button.
 */
export const externalPlayerAt = (element: Element | null): Element | null =>
  element?.closest(`[${EXTERNAL_PLAYER_ATTR}]`) ?? null
