// GLSL for the backdrop, particles, depth of field and final grade.
import * as THREE from 'three';

// ------------------------------------------------------------------ backdrop
export function createBackdrop() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: true,
    uniforms: {
      uFocusPoint: { value: new THREE.Vector3() },
      uWarm: { value: new THREE.Color(0.055, 0.036, 0.022) },
      uCool: { value: new THREE.Color(0.006, 0.014, 0.032) },
      uBase: { value: new THREE.Color(0.0035, 0.004, 0.006) },
      uGlow: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFocusPoint, uWarm, uCool, uBase;
      uniform float uGlow;
      varying vec3 vWorld;
      void main(){
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 toC = normalize(uFocusPoint - cameraPosition);
        float c = max(dot(d, toC), 0.0);
        float halo = pow(c, 18.0) * 0.9 + pow(c, 5.0) * 0.35;
        // cool haze on the rim-light side, falling off downward
        float rim = pow(max(dot(d, normalize(vec3(0.8, 0.35, -0.5))), 0.0), 3.0);
        float floorDark = smoothstep(0.2, -0.6, d.y);
        vec3 col = uBase + uWarm * halo * uGlow + uCool * rim * 1.6;
        col *= 1.0 - 0.6 * floorDark;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(40, 64, 32), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// ------------------------------------------------------------------ particles
// mulberry32 – deterministic seeds
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createParticles({ streamCount = 1100, dustCount = 700 } = {}) {
  const n = streamCount + dustCount;
  const seed = new Float32Array(n * 4);
  const type = new Float32Array(n);
  const pos = new Float32Array(n * 3);
  const r = rng(1337);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = r();
    type[i] = i < streamCount ? 1 : 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aType', new THREE.BufferAttribute(type, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uStream: { value: 0 },
      uDust: { value: 1 },
      uBurst: { value: 0 },
      uClockMatrix: { value: new THREE.Matrix4() },
      uFocus: { value: 6 },
      uCocScale: { value: 150 },
      uMaxCoc: { value: 18 },
      uViewHeight: { value: 1920 },
      uDepth: { value: null },
      uRes: { value: new THREE.Vector2(1080, 1920) },
      uNear: { value: 0.1 },
      uFar: { value: 100 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      attribute float aType;
      uniform float uTime, uStream, uDust, uBurst, uFocus, uCocScale, uMaxCoc, uViewHeight;
      uniform mat4 uClockMatrix;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vDepth;
      varying float vSharp;
      const float TAU = 6.28318530718;
      vec3 flowNoise(vec3 p, float t){
        return vec3(
          sin(p.y*1.7 + t*0.9 + sin(p.z*1.3 + t*0.4)),
          sin(p.z*1.9 - t*0.7 + sin(p.x*1.1 - t*0.5)),
          sin(p.x*1.5 + t*0.6 + sin(p.y*1.7 + t*0.3)));
      }
      void main(){
        vec3 wp; float intensity; float size;
        vec3 gold = vec3(1.0, 0.5, 0.17);
        vec3 cyan = vec3(0.35, 0.68, 1.0);
        if (aType > 0.5) {
          // stream: helical flow along the clock axis, threading through the layers
          float speed = 0.07 + 0.06 * aSeed.w;
          float u = fract(aSeed.x + uTime * speed);
          float rad = mix(0.12, 1.05, pow(aSeed.y, 0.7));
          float dir = aSeed.w > 0.5 ? 1.0 : -1.0;
          float ang = aSeed.z * TAU + dir * u * (2.0 + 2.5 * aSeed.y);
          float z = mix(-2.4, 2.8, u);
          vec3 lp = vec3(cos(ang) * rad, sin(ang) * rad, z);
          lp += 0.06 * flowNoise(lp * 2.0 + aSeed.xyz * 10.0, uTime);
          // burst: momentary outward push when the movement snaps shut
          lp.xy *= 1.0 + uBurst * (0.35 + 0.5 * aSeed.x);
          wp = (uClockMatrix * vec4(lp, 1.0)).xyz;
          float ends = smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.8, u);
          intensity = ends * (uStream + uBurst * 0.6) * (0.25 + 1.5 * pow(aSeed.x, 4.0));
          vColor = mix(gold, cyan, step(0.82, fract(aSeed.y * 7.31)));
          size = 0.013 + 0.02 * aSeed.z * aSeed.z;
        } else {
          // ambient dust: slow drift in a volume around the subject
          vec3 base = (aSeed.xyz - 0.5) * vec3(7.0, 10.0, 7.0);
          base.y = mod(base.y + uTime * (0.05 + 0.08 * aSeed.w) + 5.0, 10.0) - 5.0;
          wp = base + 0.25 * flowNoise(base * 0.5, uTime * 0.3 + aSeed.w * 10.0);
          intensity = uDust * (0.06 + 0.2 * aSeed.w * aSeed.w);
          vColor = mix(gold, vec3(0.9, 0.85, 0.8), 0.5);
          size = 0.008 + 0.01 * aSeed.w;
        }
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        float depth = -mv.z;
        gl_Position = projectionMatrix * mv;
        float px = size * projectionMatrix[1][1] * uViewHeight * 0.5 / max(depth, 0.05);
        float coc = clamp(abs(1.0 / uFocus - 1.0 / max(depth, 0.05)) * uCocScale, 0.0, uMaxCoc * 1.6);
        float s = max(px, 1.0) + coc * 2.0;
        gl_PointSize = min(s, 96.0);
        // energy conservation: blurred particles spread their light
        vAlpha = intensity * min(1.0, (px * px + 1.0) / (s * s)) * (0.6 + 0.4 * min(px, 1.0)) * 3.2;
        vSharp = clamp(px / s, 0.0, 1.0);
        vDepth = depth;
        if (depth < 0.2) vAlpha = 0.0;
      }`,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform sampler2D uDepth;
      uniform vec2 uRes;
      uniform float uNear, uFar;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vDepth;
      varying float vSharp;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        if (r > 1.0) discard;
        // sharp: gaussian core; defocused: flat bokeh disc with a slightly bright rim
        float core = exp(-r * r * 5.0);
        float disc = smoothstep(1.0, 0.86, r) * (0.75 + 0.25 * smoothstep(0.5, 0.95, r));
        float shape = mix(disc, core, vSharp);
        float sceneZ = -perspectiveDepthToViewZ(texture2D(uDepth, gl_FragCoord.xy / uRes).x, uNear, uFar);
        float occl = smoothstep(-0.02, 0.06, sceneZ - vDepth);
        gl_FragColor = vec4(vColor * vAlpha * shape * occl, 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ------------------------------------------------------------------ depth of field
// Single-pass scatter-as-gather bokeh (golden-angle spiral), after D. Gustafsson.
export const DofShader = {
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    tParticles: { value: null },
    uRes: { value: new THREE.Vector2() },
    uNear: { value: 0.1 },
    uFar: { value: 100 },
    uFocus: { value: 6 },
    uCocScale: { value: 150 },
    uMaxCoc: { value: 16 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tColor, tDepth, tParticles;
    uniform vec2 uRes;
    uniform float uNear, uFar, uFocus, uCocScale, uMaxCoc;
    varying vec2 vUv;
    const float GOLDEN = 2.39996323;
    const float RAD_SCALE = 1.25;
    float linDepth(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    float coc(float z){ return clamp(abs(1.0 / uFocus - 1.0 / z) * uCocScale, 0.0, uMaxCoc); }
    void main(){
      vec2 px = 1.0 / uRes;
      float cz = linDepth(vUv);
      float cs = coc(cz);
      vec3 col = min(texture2D(tColor, vUv).rgb, vec3(24.0));
      float tot = 1.0;
      float radius = RAD_SCALE;
      float ang = 0.0;
      for (int i = 0; i < 160; i++) {
        if (radius >= uMaxCoc) break;
        vec2 tc = vUv + vec2(cos(ang), sin(ang)) * px * radius;
        vec3 sc = min(texture2D(tColor, tc).rgb, vec3(24.0));
        float sz = linDepth(tc);
        float ss = coc(sz);
        if (sz > cz) ss = clamp(ss, 0.0, cs * 2.0);
        float m = smoothstep(radius - 0.5, radius + 0.5, ss);
        col += mix(col / tot, sc, m);
        tot += 1.0;
        radius += RAD_SCALE / radius;
        ang += GOLDEN;
      }
      col /= tot;
      col += texture2D(tParticles, vUv).rgb;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// ------------------------------------------------------------------ final grade
export const FinalShader = {
  uniforms: {
    tColor: { value: null },
    tText: { value: null },
    uRes: { value: new THREE.Vector2() },
    uExposure: { value: 1.0 },
    uFade: { value: 1.0 },
    uFrame: { value: 0 },
    uGrain: { value: 0.035 },
    uCA: { value: 0.0018 },
    uVignette: { value: 0.55 },
  },
  vertexShader: DofShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tColor, tText;
    uniform vec2 uRes;
    uniform float uExposure, uFade, uFrame, uGrain, uCA, uVignette;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 ACES(vec3 color){
      const mat3 ACESInputMat = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
      const mat3 ACESOutputMat = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
      color = ACESInputMat * color;
      color = RRTAndODTFit(color);
      color = ACESOutputMat * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d * vec2(0.5625, 1.0), d * vec2(0.5625, 1.0));
      // lateral chromatic aberration, stronger toward the frame edges
      vec2 off = d * uCA * (0.3 + 4.0 * r2);
      vec3 col;
      col.r = texture2D(tColor, vUv + off).r;
      col.g = texture2D(tColor, vUv).g;
      col.b = texture2D(tColor, vUv - off).b;
      col *= uExposure;
      // cinematic split-tone in scene-linear: cool shadows, warm highlights
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(0.92, 0.98, 1.12), smoothstep(0.25, 0.0, l) * 0.6);
      col = mix(col, col * vec3(1.06, 1.0, 0.92), smoothstep(0.3, 2.0, l) * 0.5);
      col = ACES(col * 1.15);
      // vignette (optical falloff, elliptical for portrait)
      float v = smoothstep(0.75, 0.05, r2 * 2.2 * uVignette + 0.08);
      col *= mix(0.35, 1.0, v);
      col = toSRGB(col);
      // typography (premultiplied, already sRGB)
      vec4 tx = texture2D(tText, vUv);
      col = col * (1.0 - tx.a) + tx.rgb;
      // fade
      col *= uFade;
      // film grain (deterministic per frame) + dithering
      float g = hash(gl_FragCoord.xy + fract(uFrame * 0.6180339) * 917.0) - 0.5;
      float lum = dot(col, vec3(0.333));
      col += g * uGrain * (1.0 - 0.6 * lum);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
