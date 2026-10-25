// X Bot arena — small third-person demo: a Mixamo character you walk around
// with keyboard or touch, blending Mixamo clips (idle / walk / run, additive
// sneak + gestures) plus a samba retargeted from another Mixamo rig.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const isTouch = matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const FOG = new THREE.Color(0x0e1626);
scene.fog = new THREE.Fog(FOG, 18, 46);
scene.background = FOG;

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);

// sky dome with a soft horizon glow
{
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x060a14) }, horizon: { value: new THREE.Color(0x24385e) }, glow: { value: new THREE.Color(0xff9a5c) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `uniform vec3 top, horizon, glow; varying vec3 vP;
        void main(){ vec3 d = normalize(vP); float h = clamp(d.y, -0.2, 1.0);
          vec3 c = mix(horizon, top, smoothstep(0.0, 0.6, h));
          c += glow * pow(max(0.0, 1.0 - abs(h) * 4.0), 3.0) * 0.25 * (0.6 + 0.4 * max(0.0, d.x));
          gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  scene.add(sky);
}

scene.add(new THREE.HemisphereLight(0x9fb7ff, 0x2a1d18, 1.1));
const sun = new THREE.DirectionalLight(0xffe2c4, 2.6);
sun.position.set(6, 12, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -12; sc.right = sc.top = 12; sc.near = 1; sc.far = 40;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const rimLight = new THREE.DirectionalLight(0x5fa8ff, 1.2);
rimLight.position.set(-8, 5, -10);
scene.add(rimLight);

// ------------------------------------------------------------------ arena
const ARENA_R = 15;
const obstacles = []; // { x, z, r } circles or { x, z, hx, hz } boxes in XZ

{
  // floor: tiled grid with glowing seams and a ring boundary
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_R + 0.6, 96),
    new THREE.ShaderMaterial({
      lights: true, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog, { uR: { value: ARENA_R } }]),
      vertexShader: `
        #include <common>
        #include <fog_pars_vertex>
        #include <shadowmap_pars_vertex>
        varying vec3 vW;
        void main(){
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vW = worldPosition.xyz;
          vec3 transformedNormal = normalMatrix * vec3(0.0, 0.0, 1.0);
          vec4 mvPosition = viewMatrix * worldPosition;
          gl_Position = projectionMatrix * mvPosition;
          #include <shadowmap_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <packing>
        #include <fog_pars_fragment>
        #include <bsdfs>
        #include <lights_pars_begin>
        #include <shadowmap_pars_fragment>
        #include <shadowmask_pars_fragment>
        uniform float uR;
        varying vec3 vW;
        void main(){
          vec2 p = vW.xz;
          float r = length(p);
          vec2 g = abs(fract(p / 2.0) - 0.5);
          float seam = 1.0 - smoothstep(0.0, 0.03, min(g.x, g.y));
          vec2 cell = floor(p / 2.0);
          float tone = 0.9 + 0.1 * fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 base = vec3(0.13, 0.15, 0.2) * tone;
          float ring = smoothstep(0.08, 0.0, abs(r - uR)) + 0.5 * smoothstep(0.05, 0.0, abs(r - uR + 0.5));
          float center = smoothstep(0.06, 0.0, abs(r - 2.5)) * 0.6;
          float sh = getShadowMask();
          vec3 col = base * (0.35 + 0.75 * sh);
          col += vec3(0.25, 0.55, 1.0) * seam * 0.12 * smoothstep(uR, 0.0, r);
          col += vec3(1.0, 0.55, 0.25) * (ring + center) * 1.6;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // under-rim so the platform reads as a floating disc
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_R + 0.6, ARENA_R - 1.5, 1.2, 96, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1b2232, roughness: 0.6, metalness: 0.4 }),
  );
  rim.position.y = -0.6;
  scene.add(rim);

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x3a4660, roughness: 0.55, metalness: 0.3 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xff8f4a, emissive: 0xff7a30, emissiveIntensity: 1.4, roughness: 0.4 });
  const crate = (x, z, s, rot = 0) => {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    box.castShadow = box.receiveShadow = true;
    g.add(box);
    const band = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, s * 0.06, s * 1.02), trimMat);
    band.position.y = s * 0.3;
    g.add(band);
    g.position.set(x, s / 2, z);
    g.rotation.y = rot;
    scene.add(g);
    obstacles.push({ x, z, r: s * 0.68 });
  };
  crate(4, -3, 1.4, 0.3); crate(5.2, -1.8, 0.9, 0.8); crate(-6, 4, 1.6, 0.1); crate(-3.5, -7, 1.2, 0.5);
  crate(8.5, 5, 1.3, 1.1); crate(-9, -3, 1.0, 0.4); crate(1.5, 8.5, 1.1, 0.9);

  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2b3448, roughness: 0.4, metalness: 0.6 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 11, z = Math.sin(a) * 11;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 4.5, 24), pillarMat);
    p.position.set(x, 2.25, z);
    p.castShadow = p.receiveShadow = true;
    scene.add(p);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 32), trimMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(x, 4.3, z);
    scene.add(cap);
    obstacles.push({ x, z, r: 0.75 });
  }
}

