// Shader-level surface finishes used in fine watchmaking, injected into
// MeshPhysicalMaterial via onBeforeCompile. Everything is evaluated per pixel
// from object-space position, so no UVs or textures are needed:
//   circular  – circular graining on wheels (anisotropic, concentric)
//   sunburst  – radial brushing (ratchet / crown wheel)
//   cotes     – Côtes de Genève stripes on bridges (scalloped normals)
//   perlage   – overlapping circular graining spots on the main plate
// Bevelled edges (anglage) are detected from the local normal and rendered
// as mirror-polished chamfers.
import * as THREE from 'three';

const COMMON = /* glsl */ `
varying vec3 vLocalPos;
varying vec3 vLocalNormal;
uniform mat4 modelViewMatrix;
uniform float uFinishScale;
uniform float uCotesAngle;
float fHash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
`;

const PERTURB = {
  circular: '',
  sunburst: '',
  perlage: '',
  cotes: /* glsl */ `
  {
    vec3 ln = normalize(vLocalNormal);
    if (ln.z > 0.97) {
      vec2 dir = vec2(cos(uCotesAngle), sin(uCotesAngle));
      vec2 perp = vec2(-dir.y, dir.x);
      float s = dot(vLocalPos.xy, perp) / (0.055 * uFinishScale);
      float f = fract(s) - 0.5;
      // each stripe is a shallow cylindrical scallop -> normal sweeps across it
      vec3 pl = vec3(perp * (f * 0.22), 0.0);
      normal = normalize(normal + mat3(modelViewMatrix) * pl);
    }
  }`,
};

const TANGENT = {
  circular: /* glsl */ `
    vec2 q = vLocalPos.xy;
    tLocal = vec3(-q.y, q.x, 0.0);
    float ring = floor(length(q) * 140.0 / uFinishScale);
    rough *= 0.82 + 0.36 * fHash(vec2(ring, 3.1));
  `,
  sunburst: /* glsl */ `
    vec2 q = vLocalPos.xy;
    tLocal = vec3(q, 0.0);
    float ang = atan(q.y, q.x);
    rough *= 0.8 + 0.4 * fHash(vec2(floor(ang * 180.0), 1.7));
  `,
  cotes: /* glsl */ `
    tLocal = vec3(cos(uCotesAngle), sin(uCotesAngle), 0.0);
  `,
  perlage: /* glsl */ `
    float S = 0.04 * uFinishScale;
    vec2 g = vLocalPos.xy / S;
    vec2 best = vec2(0.0); float bestId = -1e9;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = floor(g) + vec2(float(i), float(j));
      vec2 ctr = c + 0.5 + (vec2(fHash(c), fHash(c + 7.7)) - 0.5) * 0.25;
      float id = c.y * 1000.0 + c.x;
      if (length(g - ctr) < 0.86 && id > bestId) { bestId = id; best = ctr; }
    }
    vec2 d = g - best;
    tLocal = vec3(-d.y, d.x, 0.0);
    rough *= 0.85 + 0.3 * fHash(best);
    rough = mix(rough, rough * 1.4, smoothstep(0.55, 0.86, length(d)));
  `,
};

/**
 * @param {THREE.MeshPhysicalMaterial} mat
 * @param {'circular'|'sunburst'|'cotes'|'perlage'} kind
 */
export function applyFinish(mat, kind, { scale = 1, cotesAngle = 0.6, aniso = 0.75, polishedEdges = true } = {}) {
  mat.anisotropy = aniso;
  mat.userData.finish = kind;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFinishScale = { value: scale };
    sh.uniforms.uCotesAngle = { value: cotesAngle };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;\nvarying vec3 vLocalNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;\nvLocalNormal = objectNormal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + PERTURB[kind])
      .replace('#include <lights_physical_fragment>', /* glsl */ `
#include <lights_physical_fragment>
#ifdef USE_ANISOTROPY
{
  vec3 tLocal = vec3(1.0, 0.0, 0.0);
  float rough = material.roughness;
  vec3 ln = normalize(vLocalNormal);
  ${TANGENT[kind]}
  float aniso = material.anisotropy;
  if (abs(ln.z) < 0.97) {
    ${polishedEdges ? `
    // anglage: chamfers / bevels are mirror polished, flanks vertically brushed
    if (abs(ln.z) > 0.12) { rough = 0.07; aniso = 0.0; }
    else { tLocal = vec3(0.0, 0.0, 1.0); aniso *= 0.5; }` : 'tLocal = vec3(0.0, 0.0, 1.0);'}
  }
  material.roughness = clamp(rough, 0.0525, 1.0);
  material.anisotropy = aniso;
  material.alphaT = mix(pow2(material.roughness), 1.0, pow2(aniso));
  vec3 T = mat3(modelViewMatrix) * tLocal;
  T = T - normal * dot(normal, T);
  T = length(T) > 1e-5 ? normalize(T) : normalize(cross(normal, vec3(0.0, 1.0, 0.0)) + 1e-4);
  material.anisotropyT = T;
  material.anisotropyB = cross(normal, T);
}
#endif
`);
  };
  mat.customProgramCacheKey = () => `finish-${kind}-${polishedEdges}`;
  return mat;
}
