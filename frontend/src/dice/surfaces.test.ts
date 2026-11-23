import { DIE_STYLES } from './styles'
import * as THREE from 'three'
import { applyDieShader, SURFACE_KINDS, surfaceChunks } from './surfaces'

describe('dice styles', () => {
  it('lists each style once, Cobblestone and Sanded glass taken out, the six metals in', () => {
    const keys = DIE_STYLES.map(([k]) => k)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).not.toContain('cobble')
    expect(keys).not.toContain('sanded_glass')
    for (const k of ['metal_matte', 'metal_satin', 'metal_polished', 'metal_hammered', 'metal', 'metal_rusted', 'carbon', 'amber', 'crystal', 'charoite', 'iridescent', 'hellish', 'aristocrat', 'guild', 'fire']) {
      expect(keys).toContain(k)
    }
    expect(DIE_STYLES.find(([k]) => k === 'metal')?.[1]).toBe('Brushed metal') // the first Metal's pickers keep a metal
  })
  it('groups the styles by context: each group together, once', () => {
    const groups = DIE_STYLES.map(([, , , g]) => g)
    const runs = groups.filter((g, i) => g !== groups[i - 1])
    expect(new Set(runs).size).toBe(runs.length)
    expect(groups[DIE_STYLES.findIndex(([k]) => k === 'elven')]).toBe(groups[DIE_STYLES.findIndex(([k]) => k === 'gnomish')])
  })
})

describe('continuous surfaces', () => {
  it.each(SURFACE_KINDS)('%s: one relief and one look, applied before the lighting', (kind) => {
    const { pars, apply } = surfaceChunks(kind)
    expect(pars.match(/vec3 sShape\(vec3 p, vec3 n\)/g)).toHaveLength(1)
    expect(pars.match(/void sLook\(/g)).toHaveLength(1)
    expect(apply).toContain('sShape(sp, sn)')
    // The numbers keep their own colour, stay solid, matte and flat
    expect(apply).toMatch(/mix\(col, diffuseColor\.rgb, ink\)/)
    expect(apply).toMatch(/mix\(alpha, 1\.0, ink\)/)
    expect(apply).toMatch(/mix\(rough, 1\.0, ink\)/)
    expect(apply).toMatch(/\(1\.0 - ink\)/)
  })
})

describe('every die\'s shader', () => {
  const compile = (surface?: Parameters<typeof applyDieShader>[2]) => {
    const material = new THREE.MeshPhysicalMaterial()
    applyDieShader(material, new THREE.Texture(), surface, new THREE.Vector3(0, 1, 0))
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\nvoid main() {\n#include <lights_physical_fragment>\n#include <opaque_fragment>\n}',
    }
    material.onBeforeCompile(shader as never, {} as never)
    return { material, shader }
  }
  it.each([undefined, { kind: 'hellish' as const, colors: ['#000000'] }])('takes the numbers out of every highlight (%o)', (surface) => {
    const { shader } = compile(surface)
    const after = shader.fragmentShader.split('#include <lights_physical_fragment>')[1]
    expect(after).toContain('material.specularColor *= 1.0 - numberMask')
    expect(after).toContain('material.specularF90 *= 1.0 - numberMask')
    expect(shader.uniforms.uInk).toBeDefined()
    // An outline darkens what's under it by half, at the very end (not a painted line)
    const end = shader.fragmentShader.split('#include <opaque_fragment>')[0].split('material.specularF90')[1]
    expect(end).toContain('outgoingLight *= 1.0 - 0.5 * outlineTex.b * (1.0 - outlineTex.g)')
  })
  it('compiles one program per surface kind, the colours as uniforms', () => {
    expect(compile({ kind: 'jelly', colors: ['#ff0000'] }).material.customProgramCacheKey()).toBe('die-jelly')
    expect(compile({ kind: 'jelly', colors: ['#00ff00'] }).material.customProgramCacheKey()).toBe('die-jelly')
    expect(compile().material.customProgramCacheKey()).toBe('die-painted')
    expect(compile({ kind: 'amber', colors: ['#ff0000'], alpha: 0.6 }).material.transparent).toBe(true)
  })
})
