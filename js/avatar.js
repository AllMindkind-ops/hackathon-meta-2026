import * as THREE from 'three';

// FROZEN CONTRACT: keep createAvatar() -> THREE.Group with origin at the feet.
// app.js places it at summit.userData.playerStart.
// Chibi humanoid (~1.3 m tall) in a one-color snow suit with a fluffy hood:
// the hood is the main character of the head: a big shell with a fat cream
// trim ring framing a ROUND face opening, painted face texture recessed
// inside, golden scarf and gloves, black boots. Gender-neutral, no hair.
// Named pivots (neck, shoulderL/R, hipL/R) for a later ragdoll stage;
// no physics or steering wiring here.
export function createAvatar() {
  const avatar = new THREE.Group();
  avatar.name = 'chibi-avatar';
  avatar.userData.pivots = {};

  const suit = new THREE.MeshStandardMaterial({ color: 0x5b7d8a, roughness: 0.9 });
  const hoodMat = new THREE.MeshStandardMaterial({ color: 0x5b7d8a, roughness: 0.9, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: 0xf5efe2, roughness: 0.95 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8a93d, roughness: 0.8 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.85 });

  // Face texture: cream base with painted glossy eyes and rosy cheeks only.
  // No mouth: no smile arc, no cover story, just no mouth.
  // Canvas top is the sphere top (three.js sphere UVs store 1 - v), so larger
  // canvas y sits lower on the visible face: eyes upper-middle and even,
  // cheeks lower-middle and even on both sides.
  function faceTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#f2c9a0';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#2e2a26';
    for (const x of [104, 152]) {
      g.beginPath();
      g.ellipse(x, 138, 11, 16, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    for (const x of [100, 148]) {
      g.beginPath();
      g.arc(x, 132, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#e88a8a';
    for (const x of [92, 164]) {
      g.beginPath();
      g.arc(x, 166, 9, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const skin = new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.85 });

  // Legs: hip pivots so each leg swings from the hip joint.
  // Boots: rounded black nubs, children of the hip pivots (NOT the avatar
  // group) so they ride the legs through the flail -- a group-parented boot
  // keeps its group-space offset while the leg rotates away from it, which
  // reads as a detached boot tumbling beside the leg. Local (0, -0.45, 0.02)
  // reproduces the exact rest alignment (group-space y = 0.52 - 0.45 = 0.07),
  // lowest point still at y = 0 (feet at origin).
  const legGeo = new THREE.CapsuleGeometry(0.055, 0.32, 2, 6);
  const bootGeo = new THREE.SphereGeometry(0.07, 6, 5);
  for (const [name, x] of [['hipL', -0.09], ['hipR', 0.09]]) {
    const hip = new THREE.Group();
    hip.name = name;
    hip.position.set(x, 0.52, 0);
    avatar.userData.pivots[name] = hip;
    const leg = new THREE.Mesh(legGeo, suit);
    leg.position.y = -0.21;
    hip.add(leg);
    const boot = new THREE.Mesh(bootGeo, bootMat);
    boot.position.set(0, -0.45, 0.02);
    hip.add(boot);
    avatar.add(hip);
  }

  // Torso: snow suit body, same slate-blue as the limbs.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.22, 2, 8), suit);
  torso.position.y = 0.68;
  torso.scale.set(1, 1, 0.85);
  avatar.add(torso);

  // Arms: shoulder pivots with a slight outward rest angle, golden gloves.
  const armGeo = new THREE.CapsuleGeometry(0.05, 0.26, 2, 6);
  const mittGeo = new THREE.SphereGeometry(0.06, 6, 5);
  for (const [name, x, rest] of [['shoulderL', -0.175, -0.12], ['shoulderR', 0.175, 0.12]]) {
    const shoulder = new THREE.Group();
    shoulder.name = name;
    shoulder.position.set(x, 0.82, 0);
    shoulder.rotation.z = rest;
    avatar.userData.pivots[name] = shoulder;
    const arm = new THREE.Mesh(armGeo, suit);
    arm.position.y = -0.17;
    shoulder.add(arm);
    const mitt = new THREE.Mesh(mittGeo, gold);
    mitt.position.y = -0.36;
    shoulder.add(mitt);
    avatar.add(shoulder);
  }

  // Scarf: golden ring at the neck, tucked under the hood. The hood shell
  // passes outside the ring's top edge all the way round, so the hood
  // overlaps the scarf; the front gold arc stays visible below the chin.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.04, 6, 14), gold);
  ring.position.y = 0.87;
  ring.rotation.x = Math.PI / 2;
  avatar.add(ring);

  // Head: neck pivot. The face is a small sphere recessed inside the hood,
  // smaller than the hood and trim around it; its front pole sits behind the
  // trim's front plane. Front sector kept around +z, back truncated (hidden
  // inside the hood). The face is the painted canvas texture only: there are
  // no separate eye or cheek meshes.
  // Hood: big slate-blue shell over the back with a front opening. It stops
  // short of the poles (thetaStart/thetaLength), so the opening edge is made
  // of smooth arcs: no diamond, cat-eye, or pointed top-and-chin shape.
  // Trim: a bigger, fatter cream torus. It is a perfect circle, so it frames
  // a ROUND face opening, buries the shell's front rim, and reads fluffy.
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 0.88, 0);
  avatar.userData.pivots.neck = neck;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 8, 6, -0.4292, 4.0),
    skin
  );
  head.position.set(0, 0.2, -0.03);
  neck.add(head);
  const hood = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 10, 6, Math.PI / 2 + 1.05, Math.PI * 2 - 2.1, 0.5, 2.05),
    hoodMat
  );
  hood.position.y = 0.2;
  neck.add(hood);
  const trimRing = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.065, 8, 10), trim);
  trimRing.position.set(0, 0.2, 0.1);
  neck.add(trimRing);
  avatar.add(neck);

  return avatar;
}

