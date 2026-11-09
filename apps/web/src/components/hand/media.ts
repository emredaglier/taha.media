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

/** The hint over an external player (#59). */
export const PLAYER_HINT = 'Oynatıcının içinde fareyi kullan'

/**
 * Whether the hand's cursor is over a loaded external player (Vimeo or YouTube, `ExternalVideo`):
 * an iframe, which the hand can't reach inside (browser security). The click-to-load poster
 * before it is an ordinary button.
 */
export const overExternalPlayer = (element: Element | null): boolean =>
  element?.tagName === 'IFRAME'
