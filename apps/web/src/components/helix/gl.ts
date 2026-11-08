/** WebGL2 isn't there, a shader didn't compile, or the context was lost: show the static Home. */
export class HelixUnavailable extends Error {}

/** The drawing buffers and the Showreel's textures are sized for at most this device pixel ratio. */
export const MAX_PIXEL_RATIO = 2

/** A number as a GLSL float literal. */
export const float = (value: number) => value.toFixed(4)

/** A full-screen pass's vertex shader: the unit square over the whole target, `vUv` across it. */
export const QUAD_VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new HelixUnavailable('No shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    throw new HelixUnavailable(`Shader: ${gl.getShaderInfoLog(shader) ?? ''}`)
  }
  return shader
}

/** A linked program, its vertex position attribute `aPos` at location 0. */
export function link(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const program = gl.createProgram()
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource)
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.bindAttribLocation(program, 0, 'aPos')
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new HelixUnavailable(`Program: ${gl.getProgramInfoLog(program) ?? ''}`)
  }
  return program
}

/** The locations of a program's uniforms, by name. */
export function uniforms<Name extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly Name[],
): Record<Name, WebGLUniformLocation | null> {
  return Object.fromEntries(
    names.map((name) => [name, gl.getUniformLocation(program, name)]),
  ) as Record<Name, WebGLUniformLocation | null>
}

/** A vertex array holding `vertices` (x, y pairs) at attribute location 0. */
export function vertexArray(gl: WebGL2RenderingContext, vertices: Float32Array) {
  const array = gl.createVertexArray()
  const buffer = gl.createBuffer()
  gl.bindVertexArray(array)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  return {
    array,
    count: vertices.length / 2,
    destroy() {
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(array)
    },
  }
}

/** A texture holding a single colour (RGBA bytes), filtered linearly and clamped at the edges. */
export function colourTexture(gl: WebGL2RenderingContext, colour: Uint8Array): WebGLTexture {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, colour)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}

/**
 * Uploads an image or a video frame into `texture`, the right way up, with mipmaps (they shrink
 * a long way on the Helix). Throws if the browser refuses to let WebGL read it (no CORS).
 */
export function uploadPicture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  source: TexImageSource,
): void {
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  } finally {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  }
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
}

/**
 * The colour of a CSS custom property as RGBA bytes, resolved by the browser itself (a 2D canvas
 * converts any colour syntax), or null when it can't: never a silent black (playbook:
 * canvas-colours).
 */
export function cssColour(element: Element, property: string): Uint8Array | null {
  const value = getComputedStyle(element).getPropertyValue(property).trim()
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!value || !context) return null
  const sentinel = 'rgba(1, 2, 3, 0.5)'
  context.fillStyle = sentinel
  const before = context.fillStyle
  context.fillStyle = value
  if (context.fillStyle === before) return null
  context.fillRect(0, 0, 1, 1)
  return new Uint8Array(context.getImageData(0, 0, 1, 1).data)
}

/**
 * A screen-sized texture a pass draws into, for a later pass to read. Drawn multisampled where the
 * device allows (the cards' edges stay smooth, as they were on the canvas itself), then resolved
 * into the texture. Colour is premultiplied by alpha, as the canvas is. With `meta`, the pass
 * draws a second picture alongside (its second output), resolved into `meta` and read as it is;
 * with `mipmaps`, `texture` gets them on every resolve, so a later pass can read it blurred.
 */
export type Target = {
  readonly texture: WebGLTexture
  /** The second picture, when the target has one. */
  readonly meta: WebGLTexture | null
  /** Draws into it from now on (the viewport is the caller's). */
  bind(): void
  /** Makes what was drawn readable from `texture` (and `meta`). */
  resolve(): void
  resize(width: number, height: number): void
  destroy(): void
}

const MAX_SAMPLES = 4

function screenTexture(gl: WebGL2RenderingContext, mipmaps: boolean): WebGLTexture {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}