// collectible orbs
const orbs = [];
const orbGeo = new THREE.OctahedronGeometry(0.22, 0);
const orbMat = new THREE.MeshStandardMaterial({ color: 0x7fd4ff, emissive: 0x3fb4ff, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.1 });
let score = 0;
function placeOrb(orb) {
  for (let tries = 0; tries < 40; tries++) {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * (ARENA_R - 3);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + 0.6)) { orb.position.set(x, 0.9, z); return; }
  }
}
for (let i = 0; i < 8; i++) {
  const m = new THREE.Mesh(orbGeo, orbMat);
  m.castShadow = true;
  placeOrb(m);
  m.userData.phase = Math.random() * 6;
  scene.add(m);
  orbs.push(m);
}
// pickup sparks
const sparks = new THREE.Points(
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(48 * 3), 3)),
  new THREE.PointsMaterial({ color: 0x9fe0ff, size: 0.12, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
);
sparks.userData = { t: 1, vel: new Float32Array(48 * 3) };
scene.add(sparks);
function burst(at) {
  const pos = sparks.geometry.attributes.position.array, v = sparks.userData.vel;
  for (let i = 0; i < 48; i++) {
    pos.set([at.x, at.y, at.z], i * 3);
    const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
    v.set([Math.cos(a) * Math.cos(e) * 3, Math.sin(e) * 4, Math.sin(a) * Math.cos(e) * 3], i * 3);
  }
  sparks.userData.t = 0;
}

// ------------------------------------------------------------------ character
const loader = new GLTFLoader();
// Models load from .glb; hosts that only serve web types get a base64 text copy,
// decoded here and parsed in memory so the loader makes no further requests.
async function loadModel(name) {
  try {
    const res = await fetch(`assets/models/${name}.glb`);
    if (res.ok) return await loader.parseAsync(await res.arrayBuffer(), '');
  } catch (e) { /* fall through */ }
  const res = await fetch(`assets/models/${name}.glb.b64.txt`);
  if (!res.ok) throw new Error(`modelo ${name} não encontrado (${res.status})`);
  const raw = atob((await res.text()).trim());
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return loader.parseAsync(bytes.buffer, '');
}
// The samba may ship pre-retargeted (assets/anim/samba.json); otherwise it is
// retargeted from the Michelle rig at load time.
async function loadSambaBaked() {
  try {
    const res = await fetch('assets/anim/samba.json');
    if (res.ok) return THREE.AnimationClip.parse(await res.json());
  } catch (e) { /* fall through */ }
  return null;
}
let xbot, michelle = null, sambaBaked = null;
try {
  [xbot, sambaBaked] = await Promise.all([loadModel('Xbot'), loadSambaBaked()]);
  if (!sambaBaked) michelle = await loadModel('Michelle');
} catch (e) {
  $('loading').textContent = `Não foi possível carregar o personagem: ${e.message}`;
  throw e;
}
const hero = xbot.scene;
hero.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
scene.add(hero);
const mixer = new THREE.AnimationMixer(hero);
const clips = Object.fromEntries(xbot.animations.map((c) => [c.name, c]));

/** Retarget a clip between two Mixamo rigs exported with different bone axes.
 *  The source is sampled frame by frame; for every bone the world-space rotation
 *  delta from its rest pose is re-applied to the matching X Bot bone's rest pose,
 *  then converted back to local space in hierarchy order. Hips translation is
 *  transferred as a world-space offset from rest. */
function retarget(clip, srcRoot, dstRoot, fps = 30) {
  const bonesOf = (root) => { const m = new Map(); root.traverse((o) => { if (o.isBone) m.set(o.name, o); }); return m; };
  const src = bonesOf(srcRoot), dst = bonesOf(dstRoot);
  srcRoot.updateMatrixWorld(true); dstRoot.updateMatrixWorld(true);
  const order = [...dst.values()].filter((b) => src.has(b.name)); // traverse order = parents first
  const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const restS = new Map(order.map((b) => [b.name, wq(src.get(b.name)).invert()]));
  const restD = new Map(order.map((b) => [b.name, wq(b)]));
  const staticParent = new Map(order.map((b) => [b.name, wq(b.parent)]));
  const hipsS = src.get('mixamorigHips'), hipsD = dst.get('mixamorigHips');
  const hipRestS = hipsS.getWorldPosition(new THREE.Vector3());
  const hipRestD = hipsD.getWorldPosition(new THREE.Vector3());
  const hipParentInv = hipsD.parent.matrixWorld.clone().invert();
  const ratio = hipRestD.y / hipRestS.y;

  const mixer = new THREE.AnimationMixer(srcRoot);
  mixer.clipAction(clip).play();
  const n = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(n);
  const quats = new Map(order.map((b) => [b.name, new Float32Array(n * 4)]));
  const hipPos = new Float32Array(n * 3);
  const world = new Map();
  const D = new THREE.Quaternion(), W = new THREE.Quaternion(), L = new THREE.Quaternion(), v = new THREE.Vector3();
  for (let f = 0; f < n; f++) {
    const t = Math.min(clip.duration, f / fps);
    times[f] = t;
    mixer.setTime(t);
    srcRoot.updateMatrixWorld(true);
    world.clear();
    for (const b of order) {
      D.copy(wq(src.get(b.name))).multiply(restS.get(b.name));
      W.copy(D).multiply(restD.get(b.name));
      world.set(b.name, W.clone());
      const pw = world.get(b.parent.name) || staticParent.get(b.name);
      L.copy(pw).invert().multiply(W);
      L.toArray(quats.get(b.name), f * 4);
    }
    v.copy(hipsS.getWorldPosition(new THREE.Vector3())).sub(hipRestS).multiplyScalar(ratio);
    v.x *= 0.6; v.z = 0; // keep the sway, damp travel so the dancer stays on the spot
    v.add(hipRestD).applyMatrix4(hipParentInv).toArray(hipPos, f * 3);
  }
  const tracks = order.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, quats.get(b.name)));
  tracks.push(new THREE.VectorKeyframeTrack('mixamorigHips.position', times, hipPos));
  return new THREE.AnimationClip('samba', clip.duration, tracks);
}
clips.samba = sambaBaked || retarget(michelle.animations.find((c) => c.name === 'SambaDance'), michelle.scene, hero);

