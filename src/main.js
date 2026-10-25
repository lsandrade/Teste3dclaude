// TEMPVS — 12 s vertical cinematic of a floating mechanical watch.
// Rendering is fully deterministic: every visual is a pure function of time t,
// sampled from a paused GSAP master timeline plus procedural kinematics.
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { buildClock } from './clock.js';
import { createBackdrop, createParticles, DofShader, FinalShader } from './shaders.js';
import { createTypography } from './typography.js';

const gsap = window.gsap;
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
const DURATION = 12;
const W = 1080, H = 1920;
const scale = parseFloat(params.get('scale') || window.TEMPVS_SCALE || (CAPTURE ? '1' : '0.5'));
const RW = Math.round(W * scale), RH = Math.round(H * scale);

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: CAPTURE, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in FinalShader
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.transmissionResolutionScale = 0.75;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);

// ------------------------------------------------------------------ studio environment (lightformers -> PMREM)
function buildStudioEnv() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.004, 0.0045, 0.006), side: THREE.BackSide })));
  // soft-edged softbox texture (bright core, feathered rim) for natural reflections
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.abs(x / 127.5 - 1), v = Math.abs(y / 127.5 - 1);
    const d = Math.pow(Math.pow(u, 6) + Math.pow(v, 6), 1 / 6); // squircle
    const a = Math.max(0, Math.min(1, (1 - d) / 0.35));
    const val = Math.round(255 * a * a * (3 - 2 * a));
    const i = (y * 256 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const soft = new THREE.CanvasTexture(c);
  const panel = (w, h, color, k, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color).multiplyScalar(k), map: soft, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
    return m;
  };
  panel(9, 6, [1.0, 0.76, 0.52], 3.2, [-7, 8, 7]); // warm key softbox
  panel(1.0, 14, [0.38, 0.62, 1.0], 5.0, [9, 1, -6]); // blue rim strip
  panel(0.6, 14, [0.45, 0.65, 1.0], 2.5, [-10, 0, -5]); // second rim strip
  panel(14, 0.6, [1, 0.97, 0.92], 2.2, [0, 10, 1]); // overhead strip -> crisp line on polished edges
  panel(10, 1.2, [1.0, 0.85, 0.7], 0.5, [0, -4, 10]); // low front bounce
  panel(7, 4.5, [1.0, 0.9, 0.78], 0.9, [1.5, 4.5, 10]); // large frontal diffusion frame (camera side)
  panel(3, 3, [1.0, 0.8, 0.6], 1.4, [-5, -1, 8]); // warm kicker, low left
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.0, 0.1, 60).texture;
  pmrem.dispose();
  return tex;
}
scene.environment = buildStudioEnv();
scene.environmentIntensity = 1.0;

const backdrop = createBackdrop();
scene.add(backdrop);

// ------------------------------------------------------------------ lights
const key = new THREE.SpotLight(new THREE.Color(1.0, 0.8, 0.58), 130, 30, 0.38, 0.85, 2);
key.position.set(-4.2, 5.4, 6.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 4;
key.shadow.camera.far = 16;
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.006;
key.shadow.radius = 4;
scene.add(key, key.target);

const rim = new THREE.SpotLight(new THREE.Color(0.42, 0.66, 1.0), 260, 30, 0.42, 0.9, 2);
rim.position.set(5.2, 2.8, -5.6);
scene.add(rim, rim.target);

const rim2 = new THREE.SpotLight(new THREE.Color(0.5, 0.7, 1.0), 160, 30, 0.45, 0.9, 2);
rim2.position.set(-5.5, -1.5, -4.5);
scene.add(rim2, rim2.target);

const fill = new THREE.HemisphereLight(new THREE.Color(0.45, 0.5, 0.6), new THREE.Color(0.08, 0.06, 0.05), 0.12);
scene.add(fill);

const inner = new THREE.PointLight(new THREE.Color(1.0, 0.62, 0.3), 0, 2.5, 2);
scene.add(inner);

// ------------------------------------------------------------------ subject
const clock = buildClock();
const pivot = new THREE.Group(); // world placement + tilt
pivot.add(clock.root);
scene.add(pivot);

const particles = createParticles();
const particleScene = new THREE.Scene();
particleScene.add(particles);

// ------------------------------------------------------------------ render targets & passes
const rtScene = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
rtScene.depthTexture = new THREE.DepthTexture(RW, RH, THREE.FloatType);
const rtParticles = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, depthBuffer: false });
const rtComp = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, depthBuffer: false });

const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadGeo = new THREE.PlaneGeometry(2, 2);
const makeQuad = (shader) => {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(shader.uniforms), vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader, depthTest: false, depthWrite: false,
  });
  const m = new THREE.Mesh(quadGeo, mat);
  m.frustumCulled = false;
  const s = new THREE.Scene();
  s.add(m);
  return { scene: s, mat };
};
const dof = makeQuad(DofShader);
dof.mat.uniforms.tColor.value = rtScene.texture;
dof.mat.uniforms.tDepth.value = rtScene.depthTexture;
dof.mat.uniforms.tParticles.value = rtParticles.texture;
dof.mat.uniforms.uRes.value.set(RW, RH);
const fin = makeQuad(FinalShader);
fin.mat.uniforms.tColor.value = rtComp.texture;
fin.mat.uniforms.uRes.value.set(RW, RH);

