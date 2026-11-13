import * as THREE from 'three'

import { cameraPose } from '../../lib/room-model'
import {
  atlasRect,
  fovFor,
  isPortrait,
  stepChair,
  stepLook,
  stillCrop,
  type ChairSwivel,
  type Look,
} from '../../lib/room-motion'
import { ROOM_TUNING } from '../../lib/room-tuning'
import {
  GLOW_FS,
  GLOW_VS,
  LIT_FS,
  LIT_VS,
  SCREEN_FS,
  SCREEN_VS,
  SHADOW_FS,
  SHADOW_VS,
} from './shaders'

/**
 * The Edit Room's scene (#127), ported from the prototype (`docs/design/home2/editroom.js`): Taha's
 * desk at night, every shape built in code, one lit shader for all the furniture with up to eight
 * fake lights, baked vertex shading, contact-shadow and glow quads. About 15 draw calls. It draws
 * the room at rest: the Works' stills on their places, spare places dark, and the loops painted
 * over them (`setFrame`, #129). Glass, the Statement sheet, the opening, hover and the phone's light variant are later tickets.
 */

/** The room can't run here (no WebGL2, no 2D canvas, a shader that doesn't compile, a lost context): the static Home stays. */
export class RoomUnavailable extends Error {}

/** The site's grey tokens the room is drawn in (0xRRGGBB), read from the page (`readPalette`). */
export type RoomPalette = { raised: number; placeholder: number; muted: number }

/** What one frame needs: the path position (0 to 1), where the pointer is over the room, and the time. */
export type RoomFrame = {
  seconds: number
  dt: number
  /** How far along the camera's path, 0 the doorway to 1 the last stop. */
  progress: number
  /** The pointer over the room (`nx`, `ny` -1 to 1 across and up; `dx` px moved since the last frame), or null. */
  pointer: { nx: number; ny: number; dx: number } | null
}

export type RoomScene = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  update(frame: RoomFrame): void
  resize(width: number, height: number): void
  /** Paints Work `place`'s still (cut to 16:9) into its cell of the atlas. */
  setStill(
    place: number,
    image: CanvasImageSource & { width: number; height: number },
    focalPoint: { x: number; y: number },
  ): void
  /** Paints a Preview loop's current frame into Work `place`'s cell, cut as its still is: the screen and its desk mirror show it. */
  setFrame(place: number, video: HTMLVideoElement, focalPoint: { x: number; y: number }): void
  /** Where each place's screen is (its centre), for picking the screens that play. */
  screenCentres: readonly THREE.Vector3[]
  dispose(): void
}

type Vec3Tuple = [number, number, number]

const DEG = Math.PI / 180
// Greys between the site's tokens, for the furniture the tokens don't name.
const GREY = { floor: 0x484848, wall: 0x555555, desk: 0x6a6a6a, rug: 0x303030, chair: 0x3a3a3a }