// in-place locomotion: drop horizontal hips drift so movement comes from the controller
for (const name of ['idle', 'walk', 'run']) {
  const t = clips[name].tracks.find((tr) => tr.name === 'mixamorigHips.position');
  if (t) { const x0 = t.values[0], z0 = t.values[2]; for (let i = 0; i < t.values.length; i += 3) { t.values[i] = x0; t.values[i + 2] = z0; } }
}

const base = {};
for (const name of ['idle', 'walk', 'run', 'samba']) {
  const a = mixer.clipAction(clips[name]);
  a.enabled = true;
  a.setEffectiveWeight(name === 'idle' ? 1 : 0);
  a.play();
  base[name] = a;
}
const additive = {};
for (const name of ['sneak_pose', 'agree', 'headShake']) {
  THREE.AnimationUtils.makeClipAdditive(clips[name]);
  const clip = name.endsWith('_pose') ? THREE.AnimationUtils.subclip(clips[name], name, 2, 3, 30) : clips[name];
  const a = mixer.clipAction(clip);
  a.blendMode = THREE.AdditiveAnimationBlendMode;
  a.setEffectiveWeight(0);
  if (!name.endsWith('_pose')) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; }
  a.play();
  additive[name] = a;
}

// ------------------------------------------------------------------ input
const keys = new Set();
const input = { x: 0, y: 0, run: false, sneak: false };
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') { jump(); e.preventDefault(); }
  if (e.code === 'Digit1' || e.code === 'KeyE') gesture('agree');
  if (e.code === 'Digit2' || e.code === 'KeyQ') gesture('headShake');
  if (e.code === 'Digit3' || e.code === 'KeyF') toggleDance();
  if (e.code === 'KeyC') sneakToggle = !sneakToggle;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let sneakToggle = false;

