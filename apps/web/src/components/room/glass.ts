import * as THREE from 'three'

import { ROOM_TUNING } from '../../lib/room-tuning'
import { BLUR_FS, BRIGHT_FS, GLASS_FS, PASS_VS } from './shaders'

/**
 * The curved glass in front of the Edit Room (#128): the room is drawn to an off-screen target,
 * then to the screen through one pass (the CRT bend, with the glow of its bright parts added
 * back). The glow is the picture's bright parts blurred at quarter size, in two rounds, a tight
 * glow and then a wide one. Everything it makes is freed in `dispose`.
 */
export function createGlass(renderer: THREE.WebGLRenderer) {
  const picture = new THREE.WebGLRenderTarget(2, 2, { samples: 4, depthBuffer: true })
  const glowA = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false })
  const glowB = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false })
  const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
    new THREE.ShaderMaterial({
      vertexShader: PASS_VS,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    })
  const bright = pass(BRIGHT_FS, { t: { value: picture.texture } })
  const blur = pass(BLUR_FS, { t: { value: null }, d: { value: new THREE.Vector2() } })
  const glass = pass(GLASS_FS, {
    tPic: { value: picture.texture },
    tBloom: { value: glowA.texture },
    uAspect: { value: 1 },
    uBend: { value: ROOM_TUNING.glass.bend },
    uBloom: { value: ROOM_TUNING.glass.glow },
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const quad = new THREE.Mesh(geometry, bright)
  const quadScene = new THREE.Scene()
  quadScene.add(quad)
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const run = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
    quad.material = material
    renderer.setRenderTarget(target)
    renderer.render(quadScene, quadCamera)
  }

  return {
    /** Matches the targets to the drawing buffer, `width` by `height` px. */
    setSize(width: number, height: number) {
      picture.setSize(width, height)
      const w = Math.max(2, Math.round(width / 4))
      const h = Math.max(2, Math.round(height / 4))
      glowA.setSize(w, h)
      glowB.setSize(w, h)
      glass.uniforms.uAspect!.value = width / height
    },
    /** Draws `scene` through the glass onto the canvas. */
    render(scene: THREE.Scene, camera: THREE.Camera) {
      renderer.setRenderTarget(picture)
      renderer.render(scene, camera)
      run(bright, glowA)
      for (const spread of [1, 2.4]) {
        blur.uniforms.t!.value = glowA.texture
        blur.uniforms.d!.value.set(spread / glowA.width, 0)
        run(blur, glowB)
        blur.uniforms.t!.value = glowB.texture
        blur.uniforms.d!.value.set(0, spread / glowA.height)
        run(blur, glowA)
      }
      run(glass, null)
    },
    dispose() {
      for (const target of [picture, glowA, glowB]) target.dispose()
      for (const material of [bright, blur, glass]) material.dispose()
      geometry.dispose()
    },
  }
}