const bloom = new UnrealBloomPass(new THREE.Vector2(RW, RH), 0.55, 0.65, 1.15);

const pu = particles.material.uniforms;
pu.uDepth.value = rtScene.depthTexture;
pu.uRes.value.set(RW, RH);
pu.uViewHeight.value = RH;
pu.uNear.value = camera.near;
pu.uFar.value = camera.far;
dof.mat.uniforms.uNear.value = camera.near;
dof.mat.uniforms.uFar.value = camera.far;

// ------------------------------------------------------------------ typography
const typo = createTypography(RW, RH);
fin.mat.uniforms.tText.value = typo.texture;

// ------------------------------------------------------------------ choreography (GSAP master timeline)
const S = {
  az: -0.32, el: 0.06, dist: 10.6, tx: 0.0, ty: 0.12, tz: 0.0, roll: 0.0,
  tilt: 0.0, yaw: 0.0, floatAmp: 1.0,
  focusBias: 0.0, coc: 70, maxCoc: 10,
  stream: 0.0, dust: 0.6, burst: 0.0, inner: 0.0, glow: 0.8,
  exposure: 1.0, fade: 0.0,
  title: 0.0, line: 0.0, tag: 0.0,
};
const tl = gsap.timeline({ paused: true, defaults: { ease: 'sine.inOut' } });

// 0–4 s — slow approach on the assembled watch, drifting toward the escapement
tl.to(S, { fade: 1, duration: 1.0, ease: 'power1.out' }, 0);
tl.to(S, { dist: 4.6, az: 0.2, el: 0.14, tx: -0.22, ty: -0.2, duration: 4.2, ease: 'power2.inOut' }, 0);
tl.to(S, { coc: 190, maxCoc: 16, duration: 3.6 }, 0.2);
tl.to(S, { dust: 1.0, duration: 3 }, 0);
// 4–8 s — the movement opens into floating layers (exploded view), camera rises
// yaw keeps the explode axis vertical on screen for the 3/4 camera (tan yaw ≈ sin|tilt|·tan az)
tl.to(S, { tilt: -0.98, yaw: 0.42, duration: 1.9, ease: 'power2.inOut' }, 3.5);
tl.to(S, { yaw: 0.57, duration: 2.4, ease: 'sine.inOut' }, 5.7);
tl.to(S, { dist: 11.2, az: 0.62, el: 0.22, tx: 0.0, ty: 0.2, duration: 2.6, ease: 'power2.inOut' }, 3.7);
tl.to(S, { az: 0.88, el: 0.27, dist: 9.9, ty: 0.22, duration: 2.3, ease: 'sine.inOut' }, 6.0);
tl.to(S, { coc: 95, maxCoc: 12, duration: 1.5 }, 3.8);
tl.to(S, { stream: 1, inner: 1.6, glow: 1.25, duration: 1.2, ease: 'power2.out' }, 4.25);
const layerOrder = ['bezel', 'dial', 'top', 'bridges', 'train', 'barrel', 'plate', 'back', 'case'];
layerOrder.forEach((name, i) => {
  tl.to(clock.layers[name].userData, { e: 1, duration: 2.1, ease: 'power3.inOut' }, 4.0 + i * 0.09);
});
// reassembly: outermost layers close first so nothing sweeps across the lens
const closeOrder = ['bezel', 'back', 'dial', 'plate', 'top', 'barrel', 'bridges', 'train', 'case'];
closeOrder.forEach((name, i) => {
  tl.to(clock.layers[name].userData, { e: 0, duration: 1.7 - i * 0.04, ease: 'power3.inOut' }, 7.85 + i * 0.08);
});
// 8–12 s — reassembly, orbit, typography
tl.to(S, { tilt: -0.1, yaw: -0.08, duration: 2.2, ease: 'power2.inOut' }, 7.9);
tl.to(S, { az: -0.45, el: 0.1, dist: 10.3, ty: -0.84, duration: 4.1, ease: 'power2.inOut' }, 7.9);
tl.to(S, { stream: 0.04, inner: 0.25, duration: 1.6 }, 8.4);
tl.to(S, { burst: 0.6, duration: 0.25, ease: 'power2.out' }, 9.75);
tl.to(S, { burst: 0, duration: 1.0, ease: 'power2.inOut' }, 10.0);
tl.to(S, { coc: 60, maxCoc: 9, duration: 2 }, 8.5);
tl.to(S, { title: 1, duration: 1.9, ease: 'none' }, 9.4);
tl.to(S, { line: 1, duration: 1.2, ease: 'power3.inOut' }, 10.1);
tl.to(S, { tag: 1, duration: 1.3, ease: 'none' }, 10.45);
tl.to(S, { exposure: 0.92, duration: 1.0 }, 11.0);
tl.set({}, {}, DURATION);