// virtual joystick (left half) + camera drag (right half / mouse)
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const knob = $('knob'), pad = $('pad');
const look = { id: null, lx: 0, ly: 0 };
let camYaw = Math.PI, camPitch = 0.32, camDist = 5.2;

function stickStart(e) {
  const t = e.changedTouches ? e.changedTouches[0] : e;
  stick.id = t.identifier ?? 'm';
  const r = pad.getBoundingClientRect();
  stick.ox = r.left + r.width / 2; stick.oy = r.top + r.height / 2;
  stickMove(e);
}
function stickMove(e) {
  const list = e.changedTouches ? [...e.changedTouches] : [e];
  for (const t of list) {
    if ((t.identifier ?? 'm') !== stick.id) continue;
    const R = pad.offsetWidth * 0.42;
    let dx = t.clientX - stick.ox, dy = t.clientY - stick.oy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    stick.x = dx / R; stick.y = dy / R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
function stickEnd(e) {
  const list = e.changedTouches ? [...e.changedTouches] : [e];
  for (const t of list) if ((t.identifier ?? 'm') === stick.id) { stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; }
}
pad.addEventListener('touchstart', (e) => { e.preventDefault(); stickStart(e); }, { passive: false });
pad.addEventListener('touchmove', (e) => { e.preventDefault(); stickMove(e); }, { passive: false });
pad.addEventListener('touchend', stickEnd);
pad.addEventListener('touchcancel', stickEnd);

canvas.addEventListener('pointerdown', (e) => { look.id = e.pointerId; look.lx = e.clientX; look.ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (look.id !== e.pointerId) return;
  camYaw -= (e.clientX - look.lx) * 0.006;
  camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - look.ly) * 0.004, 0.05, 1.1);
  look.lx = e.clientX; look.ly = e.clientY;
});
canvas.addEventListener('pointerup', (e) => { if (look.id === e.pointerId) look.id = null; });
canvas.addEventListener('wheel', (e) => { camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.004, 3, 9); }, { passive: true });

const bindBtn = (id, fn) => {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(true); el.classList.add('on'); });
  const up = () => { fn(false); el.classList.remove('on'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up); el.addEventListener('pointercancel', up);
};
let holdRun = false;
bindBtn('bJump', (d) => d && jump());
bindBtn('bRun', (d) => { holdRun = d; });
bindBtn('bSneak', (d) => d && (sneakToggle = !sneakToggle, $('bSneak').classList.toggle('latched', sneakToggle)));
bindBtn('bYes', (d) => d && gesture('agree'));
bindBtn('bNo', (d) => d && gesture('headShake'));
bindBtn('bDance', (d) => d && toggleDance());

