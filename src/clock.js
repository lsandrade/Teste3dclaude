// Procedural mechanical pocket-watch movement: involute gear train, escapement,
// balance with hairspring, bridges, jewels, screws, skeleton dial, case,
// sapphire crystal and crown. All dimensions in scene units (case radius ~1).
import * as THREE from 'three';
import { applyFinish } from './finishes.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- materials
function physical(params) {
  return new THREE.MeshPhysicalMaterial(params);
}

export function createMaterials() {
  const M = {};
  M.brass = applyFinish(physical({ color: new THREE.Color(0.95, 0.72, 0.42), metalness: 1, roughness: 0.3 }), 'circular', { aniso: 0.8 });
  M.brassDark = applyFinish(physical({ color: new THREE.Color(0.86, 0.6, 0.34), metalness: 1, roughness: 0.34 }), 'circular', { aniso: 0.8 });
  M.steelWheel = applyFinish(physical({ color: new THREE.Color(0.72, 0.73, 0.76), metalness: 1, roughness: 0.3 }), 'sunburst', { aniso: 0.65 });
  M.plate = applyFinish(physical({ color: new THREE.Color(0.2, 0.21, 0.23), metalness: 1, roughness: 0.38 }), 'perlage', { aniso: 0.28, scale: 0.6 });
  M.bridge = (angle) => applyFinish(physical({ color: new THREE.Color(0.78, 0.79, 0.82), metalness: 1, roughness: 0.3 }), 'cotes', { cotesAngle: angle, aniso: 0.4 });
  M.gold = physical({ color: new THREE.Color(1.0, 0.77, 0.45), metalness: 1, roughness: 0.12 });
  M.goldSatin = physical({ color: new THREE.Color(1.0, 0.75, 0.42), metalness: 1, roughness: 0.3 });
  M.steel = physical({ color: new THREE.Color(0.88, 0.89, 0.92), metalness: 1, roughness: 0.1 });
  M.steelSatin = physical({ color: new THREE.Color(0.8, 0.81, 0.84), metalness: 1, roughness: 0.32 });
  M.case = physical({ color: new THREE.Color(0.9, 0.9, 0.93), metalness: 1, roughness: 0.09 });
  M.blued = physical({ color: new THREE.Color(0.05, 0.13, 0.5), metalness: 1, roughness: 0.22, iridescence: 0.4, iridescenceIOR: 1.8 });
  M.slot = physical({ color: 0x050505, metalness: 0.5, roughness: 0.6 });
  M.ruby = physical({ color: new THREE.Color(0.55, 0.015, 0.04), metalness: 0, roughness: 0.04, ior: 1.77, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, emissive: new THREE.Color(0.12, 0.0, 0.01) });
  M.lacquer = physical({ color: new THREE.Color(0.012, 0.012, 0.014), metalness: 0, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 });
  M.print = physical({ color: new THREE.Color(0.85, 0.8, 0.7), metalness: 0.2, roughness: 0.45 });
  M.glass = physical({
    color: new THREE.Color(0.96, 0.98, 1.0), metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.06, ior: 1.6,
    specularIntensity: 1, iridescence: 0.18, iridescenceIOR: 1.3, iridescenceThicknessRange: [380, 460],
    envMapIntensity: 1.2, depthWrite: false,
  });
  return M;
}

// ---------------------------------------------------------------- geometry helpers
function chaikin(pts, iterations = 2, closed = true) {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    const out = [];
    const n = p.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push(new THREE.Vector2(a.x * 0.75 + b.x * 0.25, a.y * 0.75 + b.y * 0.25));
      out.push(new THREE.Vector2(a.x * 0.25 + b.x * 0.75, a.y * 0.25 + b.y * 0.75));
    }
    p = out;
  }
  return p;
}

function circlePath(r, segs = 48, cx = 0, cy = 0) {
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * TAU;
    pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return new THREE.Path(pts);
}

const involute = (a) => Math.tan(a) - a;

