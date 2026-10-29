import * as CANNON from 'cannon-es';
import * as THREE from 'three';

// Fall-loop physics, pass 1 (fix 2: finite colliders). ONE dynamic body (a
// sphere) carries the avatar. The visual mountain in js/scene.js is never
// touched and never trimeshed: the body collides with simplified INVISIBLE
// proxies aligned to the chute constants read from that file:
//   SUMMIT_Y = 600, FACE = PI/4 (chute azimuth),
//   chuteR(y) = 630 - y for y >= 60 (clean 45-degree chute),
//   runout r = 570 + (60 - y) * 0.5 for y < 60,
//   landing disc: radius 700, top surface at y = 0.3.
//
// Root cause of the instant endFall (fix 1 diagnostics proved it): the old
// runout collider was an INFINITE one-sided plane through (r=570, y=60) with
// normal (0.894 radial, 0.447 up). LAUNCH_POS sits at signed distance
//   0.894*(91-570) + 0.447*(541.7-60) = -213.0
// from it -- 213 m on its NEGATIVE side. A cannon-es Plane is infinite, so
// the solver saw a 213 m penetration on the very first step and ejected the
// body (oob-far within 0.4 s; the recorded 6.0 m/s impact is the launch
// velocity projected on that plane's normal). Verified independently, twice.
// Fix: every terrain-segment collider is now a FINITE thin box whose top
// surface lies on the segment line. A body outside a box's region feels
// nothing from it, so no plane can ever grab the body from hundreds of
// metres behind its surface again. Infinite planes remain NOWHERE.

// Chute azimuth (radians around Y), same FACE as js/scene.js.
export const CHUTE_AZIMUTH = Math.PI / 4;
// Avatar proxy: one sphere body, pass 1 (no multi-body ragdoll).
export const BODY_RADIUS = 0.7;
// Gravity tuned so the ~800 m ride takes roughly 15-25 s with contact.
export const GRAVITY = -9.82;
// Slope contact: enough grip to tumble, enough bounce to ping off the rock.
export const SLOPE_FRICTION = 0.25;
export const SLOPE_RESTITUTION = 0.35;
// Landing contact: deader than the slope so the run settles into a slide-out.
export const LAND_FRICTION = 0.4;
export const LAND_RESTITUTION = 0.2;
// Side guides stay gentle: low friction, soft bounce.
export const GUIDE_FRICTION = 0.1;
export const GUIDE_RESTITUTION = 0.15;
// Guide inner faces sit this far either side of the fall line.
export const GUIDE_INNER = 14;
// Hard termination: no fall runs longer than this, under any circumstances.
export const FALL_TIME_LIMIT = 35;

// Launch: on the clean skirt chute BELOW the visual shoulder band
// (shoulder rock spans y 534-576 with no chute mask, and swallows the old
// r=91/y=542 launch; boulders all sit at y <= 500). Surface point
// (r=100, y=530) lifted 2.7 m along the slope normal: x = z = 72.06,
// y = 531.91, radial 101.9, body (r = 0.7) starting 2 m clear of the box.
export const LAUNCH_POS = { x: 72.06, y: 531.91, z: 72.06 };
// One outward impulse: ~5 m/s out along the fall line, ~3.5 m/s up, so the
// body arcs off the rim and its first contact is the slope ~10 m down.
export const LAUNCH_VEL = { x: 3.54, y: 3.5, z: 3.54 };

function radialDir() {
  return new CANNON.Vec3(Math.cos(CHUTE_AZIMUTH), 0, Math.sin(CHUTE_AZIMUTH));
}

function sideDir() {
  return new CANNON.Vec3(-Math.sin(CHUTE_AZIMUTH), 0, Math.cos(CHUTE_AZIMUTH));
}

// Box collider descriptor: centre, orientation (THREE quaternion from an
// orthonormal basis: local Y = surface normal, local Z = downslope tangent,
// local X = Y cross Z), half extents. Top face (local +Y) lies on the
// segment line; the solid extends below it.
function solidBox(world, material, desc) {
  const b = new CANNON.Body({
    mass: 0,
    material,
    shape: new CANNON.Box(new CANNON.Vec3(desc.h.x, desc.h.y, desc.h.z)),
  });
  b.position.set(desc.c.x, desc.c.y, desc.c.z);
  b.quaternion.set(desc.q.x, desc.q.y, desc.q.z, desc.q.w);
  world.addBody(b);
  return b;
}

function basisQuat(n, t) {
  const yA = new THREE.Vector3(n.x, n.y, n.z).normalize();
  const zA = new THREE.Vector3(t.x, t.y, t.z).normalize();
  const xA = new THREE.Vector3().crossVectors(yA, zA).normalize();
  // Re-orthogonalise z against the (already perpendicular) pair.
  const zB = new THREE.Vector3().crossVectors(xA, yA).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(xA, yA, zB)
  );
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