// ------------------------------------------------------------------ character controller
const WALK = 1.55, RUN = 4.6, SNEAK = 0.95;
const state = { pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), yaw: 0, vy: 0, y: 0, grounded: true, crouch: 0, dancing: false, speed: 0, jumpT: -1 };
let danceW = 0;

function jump() {
  if (!state.grounded || state.jumpT >= 0) return;
  if (state.dancing) toggleDance();
  state.jumpT = 0; // short anticipation before take-off
}
function gesture(name) {
  const a = additive[name];
  a.reset();
  a.setEffectiveWeight(1);
  a.play();
}
function toggleDance() {
  state.dancing = !state.dancing;
  if (state.dancing) base.samba.reset();
  $('bDance').classList.toggle('latched', state.dancing);
}

const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
function updateController(dt) {
  // gather input
  let ix = 0, iy = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iy += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  ix += stick.x; iy += stick.y;
  let mag = Math.min(1, Math.hypot(ix, iy));
  if (mag < 0.12) mag = 0;
  const running = (keys.has('ShiftLeft') || keys.has('ShiftRight') || holdRun || (stick.id !== null && mag > 0.92)) && !sneakToggle;

  // camera-relative direction
  fwd.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  right.set(-fwd.z, 0, fwd.x);
  wish.set(0, 0, 0).addScaledVector(right, ix).addScaledVector(fwd, -iy);
  if (wish.lengthSq() > 0) wish.normalize();

  if (mag > 0 && state.dancing) toggleDance();
  const maxSpeed = sneakToggle ? SNEAK : running ? RUN : WALK;
  const target = wish.multiplyScalar(mag * maxSpeed * (state.jumpT >= 0 && state.jumpT < 0.12 ? 0.3 : 1));
  const accel = state.grounded ? 10 : 2.5;
  state.vel.x = THREE.MathUtils.damp(state.vel.x, target.x, accel, dt);
  state.vel.z = THREE.MathUtils.damp(state.vel.z, target.z, accel, dt);
  state.speed = Math.hypot(state.vel.x, state.vel.z);

  if (state.speed > 0.15) {
    const want = Math.atan2(state.vel.x, state.vel.z);
    let d = want - state.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    state.yaw += d * Math.min(1, dt * 12);
  }

  state.pos.x += state.vel.x * dt;
  state.pos.z += state.vel.z * dt;

  // collisions: pillars/crates as circles, arena edge
  const R = 0.32;
  for (const o of obstacles) {
    const dx = state.pos.x - o.x, dz = state.pos.z - o.z, d = Math.hypot(dx, dz), m = o.r + R;
    if (d < m && d > 1e-4) { state.pos.x = o.x + (dx / d) * m; state.pos.z = o.z + (dz / d) * m; }
  }
  const r = Math.hypot(state.pos.x, state.pos.z), lim = ARENA_R - 0.6;
  if (r > lim) { state.pos.x *= lim / r; state.pos.z *= lim / r; }

  // jump: anticipation crouch -> ballistic arc -> landing absorb
  if (state.jumpT >= 0) {
    state.jumpT += dt;
    if (state.jumpT >= 0.12 && state.grounded) { state.vy = 5.2; state.grounded = false; }
  }
  if (!state.grounded) {
    state.vy -= 14 * dt;
    state.y += state.vy * dt;
    if (state.y <= 0) { state.y = 0; state.vy = 0; state.grounded = true; state.jumpT = -1; state.land = 0.18; }
  }
  state.land = Math.max(0, (state.land || 0) - dt);

  const crouchTarget = sneakToggle ? 1 : state.jumpT >= 0 && state.jumpT < 0.12 ? 0.9 : state.land > 0 ? 0.8 : !state.grounded ? 0.35 : 0;
  state.crouch = THREE.MathUtils.damp(state.crouch, crouchTarget, 14, dt);
}