// Ridiculousness dial for the fall flail, pass 1. Default 1: solemn ≈ 0.35,
// default 1, FUCK YES ≈ 2. It scales ONLY flail amplitude, spring, lag and
// overshoot. It must never change gravity, impulse, friction, bounce,
// terrain, path, or landing.
export const flailConfig = { level: 1 };

// Per-avatar flail memory: rest pose, lagged spin, fold spring.
const flailMemory = new WeakMap();

function flailMem(avatar) {
  let m = flailMemory.get(avatar);
  if (!m) {
    const P = avatar.userData.pivots;
    m = {
      t: 0,
      rest: {
        neck: P.neck.rotation.clone(),
        shoulderL: P.shoulderL.rotation.clone(),
        shoulderR: P.shoulderR.rotation.clone(),
        hipL: P.hipL.rotation.clone(),
        hipR: P.hipR.rotation.clone(),
      },
      lag: { x: 0, y: 0, z: 0 },
      fold: 0,
      foldV: 0,
    };
    flailMemory.set(avatar, m);
  }
  return m;
}

// Procedural tumbling flail (presentation only): shoulders, hips and neck
// rotate from the body's speed, spin, and impact pulses. Written baseline
// from a group-fall reference: headfirst phases, cartwheels, limbs spread /
// tucked / trailing, limbs lagging the body's turn, folding on impact and
// rebounding after. Never one uniform windmill: each joint gets its own
// phase offset, frequency, and lag.
// st: { phase, speed, spin {x,y,z}, impact, airborne }. dt in seconds.
export function updateFlail(avatar, st, dt) {
  const P = avatar.userData.pivots;
  if (!P) return;
  const L = flailConfig.level;
  const m = flailMem(avatar);
  const dts = Math.min(Math.max(dt, 0), 0.05);
  m.t += dts;

  const falling = st.phase === 'falling';
  if (!falling) {
    // At rest (idle or landed): ease every joint to its neutral pose and
    // hold it exactly. No oscillation, no twitch: amplitude here is
    // identically zero, springs parked.
    const k = 1 - Math.exp(-8 * dts);
    let far = false;
    for (const key of ['neck', 'shoulderL', 'shoulderR', 'hipL', 'hipR']) {
      const j = P[key];
      const r0 = m.rest[key];
      j.rotation.x += (r0.x - j.rotation.x) * k;
      j.rotation.y += (r0.y - j.rotation.y) * k;
      j.rotation.z += (r0.z - j.rotation.z) * k;
      if (Math.abs(r0.x - j.rotation.x) + Math.abs(r0.y - j.rotation.y) +
          Math.abs(r0.z - j.rotation.z) > 1e-4) far = true;
    }
    if (!far) {
      for (const key of ['neck', 'shoulderL', 'shoulderR', 'hipL', 'hipR']) {
        P[key].rotation.copy(m.rest[key]);
      }
    }
    m.lag.x = m.lag.y = m.lag.z = 0;
    m.fold = 0;
    m.foldV = 0;
    return;
  }
  const energy = Math.min(1, st.speed / 30);

  // Lagged spin: joints trail the body's turn instead of matching it.
  const lagRate = 3 / (0.6 + L);
  const k = 1 - Math.exp(-lagRate * dts);
  m.lag.x += (st.spin.x - m.lag.x) * k;
  m.lag.y += (st.spin.y - m.lag.y) * k;
  m.lag.z += (st.spin.z - m.lag.z) * k;

  // Fold spring: impacts slam the limbs in, then rebound with overshoot.
  const foldTarget = falling ? Math.min(1, (st.impact || 0) / 18) : 0;
  const stiff = 26 + 30 * L;
  const damp = 2 * Math.sqrt(stiff) * 0.35;
  m.foldV += ((foldTarget - m.fold) * stiff - m.foldV * damp) * dts;
  m.fold += m.foldV * dts;

  const w = m.t * (3 + energy * 7);
  const A = L * (0.15 + energy * 1.5);
  const trail = st.airborne ? energy * 0.45 * L : 0;
  const spinCouple = 0.06 * L;

  const set = (joint, rest, x, y, z) => {
    joint.rotation.set(rest.x + x, rest.y + y, rest.z + z);
  };

  // Cartwheel arms on opposite phases, spread/tuck on a slower cycle.
  set(P.shoulderL, m.rest.shoulderL,
    A * Math.sin(w) + m.lag.z * spinCouple - trail - m.fold * 0.7,
    A * 0.5 * Math.sin(w * 0.5 + 1.1),
    A * 0.6 * Math.sin(w * 0.5));
  set(P.shoulderR, m.rest.shoulderR,
    A * Math.sin(w + Math.PI) + m.lag.z * spinCouple - trail - m.fold * 0.7,
    A * 0.5 * Math.sin(w * 0.5 + 2.4),
    -A * 0.6 * Math.sin(w * 0.5 + 0.7));
  // Legs bicycle, trail behind in the air, tuck hard on fold.
  set(P.hipL, m.rest.hipL,
    A * 0.8 * Math.sin(w * 0.9 + 2.1) - trail * 0.7 - m.fold * 1.0,
    0,
    A * 0.25 * Math.sin(w * 0.45 + 0.4));
  set(P.hipR, m.rest.hipR,
    A * 0.8 * Math.sin(w * 0.9 + 2.1 + Math.PI) - trail * 0.7 - m.fold * 1.0,
    0,
    -A * 0.25 * Math.sin(w * 0.45 + 1.8));
  // Headfirst pitching with wobble; chin tucks on fold.
  set(P.neck, m.rest.neck,
    A * 0.6 * Math.sin(w * 0.7 + 1.3) + m.fold * 0.5 + m.lag.x * spinCouple,
    A * 0.3 * Math.sin(w * 0.45 + 2.9),
    A * 0.35 * Math.sin(w * 0.6 + 0.5) + m.lag.z * spinCouple * 0.5);
}