/** Involute spur-gear outline (CCW). Tooth 0 is centred on +X. */
function gearOutline(N, m, { pressure = (20 * Math.PI) / 180, flankSteps = 5 } = {}) {
  const rp = (m * N) / 2;
  const ra = rp + m * 0.95;
  const rf = rp - m * 1.2;
  const rb = rp * Math.cos(pressure);
  const beta = Math.PI / (2 * N);
  const theta = (rho) => (rho <= rb ? beta + involute(pressure) : beta + involute(pressure) - involute(Math.acos(rb / rho)));
  const pts = [];
  const r0 = Math.max(rf, Math.min(rb, ra));
  for (let k = 0; k < N; k++) {
    const c = (k / N) * TAU;
    // rising flank
    pts.push(new THREE.Vector2(Math.cos(c - theta(rf)) * rf, Math.sin(c - theta(rf)) * rf));
    for (let i = 0; i <= flankSteps; i++) {
      const rho = r0 + (ra - r0) * (i / flankSteps);
      const a = c - theta(rho) * (i === flankSteps ? 0.92 : 1);
      pts.push(new THREE.Vector2(Math.cos(a) * rho, Math.sin(a) * rho));
    }
    for (let i = flankSteps; i >= 0; i--) {
      const rho = r0 + (ra - r0) * (i / flankSteps);
      const a = c + theta(rho) * (i === flankSteps ? 0.92 : 1);
      pts.push(new THREE.Vector2(Math.cos(a) * rho, Math.sin(a) * rho));
    }
    pts.push(new THREE.Vector2(Math.cos(c + theta(rf)) * rf, Math.sin(c + theta(rf)) * rf));
    // root arc
    const a0 = c + theta(rf), a1 = c + TAU / N - theta(rf);
    for (let i = 1; i < 3; i++) {
      const a = a0 + ((a1 - a0) * i) / 3;
      pts.push(new THREE.Vector2(Math.cos(a) * rf, Math.sin(a) * rf));
    }
  }
  return { pts, rp, ra, rf };
}

/** Curved-spoke openings between hub and rim. */
function spokeHoles(spokes, rh, ri, spokeW, twist) {
  const holes = [];
  const steps = 10;
  for (let j = 0; j < spokes; j++) {
    const base0 = (j / spokes) * TAU, base1 = ((j + 1) / spokes) * TAU;
    const f = (rho) => twist * Math.pow((rho - rh) / (ri - rh), 1.4);
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const rho = rh + ((ri - rh) * i) / steps;
      const a = base0 + spokeW / (2 * rho) + f(rho);
      pts.push(new THREE.Vector2(Math.cos(a) * rho, Math.sin(a) * rho));
    }
    const aO0 = base0 + spokeW / (2 * ri) + f(ri), aO1 = base1 - spokeW / (2 * ri) + f(ri);
    for (let i = 1; i < 12; i++) {
      const a = aO0 + ((aO1 - aO0) * i) / 12;
      pts.push(new THREE.Vector2(Math.cos(a) * ri, Math.sin(a) * ri));
    }
    for (let i = steps; i >= 0; i--) {
      const rho = rh + ((ri - rh) * i) / steps;
      const a = base1 - spokeW / (2 * rho) + f(rho);
      pts.push(new THREE.Vector2(Math.cos(a) * rho, Math.sin(a) * rho));
    }
    const aI0 = base1 - spokeW / (2 * rh) + f(rh), aI1 = base0 + spokeW / (2 * rh) + f(rh);
    for (let i = 1; i < 6; i++) {
      const a = aI0 + ((aI1 - aI0) * i) / 6;
      pts.push(new THREE.Vector2(Math.cos(a) * rh, Math.sin(a) * rh));
    }
    holes.push(new THREE.Path(chaikin(pts, 2)));
  }
  return holes;
}

function extrude(shape, depth, bevel = 0.003, bevelSegments = 2) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments, curveSegments: 24, steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  g.computeBoundingSphere();
  return g;
}

function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** A wheel (optionally spoked) plus optional pinion and arbor. */
function makeWheel({ N, m, thick = 0.014, mat, spokes = 5, twist = 0.35, rim = 0.035, hub = 0.05, bore = 0.012, pinion = null, arbor = null, M }) {
  const g = new THREE.Group();
  const { pts, rf } = gearOutline(N, m);
  const shape = new THREE.Shape(pts);
  if (spokes > 0) shape.holes.push(...spokeHoles(spokes, hub, rf - rim, Math.max(0.018, rf * 0.09), twist));
  if (bore > 0) shape.holes.push(circlePath(bore, 24));
  g.add(mesh(extrude(shape, thick, Math.min(0.0035, thick * 0.22)), mat));
  if (pinion) {
    const p = gearOutline(pinion.n, pinion.m, { flankSteps: 4 });
    const ps = new THREE.Shape(p.pts);
    const pm = mesh(extrude(ps, pinion.len, 0.0015, 1), M.steel);
    pm.position.z = pinion.z;
    g.add(pm);
  }
  if (arbor) {
    const a = mesh(new THREE.CylinderGeometry(arbor.r, arbor.r, arbor.len, 20), M.steel);
    a.rotation.x = Math.PI / 2;
    a.position.z = arbor.z || 0;
    g.add(a);
  }
  return g;
}

