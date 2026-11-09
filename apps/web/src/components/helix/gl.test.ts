import { describe, expect, it } from 'vitest'

import { HelixUnavailable, link } from './gl'

/** The slice of a WebGL2 context `link` uses, failing the compile of `failing` or the link. */
function fakeGl(failing: 'vertex' | 'fragment' | 'link' | null, log: string) {
  const VERTEX_SHADER = 1
  const FRAGMENT_SHADER = 2
  const kinds = new Map<object, number>()
  const gl = {
    VERTEX_SHADER,
    FRAGMENT_SHADER,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    createShader(type: number) {
      const shader = {}
      kinds.set(shader, type)
      return shader
    },
    createProgram: () => ({}),
    shaderSource() {},
    compileShader() {},
    attachShader() {},
    bindAttribLocation() {},
    linkProgram() {},
    deleteShader() {},
    isContextLost: () => false,
    getShaderParameter: (shader: object) =>
      !(
        (failing === 'vertex' && kinds.get(shader) === VERTEX_SHADER) ||
        (failing === 'fragment' && kinds.get(shader) === FRAGMENT_SHADER)
      ),
    getShaderInfoLog: () => log,
    getProgramParameter: () => failing !== 'link',
    getProgramInfoLog: () => log,
  }
  return gl as unknown as WebGL2RenderingContext
}

const attempt = (gl: WebGL2RenderingContext) => () =>
  link(gl, 'card', 'vertex source', 'fragment source')

describe('link', () => {
  it('returns the program when both shaders compile and it links', () => {
    expect(attempt(fakeGl(null, ''))).not.toThrow()
  })

  it('throws HelixUnavailable with the compile log and the stage that failed', () => {
    const log = "ERROR: 0:12: 'vUv' : undeclared identifier"
    for (const stage of ['vertex', 'fragment'] as const) {
      const run = attempt(fakeGl(stage, log))
      expect(run).toThrow(HelixUnavailable)
      expect(run).toThrow(log)
      expect(run).toThrow(new RegExp(stage))
    }
  })

  it('names the program in a compile failure, stage included', () => {
    const run = attempt(fakeGl('fragment', 'log'))
    expect(run).toThrow('Shader card (fragment): log')
    expect(attempt(fakeGl('vertex', 'log'))).toThrow('Shader card (vertex): log')
  })

  it('throws HelixUnavailable with the link log', () => {
    const log = 'ERROR: varying vDepth is not written by the vertex shader'
    const run = attempt(fakeGl('link', log))
    expect(run).toThrow(HelixUnavailable)
    expect(run).toThrow(log)
  })

  it('names the program in a link failure', () => {
    expect(attempt(fakeGl('link', 'log'))).toThrow('Program card: log')
  })
})