export function createRoomScene({
  places,
  palette,
  touch,
}: {
  /** Which places have a Work (the others stay dark). */
  places: readonly boolean[]
  palette: RoomPalette
  /** No hover: the small details are left out. */
  touch: boolean
}): RoomScene {
  const { raised: RAISED, placeholder: PLACEHOLDER, muted: MUTED } = palette
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(58, 1, 0.02, 24)
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const textures: THREE.Texture[] = []
  const own = <T extends THREE.BufferGeometry>(geometry: T): T => {
    geometries.push(geometry)
    return geometry
  }
  const ownMaterial = <T extends THREE.Material>(material: T): T => {
    materials.push(material)
    return material
  }

  // ---- build kit: matrices, and a merger that bakes grey vertex colours with a bottom-darkening gradient ----
  const euler = new THREE.Euler()
  const quaternion = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const unit = new THREE.Vector3(1, 1, 1)
  const M = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) =>
    new THREE.Matrix4().compose(
      position.set(x, y, z),
      quaternion.setFromEuler(euler.set(rx, ry, rz, 'YXZ')),
      unit,
    )
  const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => a.clone().multiply(b)
  const Box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
  const Cylinder = (top: number, bottom: number, height: number, sides = 18) =>
    new THREE.CylinderGeometry(top, bottom, height, sides)

  function makeMerge() {
    const pos: number[] = []
    const nor: number[] = []
    const col: number[] = []
    const uvs: number[] = []
    const idx: number[] = []
    const v = new THREE.Vector3()
    const nv = new THREE.Vector3()
    const nm = new THREE.Matrix3()
    return {
      /** Adds `geometry` placed by `m` in grey `hex`; `ao` darkens it towards its bottom (the baked contact shade). */
      add(geometry: THREE.BufferGeometry, m: THREE.Matrix4, hex: number, ao = true) {
        const p = geometry.attributes.position!
        const normals = geometry.attributes.normal!
        const uv = geometry.attributes.uv!
        const count = p.count
        const base = pos.length / 3
        nm.getNormalMatrix(m)
        let y0 = 1e9
        let y1 = -1e9
        for (let k = 0; k < count; k++) {
          v.fromBufferAttribute(p, k).applyMatrix4(m)
          pos.push(v.x, v.y, v.z)
          nv.fromBufferAttribute(normals, k).applyMatrix3(nm).normalize()
          nor.push(nv.x, nv.y, nv.z)
          uvs.push(uv.getX(k), uv.getY(k))
          if (v.y < y0) y0 = v.y
          if (v.y > y1) y1 = v.y
        }
        const r = ((hex >> 16) & 255) / 255
        for (let k = 0; k < count; k++) {
          const f =
            ao && y1 > y0 + 0.02 ? 0.62 + (0.38 * (pos[(base + k) * 3 + 1]! - y0)) / (y1 - y0) : 1
          col.push(r * f, r * f, r * f)
        }
        if (geometry.index)
          for (let k = 0; k < geometry.index.count; k++) idx.push(geometry.index.getX(k) + base)
        else for (let k = 0; k < count; k++) idx.push(base + k)
        geometry.dispose()
      },
      /** A thin box from point `a` to point `b`. */
      rod(a: Vec3Tuple, b: Vec3Tuple, thickness: number, hex: number) {
        const from = new THREE.Vector3(...a)
        const to = new THREE.Vector3(...b)
        const m = new THREE.Matrix4().lookAt(from, to, new THREE.Vector3(0, 1, 0))
        m.setPosition(from.clone().add(to).multiplyScalar(0.5))
        this.add(Box(thickness, thickness, from.distanceTo(to)), m, hex)
      },
      build() {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
        g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3))
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
        g.setIndex(idx)
        return g
      },
    }
  }

  // ---- the atlas: every place's still in one canvas texture, so the desk can mirror a monitor ----
  const { columns, cellWidth, cellHeight } = ROOM_TUNING.atlas
  const atlasCanvas = document.createElement('canvas')
  atlasCanvas.width = columns * cellWidth
  atlasCanvas.height = ROOM_TUNING.atlas.rows * cellHeight
  const paint = atlasCanvas.getContext('2d')
  if (!paint) throw new RoomUnavailable('No 2D context for the room')
  const hexColour = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`
  const cell = (place: number) => ({
    x: (place % columns) * cellWidth,
    y: Math.floor(place / columns) * cellHeight,
  })
  /** Paints `source` (`width` by `height` px, cut to 16:9 around the focal point) into `place`'s cell. */
  const paintCell = (
    place: number,
    source: CanvasImageSource,
    width: number,
    height: number,
    focalPoint: { x: number; y: number },
  ) => {
    const crop = stillCrop(width, height, focalPoint)
    const { x, y } = cell(place)
    paint.drawImage(source, crop.x, crop.y, crop.width, crop.height, x, y, cellWidth, cellHeight)
    atlas.needsUpdate = true
  }
  places.forEach((hasWork, place) => {
    paint.fillStyle = hasWork ? hexColour(PLACEHOLDER) : '#000'
    paint.fillRect(cell(place).x, cell(place).y, cellWidth, cellHeight)
  })
  const atlas = new THREE.CanvasTexture(atlasCanvas)
  atlas.anisotropy = 4
  textures.push(atlas)

  // ---- lights (data only; the shader does the rest) ----
  const LP = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0))
  const LD = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 1, 1))
  const litUniforms = {
    uLP: { value: LP },
    uLD: { value: LD },
    uRoom: { value: 1 },
    uStripe: { value: 1 },
    uT: { value: 0 },
  }
  const litMaterial = ownMaterial(
    new THREE.ShaderMaterial({
      uniforms: litUniforms,
      vertexShader: LIT_VS,
      fragmentShader: LIT_FS,
    }),
  )
  const litMaterialTwoSided = ownMaterial(
    new THREE.ShaderMaterial({
      uniforms: litUniforms,
      vertexShader: LIT_VS,
      fragmentShader: LIT_FS,
      side: THREE.DoubleSide,
    }),
  )

  // ---- the eight places: 0..2 monitors, 3 laptop, 4 tablet, 5 phone, 6..7 framed prints ----
  const Y22 = 22 * DEG
  const monitors = [M(-0.62, 0.75, -1.74, Y22), M(0, 0.75, -1.8, 0), M(0.62, 0.75, -1.74, -Y22)]
  const laptop = M(1.27, 0.615, -1.55, -1.065)
  const laptopHinge = mul(laptop, M(0, 0.015, -0.105, 0, -0.21))
  const tablet = M(-0.6, 0.754, -1.4, 0.17)
  const phone = M(0.66, 0.754, -1.33, -0.24)
  const prints = [M(1.5, 1.5, -1.0, -Math.PI / 2), M(1.5, 1.5, -0.1, -Math.PI / 2)]
  const FLAT = M(0, 0, 0, 0, -Math.PI / 2) // a plane facing up, its top towards the wall
  // Where each screen's picture sits (its centre and facing).
  const screenPlacement = [
    mul(monitors[0]!, M(0, 0.32, 0.0008)),
    mul(monitors[1]!, M(0, 0.32, 0.0008)),
    mul(monitors[2]!, M(0, 0.32, 0.0008)),
    mul(laptopHinge, M(0, 0.1, 0.0066)),
    mul(mul(tablet, M(0, 0.0045, 0)), FLAT),
    mul(mul(phone, M(0, 0.0045, 0)), FLAT),
    mul(prints[0]!, M(0, 0, 0.0315)),
    mul(prints[1]!, M(0, 0, 0.0315)),
  ]
  // How bright each place is at rest: a place with no Work stays dark.
  const bright = screenPlacement.map((_, place) =>
    places[place] ? ROOM_TUNING.screens[place]!.base : 0,
  )
  const screenCentre = screenPlacement.map(() => new THREE.Vector3())
  const screenFacing = screenPlacement.map(() => new THREE.Vector3())
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  screenPlacement.forEach((m, place) => {
    const { width, light, power } = ROOM_TUNING.screens[place]!
    const [u, v, su, sv] = atlasRect(place)
    const screen = new THREE.Mesh(
      own(new THREE.PlaneGeometry(width, (width * 9) / 16)),
      ownMaterial(
        new THREE.ShaderMaterial({
          uniforms: {
            uMap: { value: atlas },
            uRect: { value: new THREE.Vector4(u, v, su, sv) },
            uB: { value: bright[place] },
          },
          vertexShader: SCREEN_VS,
          fragmentShader: SCREEN_FS,
        }),
      ),
    )
    screen.matrixAutoUpdate = false
    screen.matrix.copy(m)
    screen.frustumCulled = false
    scene.add(screen)
    m.extractBasis(right, up, screenFacing[place]!)
    screenCentre[place]!.setFromMatrixPosition(m)
    // The screens that can throw light on something: a monitor or laptop beams it, a flat device lights the desk in front of it.
    if (place < 6) {
      const c = screenCentre[place]!
      const n = screenFacing[place]!
      LP[place]!.set(c.x + n.x * 0.04, c.y + n.y * 0.04, c.z + n.z * 0.04, light * bright[place]!)
      if (place < 4) LD[place]!.set(n.x, n.y, n.z, power)
      else LD[place]!.set(0, 0.6, 0.8, 1.2)
    }
  })
  scene.updateMatrixWorld(true)

  // ---- the static room, one merged mesh ----
  const S = makeMerge()
  const plane = (w: number, h: number, m: THREE.Matrix4, hex: number) =>
    S.add(new THREE.PlaneGeometry(w, h), m, hex, false)
  plane(3, 4, M(0, 0, 0, 0, -Math.PI / 2), GREY.floor) // floor
  plane(3, 4, M(0, 2.6, 0, 0, Math.PI / 2), PLACEHOLDER) // ceiling
  plane(3, 2.6, M(0, 1.3, -2), GREY.wall) // back wall
  plane(4, 2.6, M(-1.5, 1.3, 0, Math.PI / 2), GREY.wall) // left wall (window)
  plane(4, 2.6, M(1.5, 1.3, 0, -Math.PI / 2), GREY.wall) // right wall (prints)
  S.add(Box(1.7, 0.012, 2.2), M(0, 0.006, -0.2), GREY.rug, false) // rug
  // desk
  S.add(Box(2.1, 0.04, 0.75), M(0, 0.73, -1.625), GREY.desk, false)
  S.add(Box(0.04, 0.71, 0.7), M(-1.03, 0.355, -1.625), PLACEHOLDER)
  S.add(Box(0.04, 0.71, 0.7), M(1.03, 0.355, -1.625), PLACEHOLDER)
  S.add(Box(2.0, 0.4, 0.02), M(0, 0.5, -1.95), PLACEHOLDER)
  S.add(Box(0.4, 0.62, 0.6), M(0.78, 0.4, -1.64), 0x333333)
  // monitors: base, neck, back bump, body
  for (const monitor of monitors) {
    S.add(Box(0.24, 0.012, 0.18), mul(monitor, M(0, 0.006, 0.02)), RAISED)
    S.add(Box(0.05, 0.2, 0.025), mul(monitor, M(0, 0.11, -0.055)), RAISED)
    S.add(Box(0.2, 0.2, 0.04), mul(monitor, M(0, 0.31, -0.05)), 0x222222)
    S.add(Box(0.6, 0.365, 0.03), mul(monitor, M(0, 0.315, -0.015)), RAISED)
  }
  // keyboard, mouse, pad, mug, speakers
  S.add(Box(0.44, 0.018, 0.14), M(-0.02, 0.759, -1.42), PLACEHOLDER)
  for (let r = 0; r < 3; r++)
    S.add(Box(0.4, 0.004, 0.026), M(-0.02, 0.769, -1.465 + r * 0.04), GREY.wall, false)
  S.add(Box(0.22, 0.003, 0.18), M(0.32, 0.7515, -1.4), RAISED, false)
  S.add(Box(0.045, 0.022, 0.07), M(0.32, 0.762, -1.4), PLACEHOLDER)
  S.add(Cylinder(0.04, 0.036, 0.09, 16), M(0.5, 0.795, -1.55), MUTED)
  for (const sx of [-1, 1]) {
    const speaker = M(sx * 0.93, 0.75, -1.45, -sx * 0.2)
    S.add(Box(0.14, 0.23, 0.15), mul(speaker, M(0, 0.115, 0)), 0x222222)
    S.add(
      Cylinder(0.042, 0.042, 0.01, 16),
      mul(speaker, mul(M(0, 0.07, 0.077), M(0, 0, 0, 0, Math.PI / 2))),
      0x111111,
      false,
    )
    S.add(
      Cylinder(0.016, 0.016, 0.01, 12),
      mul(speaker, mul(M(0, 0.18, 0.077), M(0, 0, 0, 0, Math.PI / 2))),
      0x111111,
      false,
    )
  }
  // tablet and phone bodies, laptop base and lid, side table
  S.add(Box(0.275, 0.008, 0.195), tablet, RAISED)
  S.add(Box(0.155, 0.008, 0.08), phone, RAISED)
  S.add(Box(0.42, 0.03, 0.42), M(1.27, 0.6, -1.55), PLACEHOLDER, false)
  for (const [lx, lz] of [
    [-0.18, -0.18],
    [0.18, -0.18],
    [-0.18, 0.18],
    [0.18, 0.18],
  ] as const)
    S.add(Box(0.03, 0.585, 0.03), M(1.27 + lx, 0.2925, -1.55 + lz), RAISED)
  S.add(Box(0.32, 0.015, 0.22), mul(laptop, M(0, 0.0075, 0)), PLACEHOLDER)
  S.add(Box(0.32, 0.2, 0.012), mul(laptopHinge, M(0, 0.1, 0)), RAISED)
  // prints: frame and mat
  for (const print of prints) {
    S.add(Box(0.78, 0.5, 0.03), mul(print, M(0, 0, 0.015)), RAISED, false)
    S.add(Box(0.7, 0.42, 0.031), mul(print, M(0, 0, 0.0155)), MUTED, false)
  }
  // The Statement's sheet, taped above the monitors, is a later ticket: the wall stays bare there.
  // window frame and blind slats
  S.add(Box(0.05, 0.05, 1.16), M(-1.48, 2.12, -0.55), RAISED, false)
  S.add(Box(0.05, 0.05, 1.16), M(-1.48, 0.88, -0.55), RAISED, false)
  S.add(Box(0.05, 1.3, 0.05), M(-1.48, 1.5, -1.07), RAISED, false)
  S.add(Box(0.05, 1.3, 0.05), M(-1.48, 1.5, -0.03), RAISED, false)
  for (let k = 0; k < 17; k++)
    S.add(Box(0.09, 0.012, 1.0), M(-1.42, 2.08 - k * 0.04, -0.55, 0, 0, 0.45), PLACEHOLDER, false)
  // shelf with books and a pot
  S.add(Box(0.22, 0.03, 1.0), M(-1.39, 1.5, 0.6), PLACEHOLDER, false)
  S.add(Box(0.02, 0.12, 0.18), M(-1.46, 1.43, 0.3), RAISED, false)
  S.add(Box(0.02, 0.12, 0.18), M(-1.46, 1.43, 0.9), RAISED, false)
  const bookHeights = [0.22, 0.18, 0.26, 0.2, 0.24, 0.17, 0.21]
  const bookColours = [MUTED, GREY.wall, PLACEHOLDER, GREY.desk, RAISED, MUTED, 0x444444]
  for (let k = 0; k < 7; k++)
    S.add(
      Box(0.15, bookHeights[k]!, 0.035),
      M(-1.4, 1.515 + bookHeights[k]! / 2, 0.3 + k * 0.042, 0, 0, k === 5 ? 0.18 : 0),
      bookColours[k]!,
    )
  S.add(Cylinder(0.06, 0.045, 0.1, 14), M(-1.4, 1.565, 0.85), GREY.wall)
  for (let k = 0; k < 5; k++)
    S.add(Box(0.012, 0.16, 0.012), M(-1.4, 1.7, 0.85, k, 0, (k - 2) * 0.22), GREY.desk, false)
  if (!touch) {
    // headphones on a hook, a small fake detail
    S.add(Cylinder(0.008, 0.008, 0.05, 8), M(-1.28, 1.45, -1.975, 0, Math.PI / 2), MUTED, false)
    S.add(
      new THREE.TorusGeometry(0.085, 0.011, 8, 20, Math.PI),
      M(-1.28, 1.365, -1.96),
      RAISED,
      false,
    )
    for (const sx of [-1, 1])
      S.add(
        Cylinder(0.045, 0.045, 0.035, 14),
        M(-1.28 + sx * 0.085, 1.34, -1.96, 0, 0, Math.PI / 2),
        0x222222,
        false,
      )
  }
  // desk lamp base and arms (the head is separate)
  S.add(Cylinder(0.08, 0.09, 0.02, 18), M(-1.0, 0.76, -1.72), RAISED)
  S.rod([-1, 0.77, -1.72], [-1, 1.3, -1.72], 0.016, PLACEHOLDER)
  S.rod([-1, 1.3, -1.72], [-0.9, 1.34, -1.55], 0.014, PLACEHOLDER)
  scene.add(new THREE.Mesh(own(S.build()), litMaterial))

  // window night (self lit grey) behind the slats
  const night = new THREE.Mesh(
    own(new THREE.PlaneGeometry(1.0, 1.2)),
    ownMaterial(new THREE.MeshBasicMaterial({ color: GREY.floor })),
  )
  night.position.set(-1.495, 1.5, -0.55)
  night.rotation.y = Math.PI / 2
  scene.add(night)

  // ---- dynamic furniture: the chair (swivels), the lamp head (follows the pointer) ----
  const C = makeMerge()
  for (let k = 0; k < 5; k++) {
    const a = (k * Math.PI * 2) / 5
    C.add(
      Box(0.3, 0.03, 0.04),
      M(Math.sin(a) * 0.15, 0.09, Math.cos(a) * 0.15, a + Math.PI / 2),
      PLACEHOLDER,
    )
    C.add(
      Cylinder(0.022, 0.022, 0.04, 10),
      M(Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29),
      0x111111,
    )
  }
  C.add(Cylinder(0.03, 0.03, 0.36, 10), M(0, 0.27, 0), 0x333333)
  C.add(Cylinder(0.23, 0.22, 0.07, 22), M(0, 0.47, 0), GREY.chair)
  C.add(Box(0.42, 0.5, 0.06), M(0, 0.82, 0.22, 0, 0.1), GREY.chair)
  C.add(Box(0.3, 0.12, 0.07), M(0, 1.12, 0.25, 0, 0.1), GREY.chair)
  for (const sx of [-1, 1]) {
    C.add(Box(0.035, 0.035, 0.28), M(sx * 0.26, 0.68, 0.04), PLACEHOLDER)
    C.add(Box(0.025, 0.16, 0.025), M(sx * 0.26, 0.6, 0.16), PLACEHOLDER)
  }
  const chair = new THREE.Mesh(own(C.build()), litMaterial)
  chair.position.set(0, 0, -0.85)
  scene.add(chair)

  const LAMP_REST = new THREE.Vector3(0.76, -0.64, 0.16).normalize()
  const LAMP_SPOT = new THREE.Vector3(0.75, 0.55, -0.37).normalize()
  const lampPosition = new THREE.Vector3(-0.9, 1.34, -1.55)
  const head = new THREE.Group()
  head.position.copy(lampPosition)
  scene.add(head)
  const H = makeMerge()
  H.add(
    new THREE.CylinderGeometry(0.025, 0.075, 0.14, 16, 1, true),
    new THREE.Matrix4().makeRotationFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), LAMP_REST),
    ),
    PLACEHOLDER,
    false,
  )
  head.add(new THREE.Mesh(own(H.build()), litMaterialTwoSided))
  const bulbGeometry = own(new THREE.CircleGeometry(0.05, 14))
  bulbGeometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), LAMP_REST),
  )
  bulbGeometry.translate(LAMP_REST.x * 0.068, LAMP_REST.y * 0.068, LAMP_REST.z * 0.068)
  const bulb = ownMaterial(new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }))
  bulb.color.setScalar(0.93)
  head.add(new THREE.Mesh(bulbGeometry, bulb))

  // ---- soft contact shadows (one transparent mesh) ----
  const shadows = {
    pos: [] as number[],
    uv: [] as number[],
    str: [] as number[],
    idx: [] as number[],
  }
  const corner = new THREE.Vector3()
  /** A soft blob lying flat, `w` by `d` metres, centred where `m` puts it. */
  function shadow(m: THREE.Matrix4, w: number, d: number, strength: number) {
    const corners = [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ] as const
    const uv = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const
    const base = shadows.pos.length / 3
    corners.forEach(([x, z], k) => {
      corner.set(x, 0, z).applyMatrix4(m)
      shadows.pos.push(corner.x, corner.y, corner.z)
      shadows.uv.push(uv[k]![0], uv[k]![1])
      shadows.str.push(strength)
    })
    shadows.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  shadow(M(0, 0.003, -0.85), 0.95, 0.95, 0.85)
  shadow(M(0, 0.003, -1.6), 2.5, 1.2, 0.9)
  shadow(M(1.27, 0.003, -1.55), 0.7, 0.7, 0.8)
  for (const monitor of monitors) shadow(mul(monitor, M(0, 0.0015, 0)), 0.5, 0.34, 0.8)
  shadow(M(-0.02, 0.7515, -1.42), 0.58, 0.24, 0.55)
  shadow(M(0.32, 0.7515, -1.4), 0.26, 0.22, 0.4)
  shadow(M(0.5, 0.7515, -1.55), 0.14, 0.14, 0.5)
  for (const sx of [-1, 1]) shadow(M(sx * 0.93, 0.7515, -1.45), 0.26, 0.26, 0.7)
  shadow(mul(tablet, M(0, -0.0008, 0)), 0.36, 0.28, 0.55)
  shadow(mul(phone, M(0, -0.0008, 0)), 0.22, 0.15, 0.55)
  shadow(M(-1.0, 0.7515, -1.72), 0.25, 0.25, 0.6)
  shadow(mul(laptop, M(0, 0.0015, 0)), 0.42, 0.32, 0.6)
  const shadowGeometry = own(new THREE.BufferGeometry())
  shadowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shadows.pos, 3))
  shadowGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(shadows.uv, 2))
  shadowGeometry.setAttribute('aStr', new THREE.Float32BufferAttribute(shadows.str, 1))
  shadowGeometry.setIndex(shadows.idx)
  const shadowMesh = new THREE.Mesh(
    shadowGeometry,
    ownMaterial(
      new THREE.ShaderMaterial({
        vertexShader: SHADOW_VS,
        fragmentShader: SHADOW_FS,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    ),
  )
  shadowMesh.renderOrder = 1
  scene.add(shadowMesh)

  // ---- glow quads (one additive mesh): each screen's light on what is near it ----
  const glows = {
    pos: [] as number[],
    uv: [] as number[],
    rect: [] as number[],
    kind: [] as number[],
    a: [] as number[],
    idx: [] as number[],
    owner: [] as number[],
  }
  /** `wall`: the quad stands in the local xy plane; otherwise it lies in xz with its s axis along +z. */
  function glow(
    m: THREE.Matrix4,
    w: number,
    d: number,
    kind: number,
    place: number,
    wall: boolean,
  ) {
    const corners = wall
      ? [
          [-w / 2, -d / 2, 0],
          [w / 2, -d / 2, 0],
          [w / 2, d / 2, 0],
          [-w / 2, d / 2, 0],
        ]
      : [
          [-w / 2, 0, 0.03],
          [w / 2, 0, 0.03],
          [w / 2, 0, 0.03 + d],
          [-w / 2, 0, 0.03 + d],
        ]
    const uv = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const
    const base = glows.pos.length / 3
    const [u, v, su, sv] = atlasRect(place)
    corners.forEach((p, k) => {
      corner.set(p[0]!, p[1]!, p[2]!).applyMatrix4(m)
      glows.pos.push(corner.x, corner.y, corner.z)
      glows.uv.push(uv[k]![0], uv[k]![1])
      glows.rect.push(u, v, su, sv)
      glows.kind.push(kind)
      glows.a.push(0, 0)
    })
    glows.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    glows.owner.push(place)
  }
  for (let i = 0; i < 3; i++) glow(mul(monitors[i]!, M(0, 0.0025, 0)), 0.62, 0.55, 0, i, false) // the loop mirrored on the desk
  for (let i = 0; i < 3; i++) glow(M((i - 1) * 0.62, 1.07, -1.994), 1.15, 0.85, 1, i, true) // halo on the wall behind
  glow(mul(tablet, mul(M(0, 0.0025, 0), M(0, 0, 0, 0, Math.PI / 2))), 0.62, 0.46, 1, 4, true) // patch under the tablet (stands in xy, turned flat)
  glow(mul(phone, mul(M(0, 0.0025, 0), M(0, 0, 0, 0, Math.PI / 2))), 0.42, 0.3, 1, 5, true)
  glow(mul(M(1.27, 0.6165, -1.55), M(0, 0, 0, 0, Math.PI / 2)), 0.6, 0.5, 1, 3, true)
  // Each glow follows its screen's brightness (squared): the same at rest, so written once.
  glows.owner.forEach((place, quad) => {
    for (let k = 0; k < 4; k++) glows.a[(quad * 4 + k) * 2] = bright[place]! * bright[place]!
  })
  const glowGeometry = own(new THREE.BufferGeometry())
  glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glows.pos, 3))
  glowGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(glows.uv, 2))
  glowGeometry.setAttribute('aRect', new THREE.Float32BufferAttribute(glows.rect, 4))
  glowGeometry.setAttribute('aKind', new THREE.Float32BufferAttribute(glows.kind, 1))
  glowGeometry.setAttribute('aA', new THREE.Float32BufferAttribute(glows.a, 2))
  glowGeometry.setIndex(glows.idx)
  const glowMesh = new THREE.Mesh(
    glowGeometry,
    ownMaterial(
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: atlas } },
        vertexShader: GLOW_VS,
        fragmentShader: GLOW_FS,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    ),
  )
  glowMesh.renderOrder = 2
  glowMesh.frustumCulled = false
  scene.add(glowMesh)

  // ---- per frame: nothing here allocates ----
  let portrait = false
  const pose = cameraPose(0, false)
  const look: Look = { x: 0, y: 0 }
  const swivel: ChairSwivel = { yaw: 0, speed: 0 }
  const lookQuaternion = new THREE.Quaternion()
  const lookEuler = new THREE.Euler()
  const aim = new THREE.Vector3()
  const headQuaternion = new THREE.Quaternion()
  const headTarget = new THREE.Quaternion()
  const origin = new THREE.Vector3()
  const ray = new THREE.Vector3()
  const scratch = new THREE.Vector3()

  function update({ seconds, dt, progress, pointer }: RoomFrame) {
    const hover = pointer !== null && !touch
    cameraPose(progress, portrait, pose)
    stepLook(look, hover ? pointer : null, dt)
    camera.position.set(pose.position[0], pose.position[1], pose.position[2])
    camera.lookAt(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2])
    camera.quaternion.multiply(lookQuaternion.setFromEuler(lookEuler.set(look.y, look.x, 0, 'YXZ')))
    camera.updateMatrixWorld(true)

    // The lamp head follows the pointer a little: it aims where the pointer's ray meets the desk.
    origin.setFromMatrixPosition(camera.matrixWorld)
    if (hover) ray.set(pointer.nx, pointer.ny, 0.5).unproject(camera).sub(origin).normalize()
    if (hover && ray.y < -0.02) {
      const t = (0.75 - origin.y) / ray.y
      aim.copy(origin).addScaledVector(ray, t).sub(lampPosition).normalize()
      aim.lerp(LAMP_REST, ROOM_TUNING.lamp.pull).normalize()
    } else aim.copy(LAMP_REST)
    headTarget.setFromUnitVectors(LAMP_REST, aim)
    headQuaternion.slerp(headTarget, 1 - Math.exp(-dt * ROOM_TUNING.lamp.rate))
    head.quaternion.copy(headQuaternion)
    const flicker = 1 + 0.025 * Math.sin(seconds * 3.1) * Math.sin(seconds * 1.3)
    scratch.copy(LAMP_REST).applyQuaternion(headQuaternion)
    LP[6]!.set(
      lampPosition.x + scratch.x * 0.07,
      lampPosition.y + scratch.y * 0.07,
      lampPosition.z + scratch.z * 0.07,
      ROOM_TUNING.lamp.light * flicker,
    )
    LD[6]!.set(scratch.x, scratch.y, scratch.z, 3)
    scratch.copy(LAMP_SPOT).applyQuaternion(headQuaternion)
    LP[7]!.set(lampPosition.x, lampPosition.y, lampPosition.z, ROOM_TUNING.lamp.spot * flicker)
    LD[7]!.set(scratch.x, scratch.y, scratch.z, 3)
    litUniforms.uT.value = seconds

    // The chair turns a little as the pointer passes it.
    let push = 0
    if (hover) {
      scratch.set(0, 0.7, -0.85).project(camera)
      const dx = (pointer.nx - scratch.x) * camera.aspect
      const dy = pointer.ny - scratch.y
      const { maxMovePx, push: gain, reach } = ROOM_TUNING.chair
      push =
        Math.min(maxMovePx, Math.max(-maxMovePx, pointer.dx)) *
        gain *
        Math.exp(-(dx * dx + dy * dy) / reach)
    }
    stepChair(swivel, push, dt)
    chair.rotation.y = swivel.yaw
  }

  return {
    scene,
    camera,
    update,
    resize(width, height) {
      const aspect = width / height
      portrait = isPortrait(aspect)
      camera.aspect = aspect
      camera.fov = fovFor(aspect)
      camera.updateProjectionMatrix()
    },
    setStill: (place, image, focalPoint) =>
      paintCell(place, image, image.width, image.height, focalPoint),
    setFrame: (place, video, focalPoint) =>
      paintCell(place, video, video.videoWidth, video.videoHeight, focalPoint),
    screenCentres: screenCentre,
    dispose() {
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      textures.forEach((t) => t.dispose())
    },
  }
}