/** Club-tooth Swiss lever escape wheel. */
function escapeWheel(M, r = 0.1, teeth = 15) {
  const pts = [];
  const rr = r * 0.8;
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * TAU;
    const da = TAU / teeth;
    const P = (ang, rad) => new THREE.Vector2(Math.cos(ang) * rad, Math.sin(ang) * rad);
    pts.push(P(a, rr));
    pts.push(P(a + da * 0.1, r * 0.93));
    pts.push(P(a + da * 0.18, r));
    pts.push(P(a + da * 0.32, r * 0.985));
    pts.push(P(a + da * 0.36, r * 0.92));
    pts.push(P(a + da * 0.55, rr * 1.03));
    pts.push(P(a + da * 0.8, rr));
  }
  const shape = new THREE.Shape(pts);
  shape.holes.push(...spokeHoles(4, 0.022, rr - 0.014, 0.012, 0.0));
  shape.holes.push(circlePath(0.006, 16));
  const g = new THREE.Group();
  g.add(mesh(extrude(shape, 0.008, 0.0015, 1), M.steelWheel));
  const pin = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 12), M.steel);
  pin.rotation.x = Math.PI / 2;
  g.add(pin);
  return g;
}

function palletFork(M) {
  const s = new THREE.Shape();
  // anchor body: two arms + lever towards balance
  s.moveTo(-0.075, -0.02);
  s.quadraticCurveTo(-0.08, 0.035, -0.055, 0.045);
  s.lineTo(-0.04, 0.02);
  s.quadraticCurveTo(0, 0.03, 0.04, 0.02);
  s.lineTo(0.055, 0.045);
  s.quadraticCurveTo(0.08, 0.035, 0.075, -0.02);
  s.quadraticCurveTo(0.02, -0.018, 0.008, -0.03);
  s.lineTo(0.006, -0.14);
  s.lineTo(0.016, -0.155);
  s.lineTo(-0.016, -0.155);
  s.lineTo(-0.006, -0.14);
  s.lineTo(-0.008, -0.03);
  s.quadraticCurveTo(-0.02, -0.018, -0.075, -0.02);
  s.holes.push(circlePath(0.005, 16));
  const g = new THREE.Group();
  g.add(mesh(extrude(s, 0.007, 0.0015, 1), M.steelSatin));
  for (const sx of [-1, 1]) {
    const pal = mesh(new THREE.BoxGeometry(0.012, 0.03, 0.009), M.ruby);
    pal.position.set(sx * 0.062, 0.045, 0);
    pal.rotation.z = sx * 0.3;
    g.add(pal);
  }
  return g;
}

function hairspring(M, r0 = 0.025, r1 = 0.13, turns = 13) {
  const pts = [];
  const n = 900;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = u * turns * TAU;
    const r = r0 + (r1 - r0) * u;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return mesh(new THREE.TubeGeometry(curve, 1600, 0.0016, 5, false), M.blued);
}

function balanceWheel(M) {
  const g = new THREE.Group();
  const R = 0.21;
  const ring = new THREE.Shape();
  ring.absarc(0, 0, R, 0, TAU, false);
  const inner = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * TAU;
    inner.push(new THREE.Vector2(Math.cos(a) * (R - 0.026), Math.sin(a) * (R - 0.026)));
  }
  ring.holes.push(new THREE.Path(inner));
  g.add(mesh(extrude(ring, 0.022, 0.003), M.gold));
  for (let k = 0; k < 3; k++) {
    const arm = mesh(new THREE.BoxGeometry(R * 2 - 0.03, 0.016, 0.01), M.goldSatin);
    arm.rotation.z = (k / 3) * Math.PI;
    if (k === 0) g.add(arm);
    else if (k === 1) { arm.rotation.z = Math.PI / 2; g.add(arm); }
  }
  // regulating screws around the rim
  const screwGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.018, 14);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU + 0.1;
    const s = mesh(screwGeo, k % 4 === 0 ? M.blued : M.gold);
    s.position.set(Math.cos(a) * (R + 0.008), Math.sin(a) * (R + 0.008), 0);
    s.rotation.z = a - Math.PI / 2;
    g.add(s);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 20), M.steel);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  const roller = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 24), M.steel);
  roller.rotation.x = Math.PI / 2;
  roller.position.z = -0.016;
  g.add(roller);
  return g;
}

/** Bridge outline = smooth curved bar through a list of points with round ends. */
function barShape(points, width, endRadius = null) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], 0)), false, 'centripetal');
  const n = 60;
  const left = [], right = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const w = width / 2 * (1 + 0.25 * Math.sin(u * Math.PI));
    left.push(new THREE.Vector2(p.x - t.y * w, p.y + t.x * w));
    right.push(new THREE.Vector2(p.x + t.y * w, p.y - t.x * w));
  }
  const out = [...left];
  const pe = curve.getPointAt(1), te = curve.getTangentAt(1);
  const ae = Math.atan2(te.y, te.x);
  const re = endRadius || width / 2;
  for (let i = 1; i < 16; i++) {
    const a = ae + Math.PI / 2 - (i / 16) * Math.PI;
    out.push(new THREE.Vector2(pe.x + Math.cos(a) * re, pe.y + Math.sin(a) * re));
  }
  out.push(...right.reverse());
  const ps = curve.getPointAt(0), ts = curve.getTangentAt(0);
  const as = Math.atan2(ts.y, ts.x);
  for (let i = 1; i < 16; i++) {
    const a = as - Math.PI / 2 - (i / 16) * Math.PI;
    out.push(new THREE.Vector2(ps.x + Math.cos(a) * (width / 2), ps.y + Math.sin(a) * (width / 2)));
  }
  return new THREE.Shape(chaikin(out, 1));
}