// Signed clearance from a point to a box solid (negative = penetration
// depth). Proves at runtime that the spawn sits outside every solid.
const _bv = new THREE.Vector3();
const _bq = new THREE.Quaternion();
function boxClearance(desc, p) {
  _bv.set(p.x - desc.c.x, p.y - desc.c.y, p.z - desc.c.z);
  _bq.set(desc.q.x, desc.q.y, desc.q.z, desc.q.w).invert();
  _bv.applyQuaternion(_bq);
  const qx = Math.abs(_bv.x) - desc.h.x;
  const qy = Math.abs(_bv.y) - desc.h.y;
  const qz = Math.abs(_bv.z) - desc.h.z;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  const outside = Math.sqrt(ox * ox + oy * oy + oz * oz);
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  return outside + inside;
}

// Spawn is summit.userData.playerStart: the avatar idles there until Jump.
export function createFall(spawn) {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, GRAVITY, 0),
  });
  world.broadphase = new CANNON.NaiveBroadphase();
  world.allowSleep = false;

  const bodyMat = new CANNON.Material('avatar');
  const slopeMat = new CANNON.Material('slope');
  const landMat = new CANNON.Material('landing');
  const guideMat = new CANNON.Material('guide');
  world.addContactMaterial(new CANNON.ContactMaterial(bodyMat, slopeMat, {
    friction: SLOPE_FRICTION,
    restitution: SLOPE_RESTITUTION,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(bodyMat, landMat, {
    friction: LAND_FRICTION,
    restitution: LAND_RESTITUTION,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(bodyMat, guideMat, {
    friction: GUIDE_FRICTION,
    restitution: GUIDE_RESTITUTION,
  }));

  const er = radialDir();
  const et = sideDir();
  const erT = { x: er.x, y: 0, z: er.z };
  const etT = { x: et.x, y: 0, z: et.z };

  // THE slope: one box from (r=80, y=550) to (r=570, y=60) along the
  // 45-degree line y = 630 - r. No pocket, wedge, or crossing anywhere.
  const slopeN = { x: erT.x * 0.70710678, y: 0.70710678, z: erT.z * 0.70710678 };
  const slopeT = { x: erT.x * 0.70710678, y: -0.70710678, z: erT.z * 0.70710678 };
  const slopeMid = { x: erT.x * 325 - slopeN.x, y: 305 - slopeN.y, z: erT.z * 325 - slopeN.z };
  const slopeBox = {
    name: 'SLOPE',
    c: slopeMid,
    q: basisQuat(slopeN, slopeT),
    h: { x: 16, y: 1, z: 346.48 },
  };
  solidBox(world, slopeMat, slopeBox);

  // Steeper runout box from (r=570, y=60) to (r=600, y=0), meeting the slope
  // box exactly at (r=570, y=60): continuous kink, no step, no gap.
  const footN = { x: erT.x * 0.8944, y: 0.4472, z: erT.z * 0.8944 };
  const footT = { x: erT.x * 0.4472, y: -0.8944, z: erT.z * 0.4472 };
  const footMid = { x: erT.x * 585 - footN.x, y: 30 - footN.y, z: erT.z * 585 - footN.z };
  const footBox = {
    name: 'FOOT',
    c: footMid,
    q: basisQuat(footN, footT),
    h: { x: 16, y: 1, z: 33.54 },
  };
  solidBox(world, slopeMat, footBox);

  // Flat landing box, top at the landing disc top (y = 0.3), 6 thick so the
  // steep runout exit cannot tunnel through it.
  const landBox = {
    name: 'LAND',
    c: { x: 0, y: -2.7, z: 0 },
    q: { x: 0, y: 0, z: 0, w: 1 },
    h: { x: 700, y: 3, z: 700 },
  };
  solidBox(world, landMat, landBox);

  // Guide walls: vertical boxes flanking the chute, inner faces at lateral
  // ±14, spanning r 80-600 and y 0-600. Finite: past their ends (or above
  // them, impossible) the body simply feels nothing.
  const guideBoxes = [];
  for (const side of [1, -1]) {
    const gc = {
      x: erT.x * 340 + etT.x * side * (GUIDE_INNER + 2),
      y: 300,
      z: erT.z * 340 + etT.z * side * (GUIDE_INNER + 2),
    };
    // -45-degree yaw about Y maps local +X to +er (fall line) and local +Z
    // to et (lateral): length runs in X, thickness in Z, height in Y.
    const gq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 4);
    const guideBox = {
      name: side > 0 ? 'GUIDE-A' : 'GUIDE-B',
      c: gc,
      q: { x: gq.x, y: gq.y, z: gq.z, w: gq.w },
      h: { x: 260, y: 300, z: 2 },
    };
    solidBox(world, guideMat, guideBox);
    guideBoxes.push(guideBox);
  }

  const boxes = [slopeBox, footBox, landBox, ...guideBoxes];

  const body = new CANNON.Body({
    mass: 1,
    material: bodyMat,
    shape: new CANNON.Sphere(BODY_RADIUS),
  });
  body.position.set(spawn.x, spawn.y, spawn.z);
  body.angularDamping = 0.05;
  body.linearDamping = 0.01;
  world.addBody(body);

  // Fall facts for later gods; no god code in this step.
  const facts = {
    phase: 'idle',
    time: 0,
    impacts: 0,
    strongest: 0,
    airtime: 0,
    resets: 0,
    endReason: '—',
  };
  const lastImpact = { strength: 0, age: 99 };
  let settle = 0;
  let touching = false;

  body.addEventListener('collide', (e) => {
    if (facts.phase !== 'falling') return;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v > 1.5) {
      facts.impacts += 1;
      if (v > facts.strongest) facts.strongest = v;
      lastImpact.strength = v;
      lastImpact.age = 0;
    }
  });

  function placeAt(pos, vel) {
    body.position.set(pos.x, pos.y, pos.z);
    body.velocity.set(vel.x, vel.y, vel.z);
    body.angularVelocity.set(0, 0, 0);
    body.quaternion.set(0, 0, 0, 1);
  }

  // Jump: teleport to the chute top with one outward impulse. Facts restart.
  function launch() {
    placeAt(LAUNCH_POS, LAUNCH_VEL);
    facts.phase = 'falling';
    facts.time = 0;
    facts.impacts = 0;
    facts.strongest = 0;
    facts.airtime = 0;
    facts.resets = 0;
    facts.endReason = '—';
    lastImpact.strength = 0;
    lastImpact.age = 99;
    settle = 0;
  }

  // Back to top: park at the summit spawn, everything zeroed, facts cleared.
  function resetToTop() {
    placeAt(spawn, { x: 0, y: 0, z: 0 });
    facts.phase = 'idle';
    facts.time = 0;
    facts.impacts = 0;
    facts.strongest = 0;
    facts.airtime = 0;
    facts.resets = 0;
    facts.endReason = '—';
    lastImpact.strength = 0;
    lastImpact.age = 99;
    settle = 0;
  }

  // Visible end: the fall STOPS here. Phase to idle, body parked at launch,
  // facts frozen (kept, not cleared), resets counter incremented, and the
  // reason written into the readout so the next failure names itself:
  // oob-nan (non-finite state), oob-low (below the world), oob-far (left
  // the proxies sideways), oob-high (left the world upward), timeout
  // (35 s hard cap). The app parks the avatar on the body and flips the
  // button to Jump. No silent continuation, ever.
  function endFall(reason) {
    placeAt(LAUNCH_POS, { x: 0, y: 0, z: 0 });
    facts.phase = 'idle';
    facts.resets += 1;
    facts.endReason = reason;
    settle = 0;
  }

  // Per-box spawn clearance, recomputed live: signed distance from the body
  // centre to each solid minus the body radius. Negative means inside rock.
  function gapsAt(p) {
    const g = {};
    for (const b of boxes) g[b.name] = boxClearance(b, p) - BODY_RADIUS;
    return g;
  }

  function step(dt) {
    if (facts.phase === 'falling') {
      world.step(1 / 60, dt, 3);
      facts.time += dt;
      lastImpact.age += dt;

      touching = false;
      for (const c of world.contacts) {
        if (c.bi === body || c.bj === body) {
          touching = true;
          break;
        }
      }
      if (!touching) facts.airtime += dt;

      const p = body.position;
      const speed = body.velocity.length();
      const r = Math.hypot(p.x, p.z);
      if (!Number.isFinite(p.x + p.y + p.z + speed)) {
        endFall('oob-nan');
      } else if (p.y < -30) {
        endFall('oob-low');
      } else if (r > 1500) {
        endFall('oob-far');
      } else if (p.y > 2000) {
        endFall('oob-high');
      } else if (facts.time > FALL_TIME_LIMIT) {
        endFall('timeout');
      } else if ((p.y < 3 && speed < 3) || (r > 595 && p.y < 8 && speed < 6)) {
        settle += dt;
        if (settle > 1.2) {
          facts.phase = 'landed';
          facts.endReason = 'landed';
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
        }
      } else {
        settle = 0;
      }
    }
    return getState();
  }

  function getState() {
    const p = body.position;
    return {
      phase: facts.phase,
      time: facts.time,
      impacts: facts.impacts,
      strongest: facts.strongest,
      airtime: facts.airtime,
      resets: facts.resets,
      endReason: facts.endReason,
      gaps: gapsAt({ x: p.x, y: p.y, z: p.z }),
      pos: { x: p.x, y: p.y, z: p.z },
      r: Math.hypot(p.x, p.z),
      // Live motion for the avatar sync, the flail, and the readout.
      speed: body.velocity.length(),
      spin: { x: body.angularVelocity.x, y: body.angularVelocity.y, z: body.angularVelocity.z },
      airborne: facts.phase === 'falling' && !touching,
      impact: lastImpact.strength * Math.exp(-3 * lastImpact.age),
    };
  }

  return { world, body, launch, resetToTop, step, getState };
}