export function createTarget(
  gl: WebGL2RenderingContext,
  { depth, meta = false, mipmaps = false }: { depth: boolean; meta?: boolean; mipmaps?: boolean },
): Target {
  // Where the pass's pictures end up: textures, plus depth when drawn without multisampling.
  const texture = screenTexture(gl, mipmaps)
  const metaTexture = meta ? screenTexture(gl, false) : null
  const textures = metaTexture ? [texture, metaTexture] : [texture]
  const outputs = textures.map((_, index) => gl.COLOR_ATTACHMENT0 + index)
  const resolved = gl.createFramebuffer()
  const plainDepth = depth ? gl.createRenderbuffer() : null
  // Where the pass draws when multisampling: colour and depth renderbuffers, resolved by a blit.
  let samples = Math.min(MAX_SAMPLES, gl.getParameter(gl.MAX_SAMPLES) as number)
  const multisampled = gl.createFramebuffer()
  const sampledColours = textures.map(() => gl.createRenderbuffer())
  const sampledDepth = depth ? gl.createRenderbuffer() : null
  let width = 0
  let height = 0

  const complete = (framebuffer: WebGLFramebuffer) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return status === gl.FRAMEBUFFER_COMPLETE || gl.isContextLost()
  }

  const storage = (buffer: WebGLRenderbuffer, format: number, count: number) => {
    gl.bindRenderbuffer(gl.RENDERBUFFER, buffer)
    if (count > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, count, format, width, height)
    else gl.renderbufferStorage(gl.RENDERBUFFER, format, width, height)
    gl.bindRenderbuffer(gl.RENDERBUFFER, null)
  }

  return {
    texture,
    meta: metaTexture,

    bind() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, samples > 1 ? multisampled : resolved)
    },

    resolve() {
      if (samples > 1) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, multisampled)
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolved)
        // One blit per picture: each reads one output and writes only its own.
        for (const [index, output] of outputs.entries()) {
          gl.readBuffer(output)
          gl.drawBuffers(outputs.map((each, other) => (other === index ? each : gl.NONE)))
          gl.blitFramebuffer(
            0,
            0,
            width,
            height,
            0,
            0,
            width,
            height,
            gl.COLOR_BUFFER_BIT,
            gl.NEAREST,
          )
        }
        gl.drawBuffers(outputs)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      }
      if (!mipmaps) return
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.bindTexture(gl.TEXTURE_2D, null)
    },

    resize(nextWidth, nextHeight) {
      width = nextWidth
      height = nextHeight
      gl.bindFramebuffer(gl.FRAMEBUFFER, resolved)
      for (const [index, each] of textures.entries()) {
        gl.bindTexture(gl.TEXTURE_2D, each)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        // Complete from the start, even before anything is drawn into it (a target a frame skips).
        if (mipmaps && each === texture) gl.generateMipmap(gl.TEXTURE_2D)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, outputs[index]!, gl.TEXTURE_2D, each, 0)
      }
      gl.drawBuffers(outputs)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)

      if (samples > 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, multisampled)
        for (const [index, each] of sampledColours.entries()) {
          storage(each, gl.RGBA8, samples)
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, outputs[index]!, gl.RENDERBUFFER, each)
        }
        gl.drawBuffers(outputs)
        if (sampledDepth) {
          storage(sampledDepth, gl.DEPTH_COMPONENT24, samples)
          gl.framebufferRenderbuffer(
            gl.FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.RENDERBUFFER,
            sampledDepth,
          )
        }
        // A device that can't multisample this after all draws without it: rougher edges only.
        if (!complete(multisampled)) samples = 1
      }

      if (plainDepth && samples <= 1) {
        storage(plainDepth, gl.DEPTH_COMPONENT24, 1)
        gl.bindFramebuffer(gl.FRAMEBUFFER, resolved)
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, plainDepth)
      }
      if (!complete(resolved)) throw new HelixUnavailable('Framebuffer incomplete')
    },

    destroy() {
      for (const each of textures) gl.deleteTexture(each)
      gl.deleteFramebuffer(resolved)
      gl.deleteFramebuffer(multisampled)
      for (const each of sampledColours) gl.deleteRenderbuffer(each)
      if (plainDepth) gl.deleteRenderbuffer(plainDepth)
      if (sampledDepth) gl.deleteRenderbuffer(sampledDepth)
    },
  }
}