function screw(M, r = 0.017) {
  const g = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    prof.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r * 0.45));
  }
  prof.unshift(new THREE.Vector2(r, -0.004));
  prof.unshift(new THREE.Vector2(0, -0.004));
  const head = mesh(new THREE.LatheGeometry(prof, 28), M.blued);
  head.rotation.x = Math.PI / 2;
  g.add(head);
  const slot = mesh(new THREE.BoxGeometry(r * 2.05, r * 0.22, r * 0.5), M.slot, false);
  slot.position.z = r * 0.4;
  g.add(slot);
  return g;
}

function jewel(M, r = 0.016) {
  const g = new THREE.Group();
  const chaton = mesh(new THREE.TorusGeometry(r * 1.25, r * 0.38, 12, 32), M.gold);
  g.add(chaton);
  const stone = mesh(new THREE.CylinderGeometry(r, r * 1.05, r * 0.5, 32), M.ruby);
  stone.rotation.x = Math.PI / 2;
  g.add(stone);
  const hole = mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.22, r * 0.52, 12), M.slot, false);
  hole.rotation.x = Math.PI / 2;
  g.add(hole);
  return g;
}

/** Faceted dauphine hand (two-sided bevel with central ridge). */
function dauphineHand(len, w, tail, h = 0.008) {
  const T = [0, len, h * 0.2], R = [0, len * 0.12, h], L = [-w, len * 0.12, 0], W = [w, len * 0.12, 0];
  const B = [0, -tail, h * 0.3], BL = [-w * 0.55, -tail * 0.4, 0], BR = [w * 0.55, -tail * 0.4, 0];
  const tris = [T, L, R, T, R, W, R, L, BL, R, BR, W, R, BL, B, R, B, BR, T, W, L, L, W, BR, L, BR, BL, BL, BR, B];
  // last four triangles form the underside (flat)
  for (let i = tris.length - 12; i < tris.length; i += 3) {
    tris[i] = [tris[i][0], tris[i][1], 0];
    tris[i + 1] = [tris[i + 1][0], tris[i + 1][1], 0];
    tris[i + 2] = [tris[i + 2][0], tris[i + 2][1], 0];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- the clock
export function buildClock() {
  const M = createMaterials();
  const root = new THREE.Group(); // receives tilt / orbit
  const layers = {};
  const layerDefs = [
    // name, explode offset along local Z, small lateral drift, twist
    ['back', -1.45, [0.0, -0.05], 0.15],
    ['plate', -0.95, [0.0, 0.0], -0.1],
    ['barrel', -0.45, [-0.05, 0.03], 0.12],
    ['train', 0.05, [0.05, -0.03], -0.12],
    ['bridges', 0.55, [0.0, 0.04], 0.08],
    ['top', 1.0, [-0.03, -0.02], -0.1],
    ['dial', 1.45, [0.0, 0.0], 0.06],
    ['bezel', 1.95, [0.0, 0.02], -0.05],
    ['case', 0.0, [0, 0], 0],
  ];
  for (const [name, dz, drift, twist] of layerDefs) {
    const g = new THREE.Group();
    g.name = name;
    g.userData = { dz, drift, twist, e: 0 };
    layers[name] = g;
    root.add(g);
  }

  const spin = []; // {obj, fn(t)}

  // ---- case (middle band), back, bezel, crystal, crown
  const bandProfile = [
    [0.955, -0.115], [1.0, -0.12], [1.04, -0.1], [1.058, -0.06], [1.062, 0.0], [1.058, 0.06], [1.04, 0.095], [1.0, 0.105], [0.955, 0.1],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const band = mesh(new THREE.LatheGeometry(chaikin(bandProfile, 2, false), 160), M.case);
  band.rotation.x = Math.PI / 2;
  layers.case.add(band);

  const backProfile = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    backProfile.push(new THREE.Vector2(Math.cos(u * Math.PI / 2) * 1.0, -0.12 - Math.sin(u * Math.PI / 2) * 0.13));
  }
  backProfile.unshift(new THREE.Vector2(1.03, -0.1));
  const back = mesh(new THREE.LatheGeometry(backProfile.reverse().map((p) => p), 160), M.steelSatin);
  back.rotation.x = Math.PI / 2;
  back.material = M.steelSatin;
  layers.back.add(back);
  // engraved concentric rings on the back
  for (let i = 0; i < 4; i++) {
    const rr = 0.45 + i * 0.14;
    const ring = mesh(new THREE.TorusGeometry(rr, 0.004, 8, 160), M.gold);
    const zz = -0.12 - Math.sqrt(Math.max(0, 1 - rr * rr)) * 0.13;
    ring.position.z = zz - 0.0;
    layers.back.add(ring);
  }

  const bezelProfile = [
    [0.94, 0.1], [0.95, 0.135], [0.965, 0.16], [0.99, 0.172], [1.03, 0.165], [1.055, 0.14], [1.06, 0.11], [1.05, 0.1],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bezel = mesh(new THREE.LatheGeometry(chaikin(bezelProfile, 2, false), 160), M.gold);
  bezel.rotation.x = Math.PI / 2;
  layers.bezel.add(bezel);
  // knurled coin-edge on bezel
  const knurl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.006, 0.012, 0.03), M.gold, 180);
  const tmp = new THREE.Object3D();
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * TAU;
    tmp.position.set(Math.cos(a) * 1.058, Math.sin(a) * 1.058, 0.125);
    tmp.rotation.set(0, 0, a);
    tmp.updateMatrix();
    knurl.setMatrixAt(i, tmp.matrix);
  }
  knurl.castShadow = true;
  layers.bezel.add(knurl);

  const crystal = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 24, 0, TAU, 0, 0.42), M.glass);
  // map cap of unit sphere (height 1-cos(.42)=.087, radius sin(.42)=.408) to r=.965, h=.085
  const s = 0.965 / Math.sin(0.42);
  const hs = 0.085 / (1 - Math.cos(0.42));
  crystal.scale.set(s, hs, s);
  crystal.rotation.x = Math.PI / 2;
  crystal.position.z = 0.16 - hs * Math.cos(0.42);
  crystal.renderOrder = 2;
  layers.bezel.add(crystal);

  // crown, pendant and bow at 12 o'clock
  const crownGroup = new THREE.Group();
  const pendant = mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.1, 32), M.case);
  pendant.position.y = 1.09;
  crownGroup.add(pendant);
  const crownShape = new THREE.Shape();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    const r = 0.085 + (i % 2 === 0 ? 0.0 : -0.008);
    if (i === 0) crownShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else crownShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const crown = mesh(extrude(crownShape, 0.085, 0.01, 3), M.gold);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 1.19;
  crownGroup.add(crown);
  const crownCap = mesh(new THREE.SphereGeometry(0.06, 24, 12, 0, TAU, 0, Math.PI / 2), M.gold);
  crownCap.position.y = 1.235;
  crownCap.scale.y = 0.35;
  crownGroup.add(crownCap);
  const bow = mesh(new THREE.TorusGeometry(0.16, 0.022, 24, 96, Math.PI * 1.55), M.gold);
  bow.rotation.z = Math.PI / 2 - Math.PI * 0.775;
  bow.position.y = 1.385;
  crownGroup.add(bow);
  layers.case.add(crownGroup);

  // ---- main plate
  const plateShape = new THREE.Shape();
  plateShape.absarc(0, 0, 0.95, 0, TAU, false);
  const plate = mesh(extrude(plateShape, 0.04, 0.006, 3), M.plate);
  plate.position.z = -0.11;
  layers.plate.add(plate);
  // sunk jewels on the plate at arbor positions (visible when exploded)

  // ---- gear train
  const mod = 0.008;
  const P = {
    center: [0, 0],
    barrel: [-0.18, 0.3118],
    third: [0.2329, -0.1954],
    fourth: [0.1829, -0.479],
    deco1: [0.3187, 0.2674],
    deco2: [0.5737, 0.2897],
    crownWheel: [-0.0133, 0.6005],
    escape: [-0.13, -0.625],
    pallet: [-0.262, -0.575],
    balance: [-0.44, -0.47],
  };

  // barrel: toothed drum
  const barrel = new THREE.Group();
  {
    const { pts } = gearOutline(80, mod);
    const sh = new THREE.Shape(pts);
    sh.holes.push(circlePath(0.012, 24));
    const teeth = mesh(extrude(sh, 0.012, 0.002, 1), M.brassDark);
    teeth.position.z = -0.069;
    barrel.add(teeth);
    const drumProfile = [[0.012, -0.063], [0.3, -0.063], [0.305, -0.055], [0.305, -0.03], [0.298, -0.025], [0.012, -0.025]].map(([x, y]) => new THREE.Vector2(x, y));
    const drum = mesh(new THREE.LatheGeometry(drumProfile, 96), M.brass);
    drum.rotation.x = Math.PI / 2;
    barrel.add(drum);
    const lid = new THREE.Shape();
    lid.absarc(0, 0, 0.292, 0, TAU, false);
    lid.holes.push(circlePath(0.03, 32));
    const lidM = mesh(extrude(lid, 0.004, 0.0015, 1), M.brass);
    lidM.position.z = -0.024;
    barrel.add(lidM);
  }
  barrel.position.set(...P.barrel, 0);
  layers.barrel.add(barrel);

  const center = makeWheel({ N: 64, m: mod, mat: M.brass, spokes: 5, twist: 0.5, hub: 0.045, rim: 0.03, pinion: { n: 10, m: mod, len: 0.07, z: -0.04 }, arbor: { r: 0.008, len: 0.26, z: 0.06 }, M });
  center.position.set(0, 0, -0.005);
  layers.barrel.add(center);

  const deco1 = makeWheel({ N: 40, m: mod, mat: M.brass, spokes: 4, twist: -0.4, hub: 0.03, rim: 0.025, arbor: { r: 0.006, len: 0.1 }, M });
  deco1.position.set(...P.deco1, -0.005);
  layers.barrel.add(deco1);
  const deco2 = makeWheel({ N: 24, m: mod, mat: M.steelWheel, spokes: 3, twist: 0.3, hub: 0.022, rim: 0.018, arbor: { r: 0.005, len: 0.1 }, M });
  deco2.position.set(...P.deco2, -0.005);
  layers.barrel.add(deco2);

  const third = makeWheel({ N: 60, m: mod, mat: M.brass, spokes: 5, twist: -0.45, hub: 0.035, rim: 0.028, pinion: { n: 12, m: mod, len: 0.03, z: -0.012 }, arbor: { r: 0.006, len: 0.12 }, M });
  third.position.set(...P.third, 0.012);
  layers.train.add(third);
  const fourth = makeWheel({ N: 56, m: mod, mat: M.brass, spokes: 4, twist: 0.5, hub: 0.032, rim: 0.026, pinion: { n: 12, m: mod, len: 0.03, z: -0.016 }, arbor: { r: 0.006, len: 0.12 }, M });
  fourth.position.set(...P.fourth, 0.028);
  layers.train.add(fourth);
  const esc = escapeWheel(M);
  esc.position.set(...P.escape, 0.028);
  layers.train.add(esc);
  const pallet = palletFork(M);
  pallet.position.set(...P.pallet, 0.032);
  // orient lever toward balance
  const leverDir = Math.atan2(P.balance[1] - P.pallet[1], P.balance[0] - P.pallet[0]);
  const palletBase = leverDir + Math.PI / 2; // local -y points to balance
  pallet.rotation.z = palletBase;
  layers.train.add(pallet);

  // ---- meshing kinematics (phase-correct)
  // θb = φ + π + π/Nb − (Na/Nb)(θa − φ)
  const meshAngle = (thA, Na, Nb, pa, pb) => {
    const phi = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
    return phi + Math.PI + Math.PI / Nb - (Na / Nb) * (thA - phi);
  };
  const wC = -TAU / 150;
  spin.push((t) => {
    const thC = wC * t + 0.3;
    center.rotation.z = thC;
    barrel.rotation.z = meshAngle(thC, 10, 80, P.center, P.barrel);
    const th3 = meshAngle(thC, 64, 12, P.center, P.third);
    third.rotation.z = th3;
    fourth.rotation.z = meshAngle(th3, 60, 12, P.third, P.fourth);
    const thD1 = meshAngle(thC, 64, 40, P.center, P.deco1);
    deco1.rotation.z = thD1;
    deco2.rotation.z = meshAngle(thD1, 40, 24, P.deco1, P.deco2);
  });

  // ---- bridges (rhodium, côtes de Genève, polished anglage)
  const bridgeZ = 0.055;
  const bridgeDefs = [
    // barrel bridge: sweeping arc from the 9 o'clock edge over the barrel to the crown wheel
    { pts: [[-0.88, 0.3], [-0.55, 0.43], [-0.18, 0.3118]], w: 0.15 },
    { pts: [[-0.18, 0.3118], [-0.05, 0.5], [0.12, 0.88]], w: 0.12 },
    // train bridge: 3 o'clock edge -> third -> fourth
    { pts: [[0.9, -0.2], [0.55, -0.15], [0.2329, -0.1954]], w: 0.09 },
    { pts: [[0.2329, -0.1954], [0.24, -0.34], [0.1829, -0.479]], w: 0.08 },
    // escape bridge
    { pts: [[0.1829, -0.479], [0.02, -0.6], [-0.13, -0.625]], w: 0.07 },
    { pts: [[-0.13, -0.625], [-0.2, -0.61], [-0.262, -0.575]], w: 0.06 },
    // centre bridge to the decorative wheels
    { pts: [[0.0, 0.0], [0.16, 0.16], [0.3187, 0.2674]], w: 0.08 },
    { pts: [[0.3187, 0.2674], [0.46, 0.27], [0.5737, 0.2897]], w: 0.07 },
    { pts: [[0.5737, 0.2897], [0.72, 0.33], [0.88, 0.38]], w: 0.08 },
  ];
  const bridgeMat = M.bridge(0.55);
  bridgeDefs.forEach((b, i) => {
    const br = mesh(extrude(barShape(b.pts, b.w), 0.026, 0.006, 3), bridgeMat);
    br.position.z = bridgeZ + i * 0.0004; // avoid coplanar overlaps at joints
    layers.bridges.add(br);
  });
  // screws at bridge feet + jewels at pivots
  const screwPos = [[-0.84, 0.31], [0.11, 0.84], [0.86, -0.2], [0.84, 0.37], [-0.55, 0.43], [0.55, -0.15], [0.24, -0.34], [0.02, -0.6], [0.16, 0.16]];
  for (const p of screwPos) {
    const sc = screw(M);
    sc.position.set(p[0], p[1], bridgeZ + 0.016);
    sc.rotation.z = p[0] * 3.1 + p[1];
    layers.bridges.add(sc);
  }
  for (const k of ['third', 'fourth', 'escape', 'pallet', 'deco1', 'deco2', 'center']) {
    const j = jewel(M, k === 'center' ? 0.02 : 0.015);
    j.position.set(...P[k], bridgeZ + 0.014);
    layers.bridges.add(j);
  }

  // ---- top: ratchet + crown wheel (sunburst steel) and balance assembly
  const ratchet = makeWheel({ N: 36, m: 0.0111, thick: 0.016, mat: M.steelWheel, spokes: 0, bore: 0.02, M });
  ratchet.position.set(...P.barrel, 0.083);
  layers.top.add(ratchet);
  const ratchetScrew = screw(M, 0.034);
  ratchetScrew.position.set(...P.barrel, 0.093);
  layers.top.add(ratchetScrew);
  const crownWheel = makeWheel({ N: 24, m: 0.0111, thick: 0.014, mat: M.steelWheel, spokes: 0, bore: 0.012, M });
  crownWheel.position.set(...P.crownWheel, 0.083);
  layers.top.add(crownWheel);
  const cwScrew = screw(M, 0.024);
  cwScrew.position.set(...P.crownWheel, 0.092);
  layers.top.add(cwScrew);
  spin.push((t) => {
    const thR = 0.2 + t * 0.12;
    ratchet.rotation.z = thR;
    crownWheel.rotation.z = meshAngle(thR, 36, 24, P.barrel, P.crownWheel);
    ratchetScrew.rotation.z = thR;
    cwScrew.rotation.z = crownWheel.rotation.z;
  });

  const balanceAsm = new THREE.Group();
  balanceAsm.position.set(...P.balance, 0.05);
  const bal = balanceWheel(M);
  balanceAsm.add(bal);
  const spring = hairspring(M);
  spring.position.z = 0.02;
  balanceAsm.add(spring);
  layers.top.add(balanceAsm);
  // balance cock
  const cockFoot = [-0.62, -0.68];
  const cock = mesh(extrude(barShape([cockFoot, [(cockFoot[0] + P.balance[0]) / 2 - 0.03, (cockFoot[1] + P.balance[1]) / 2 + 0.01], P.balance], 0.085, 0.05), 0.022, 0.006, 3), M.bridge(1.6));
  cock.position.z = 0.1;
  layers.top.add(cock);
  const cockJewel = jewel(M, 0.017);
  cockJewel.position.set(...P.balance, 0.113);
  layers.top.add(cockJewel);
  const cockScrew = screw(M, 0.018);
  cockScrew.position.set(cockFoot[0], cockFoot[1], 0.113);
  layers.top.add(cockScrew);
  // regulator index (gold swan-neck-ish pointer)
  const regulator = mesh(extrude(barShape([P.balance, [P.balance[0] + 0.1, P.balance[1] + 0.13], [P.balance[0] + 0.12, P.balance[1] + 0.22]], 0.012), 0.006, 0.0015, 1), M.gold);
  regulator.position.z = 0.115;
  layers.top.add(regulator);

  const balFreq = 2.5; // Hz, slowed for the camera
  spin.push((t) => {
    const ph = TAU * balFreq * t;
    const a = 1.9 * Math.sin(ph);
    bal.rotation.z = a;
    spring.rotation.z = a * 0.35;
    spring.scale.setScalar(1 + 0.025 * Math.sin(ph));
    // pallet flips each half-oscillation as the impulse pin passes through
    const flip = Math.tanh(Math.cos(ph) * 6.0);
    pallet.rotation.z = palletBase + 0.12 * flip;
    // escape wheel advances half a tooth on each beat
    const beats = (2 * balFreq * t) + 0.25;
    const k = Math.floor(beats);
    const f = beats - k;
    const step = k + THREE.MathUtils.smootherstep(f, 0, 0.18);
    esc.rotation.z = -(TAU / 15 / 2) * step;
  });

  // ---- dial: black lacquer chapter ring, gold indices, minute track, hands
  const dialZ = 0.118;
  const chap = new THREE.Shape();
  chap.absarc(0, 0, 0.945, 0, TAU, false);
  chap.holes.push(circlePath(0.79, 160));
  const chapM = mesh(extrude(chap, 0.012, 0.003, 2), M.lacquer);
  chapM.position.z = dialZ;
  layers.dial.add(chapM);
  const innerRing = mesh(new THREE.TorusGeometry(0.79, 0.006, 12, 200), M.gold);
  innerRing.position.z = dialZ + 0.006;
  layers.dial.add(innerRing);
  const outerRing = mesh(new THREE.TorusGeometry(0.945, 0.005, 12, 200), M.gold);
  outerRing.position.z = dialZ + 0.004;
  layers.dial.add(outerRing);

  const idxShape = new THREE.Shape();
  idxShape.moveTo(-0.014, -0.05); idxShape.lineTo(0.014, -0.05); idxShape.lineTo(0.014, 0.05); idxShape.lineTo(-0.014, 0.05); idxShape.closePath();
  const idxGeo = extrude(idxShape, 0.012, 0.005, 3);
  for (let i = 0; i < 12; i++) {
    const a = Math.PI / 2 - (i / 12) * TAU;
    const offsets = i === 0 ? [-0.024, 0.024] : [0];
    for (const o of offsets) {
      const idx = mesh(idxGeo, M.gold);
      const rr = 0.86;
      idx.position.set(Math.cos(a) * rr - Math.sin(a) * o, Math.sin(a) * rr + Math.cos(a) * o, dialZ + 0.016);
      idx.rotation.z = a - Math.PI / 2;
      layers.dial.add(idx);
    }
  }
  const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0045, 0.022, 0.003), M.print, 60);
  for (let i = 0; i < 60; i++) {
    const a = Math.PI / 2 - (i / 60) * TAU;
    tmp.position.set(Math.cos(a) * 0.925, Math.sin(a) * 0.925, dialZ + 0.007);
    tmp.rotation.set(0, 0, a - Math.PI / 2);
    tmp.scale.set(i % 5 === 0 ? 1.6 : 1, 1, 1);
    tmp.updateMatrix();
    ticks.setMatrixAt(i, tmp.matrix);
  }
  layers.dial.add(ticks);

  const hourHand = mesh(dauphineHand(0.5, 0.032, 0.08), M.gold);
  const minuteHand = mesh(dauphineHand(0.74, 0.026, 0.1), M.gold);
  const secondHand = new THREE.Group();
  {
    const needle = mesh(new THREE.BoxGeometry(0.006, 0.86, 0.004), M.blued);
    needle.position.y = 0.33;
    secondHand.add(needle);
    const cw = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.005, 24), M.blued);
    cw.rotation.x = Math.PI / 2;
    cw.position.y = -0.1;
    secondHand.add(cw);
  }
  hourHand.position.z = dialZ + 0.03;
  minuteHand.position.z = dialZ + 0.042;
  secondHand.position.z = dialZ + 0.055;
  const cap = mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.012, 32), M.gold);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = dialZ + 0.06;
  layers.dial.add(hourHand, minuteHand, secondHand, cap);
  spin.push((t) => {
    const secs = 10 * 3600 + 9 * 60 + 2 + t; // 10:09:02 at t=0
    secondHand.rotation.z = -((secs % 60) / 60) * TAU;
    minuteHand.rotation.z = -(((secs / 60) % 60) / 60) * TAU;
    hourHand.rotation.z = -(((secs / 3600) % 12) / 12) * TAU;
  });

  // ---- layer explode
  function setExplode(t) {
    Object.values(layers).forEach((g, i) => {
      const { dz, drift, twist, e } = g.userData;
      // while separated, each layer floats on its own slow phase (parallax inside the stack)
      const f = e * e * Math.sin(t * 1.1 + i * 1.7);
      g.position.set(drift[0] * e, drift[1] * e, dz * e + 0.035 * f);
      g.rotation.z = twist * e + 0.025 * f;
    });
  }

  root.traverse((o) => {
    if (o.isMesh && o.material === M.glass) { o.castShadow = false; o.receiveShadow = false; }
  });

  return {
    root,
    layers,
    materials: M,
    update(t) {
      for (const fn of spin) fn(t);
      setExplode(t);
    },
  };
}