// Two-act visual tumble (presentation only): the BODY keeps the deterministic
// fall (path, impacts, timing, landing untouched); only how the avatar GROUP
// rotates is reshaped. A persistent visual quaternion integrates a
// descent-scaled copy of the body's angular velocity plus small multi-axis
// extras (yaw about world up, roll about the fall line), so Act 1 reads at
// roughly half rate with her face findable and Act 2 goes tornadic.
// MOOD-independent: descent only; limb flail keeps its flailConfig amplitude.
// The visual rejoins the body near the ground and resets off-fall, so the
// landed look-back stands with no residual twist. Reduced motion flattens the
// scaling to 1x and drops the extras.
export const SPIN_RATE_ACT1 = 0.5;
export const SPIN_RATE_ACT2 = 2.0;
export const SPIN_ACT1_END = 0.5;
export const SPIN_ACT2_START = 0.75;
export const SPIN_YAW_EXTRA = 1.1;
export const SPIN_ROLL_EXTRA = 0.8;
// Rejoin window: visual eases back to the body's true orientation.
const SPIN_RECON_FROM = 0.85;
const SPIN_RECON_TO = 0.98;
// Fall-line horizontal (same FACE as the chute): the extra roll axis.
const SPIN_FX = Math.cos(Math.PI / 4);
const SPIN_FZ = Math.sin(Math.PI / 4);