function updateAnimation(dt) {
  const s = state.speed;
  // locomotion weights by speed (idle -> walk -> run)
  let wIdle, wWalk, wRun;
  if (s <= WALK) { const k = s / WALK; wIdle = 1 - k; wWalk = k; wRun = 0; }
  else { const k = Math.min(1, (s - WALK) / (RUN - WALK)); wIdle = 0; wWalk = 1 - k; wRun = k; }
  danceW = THREE.MathUtils.damp(danceW, state.dancing ? 1 : 0, 6, dt);
  const keep = 1 - danceW;
  base.idle.setEffectiveWeight(wIdle * keep);
  base.walk.setEffectiveWeight(wWalk * keep);
  base.run.setEffectiveWeight(wRun * keep);
  base.samba.setEffectiveWeight(danceW);
  // stride matching so feet don't skate
  base.walk.setEffectiveTimeScale(THREE.MathUtils.clamp(s / WALK, 0.5, 1.6));
  base.run.setEffectiveTimeScale(THREE.MathUtils.clamp(s / RUN, 0.7, 1.2));
  // airborne: slow the cycle down so the pose reads as a leap
  const air = state.grounded ? 1 : 0.25;
  base.walk.timeScale *= air; base.run.timeScale *= air; base.idle.timeScale = air;

  additive.sneak_pose.setEffectiveWeight(state.crouch);
  for (const name of ['agree', 'headShake']) {
    const a = additive[name];
    if (!a.isRunning()) a.setEffectiveWeight(0);
  }
  mixer.update(dt);
}

// ------------------------------------------------------------------ camera follow
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3();
function updateCamera(dt, snap = false) {
  camTarget.set(state.pos.x, 1.25 + state.y * 0.5, state.pos.z);
  const want = new THREE.Vector3(
    camTarget.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
    camTarget.y + Math.sin(camPitch) * camDist,
    camTarget.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist,
  );
  if (snap) camPos.copy(want); else camPos.lerp(want, 1 - Math.exp(-dt * 8));
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  sun.position.set(state.pos.x + 6, 12, state.pos.z + 4);
  sun.target.position.set(state.pos.x, 0, state.pos.z);
}

// ------------------------------------------------------------------ loop
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 62 : 50;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let elapsed = 0;
updateCamera(0, true);
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  elapsed += dt;
  updateController(dt);
  updateAnimation(dt);
  hero.position.set(state.pos.x, state.y, state.pos.z);
  hero.rotation.y = state.yaw;

  for (const o of orbs) {
    o.rotation.y += dt * 1.6;
    o.position.y = 0.9 + Math.sin(elapsed * 2 + o.userData.phase) * 0.12;
    if (Math.hypot(o.position.x - state.pos.x, o.position.z - state.pos.z) < 0.6 && Math.abs(o.position.y - (state.y + 0.9)) < 0.9) {
      burst(o.position);
      placeOrb(o);
      score++;
      $('score').textContent = String(score);
    }
  }
  if (sparks.userData.t < 1) {
    const u = sparks.userData;
    u.t += dt * 1.4;
    const pos = sparks.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      u.vel[i + 1] -= 9 * dt;
      pos[i] += u.vel[i] * dt; pos[i + 1] += u.vel[i + 1] * dt; pos[i + 2] += u.vel[i + 2] * dt;
    }
    sparks.geometry.attributes.position.needsUpdate = true;
    sparks.material.opacity = Math.max(0, 1 - u.t);
  }

  updateCamera(dt);
  renderer.render(scene, camera);
  $('state').textContent = state.dancing ? 'dançando' : !state.grounded ? 'pulando' : sneakToggle ? (state.speed > 0.2 ? 'andando agachado' : 'agachado') : state.speed > WALK + 0.4 ? 'correndo' : state.speed > 0.2 ? 'andando' : 'parado';
  requestAnimationFrame(frame);
}
$('loading').hidden = true;
window.__game = { clips, state, base, additive, jump, gesture, toggleDance, keys, setCam: (y, p, d) => { camYaw = y; camPitch = p; camDist = d; updateCamera(0, true); } };
requestAnimationFrame(frame);