// ------------------------------------------------------------------ frame evaluation
const tmpV = new THREE.Vector3();
const focusTarget = new THREE.Vector3();

function evaluate(t) {
  tl.seek(t, false);

  // subject: gentle floating motion
  pivot.position.set(0, Math.sin(t * 0.9) * 0.035 * S.floatAmp, 0);
  pivot.rotation.set(S.tilt + Math.sin(t * 0.7) * 0.015, S.yaw + Math.sin(t * 0.5) * 0.02, Math.sin(t * 0.6) * 0.01);
  clock.update(t);

  // camera on a sphere around the look-at target
  const target = tmpV.set(S.tx, S.ty, S.tz);
  camera.position.set(
    target.x + S.dist * Math.sin(S.az) * Math.cos(S.el),
    target.y + S.dist * Math.sin(S.el),
    target.z + S.dist * Math.cos(S.az) * Math.cos(S.el),
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();
  scene.updateMatrixWorld();

  // focus: distance along view axis to the point of interest
  focusTarget.set(S.tx, S.ty, S.tz);
  if (t > 8.6) focusTarget.set(0, 0, 0); // after reassembly hold focus on the watch
  focusTarget.applyMatrix4(camera.matrixWorldInverse);
  const focus = Math.max(0.5, -focusTarget.z + S.focusBias);

  backdrop.material.uniforms.uFocusPoint.value.set(0, 0, 0);
  backdrop.material.uniforms.uGlow.value = S.glow;
  backdrop.position.copy(camera.position);

  inner.intensity = S.inner;
  inner.position.set(0, 0, 0).applyMatrix4(clock.root.matrixWorld);
  key.target.position.set(0, 0, 0);
  rim.target.position.set(0, 0, 0);
  rim2.target.position.set(0, 0, 0);

  pu.uTime.value = t;
  pu.uStream.value = S.stream;
  pu.uDust.value = S.dust;
  pu.uBurst.value = S.burst;
  pu.uClockMatrix.value.copy(clock.root.matrixWorld);
  pu.uFocus.value = focus;
  pu.uCocScale.value = S.coc * scale;
  pu.uMaxCoc.value = S.maxCoc * scale;

  const du = dof.mat.uniforms;
  du.uFocus.value = focus;
  du.uCocScale.value = S.coc * scale;
  du.uMaxCoc.value = S.maxCoc * scale;

  const fu = fin.mat.uniforms;
  fu.uExposure.value = S.exposure;
  fu.uFade.value = S.fade;
  fu.uFrame.value = Math.round(t * 30);

  typo.draw(S.title, S.line, S.tag);
}

function render() {
  renderer.setRenderTarget(rtScene);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, camera);

  renderer.setRenderTarget(rtParticles);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(particleScene, camera);

  renderer.setRenderTarget(rtComp);
  renderer.render(dof.scene, quadCam);

  bloom.render(renderer, null, rtComp, 0, false);

  renderer.setRenderTarget(null);
  renderer.render(fin.scene, quadCam);
}

const DEBUG = params.get('debug'); // e.g. ?capture&debug=front  -> raw beauty, fixed camera
function renderAt(t) {
  evaluate(t);
  if (DEBUG) {
    const d = parseFloat(params.get('dist') || '3.2');
    camera.position.set(parseFloat(params.get('cx') || '0'), parseFloat(params.get('cy') || '0'), d);
    camera.lookAt(parseFloat(params.get('cx') || '0'), parseFloat(params.get('cy') || '0'), 0);
    camera.updateMatrixWorld();
    if (params.has('flat')) pivot.rotation.set(0, 0, 0);
    scene.updateMatrixWorld();
    dof.mat.uniforms.uMaxCoc.value = 0;
    pu.uMaxCoc.value = 0;
  }
  render();
}

// ------------------------------------------------------------------ boot
window.__DURATION = DURATION;
window.renderAt = (t) => { renderAt(t); return true; };
window.ready = (async () => {
  await typo.ready;
  renderAt(0);
  renderer.getContext().finish();
  return true;
})();

if (!CAPTURE) {
  const start = performance.now();
  const hud = document.getElementById('hud');
  let paused = false, pauseAt = 0, offset = 0;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      paused = !paused;
      if (paused) pauseAt = ((performance.now() - start) / 1000 + offset) % DURATION;
      else offset = pauseAt - (performance.now() - start) / 1000;
    }
  });
  const loop = () => {
    // skip work while the canvas is hidden (e.g. embedded page showing the video)
    if (canvas.offsetParent === null) { requestAnimationFrame(loop); return; }
    const t = paused ? pauseAt : (((performance.now() - start) / 1000 + offset) % DURATION + DURATION) % DURATION;
    renderAt(t);
    if (hud) hud.textContent = `${t.toFixed(2)} s`;
    requestAnimationFrame(loop);
  };
  window.ready.then(() => requestAnimationFrame(loop));
}