// Named curve: half rate to ~50%, smooth ramp through the third quarter,
// double rate for the bottom quarter.
export function spinScaleForDescent(d) {
  if (d <= SPIN_ACT1_END) return SPIN_RATE_ACT1;
  if (d >= SPIN_ACT2_START) return SPIN_RATE_ACT2;
  const t = (d - SPIN_ACT1_END) / (SPIN_ACT2_START - SPIN_ACT1_END);
  const e = t * t * (3 - 2 * t);
  return SPIN_RATE_ACT1 + (SPIN_RATE_ACT2 - SPIN_RATE_ACT1) * e;
}

const _tq = new THREE.Quaternion();
const _tbody = new THREE.Quaternion();
const _tax = new THREE.Vector3();
const _toff = new THREE.Vector3();
const _tup = new THREE.Vector3(0, 1, 0);
const _troll = new THREE.Vector3(SPIN_FX, 0, SPIN_FZ);
const spinMem = new WeakMap();

function spinMemFor(avatar) {
  let m = spinMem.get(avatar);
  if (!m) {
    m = { q: new THREE.Quaternion(), init: false };
    spinMem.set(avatar, m);
  }
  return m;
}

function spinReducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function resetVisualTumble(avatar) {
  spinMemFor(avatar).init = false;
}

// Falling: sets group position exactly as the body-rider always has, and the
// decoupled visual orientation. Any other phase only parks the memory so the
// next fall starts from the body's true pose.
export function updateVisualTumble(avatar, body, speed, descent, dt, phase) {
  const m = spinMemFor(avatar);
  if (phase !== 'falling') {
    m.init = false;
    return;
  }
  const dts = Math.min(Math.max(dt, 0), 0.05);
  // Position: identical to the rider the fall has always used.
  _toff.set(0, 0.65, 0).applyQuaternion(body.quaternion);
  avatar.position.set(
    body.position.x - _toff.x,
    body.position.y - _toff.y,
    body.position.z - _toff.z
  );
  if (!m.init) {
    m.q.copy(body.quaternion);
    m.init = true;
  }
  const dd = Math.min(Math.max(descent || 0, 0), 1);
  const reduced = spinReducedMotion();
  const s = reduced ? 1 : spinScaleForDescent(dd);
  const wx = body.angularVelocity.x, wy = body.angularVelocity.y, wz = body.angularVelocity.z;
  const wlen = Math.hypot(wx, wy, wz);
  if (wlen > 1e-4 && s > 0) {
    _tax.set(wx / wlen, wy / wlen, wz / wlen);
    _tq.setFromAxisAngle(_tax, wlen * s * dts);
    m.q.premultiply(_tq);
  }
  if (!reduced) {
    const e = Math.min(1, speed / 25) * s;
    if (e > 1e-4) {
      _tq.setFromAxisAngle(_tup, SPIN_YAW_EXTRA * e * dts);
      m.q.premultiply(_tq);
      _tq.setFromAxisAngle(_troll, SPIN_ROLL_EXTRA * e * dts);
      m.q.premultiply(_tq);
    }
  }
  // Reconverge over the last stretch: rejoin the body's true orientation so
  // the landing (and its ease upright) starts with no residual twist.
  const rb = THREE.MathUtils.smoothstep(dd, SPIN_RECON_FROM, SPIN_RECON_TO);
  if (rb > 0) {
    _tbody.copy(body.quaternion);
    m.q.slerp(_tbody, 1 - Math.exp(-(2 + 10 * rb) * dts));
  }
  avatar.quaternion.copy(m.q);
}
