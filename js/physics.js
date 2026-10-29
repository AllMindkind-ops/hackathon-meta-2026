import * as CANNON from 'cannon-es';

// Fall-loop physics, pass 1 (fix 1: spawn pocket removed). ONE dynamic body
// (a sphere) carries the avatar. The visual mountain in js/scene.js is never
// touched and never trimeshed: the body collides with simplified INVISIBLE
// proxies aligned to the chute constants read from that file:
//   SUMMIT_Y = 600, FACE = PI/4 (chute azimuth),
//   chuteR(y) = 630 - y for y >= 60 (clean 45-degree chute),
//   runout r = 570 + (60 - y) * 0.5 for y < 60,
//   landing disc: radius 700, top surface at y = 0.3.
//
// Root cause of the stuck fall (fixed here): the old build had TWO crossing
// infinite planes at the spawn -- a steep plunge plane through (r=62, y=574)
// and the main 45-degree plane -- intersecting along a line at (r=92, y=538),
// about 1 m downslope of the launch (r=90.9, y=540.92), with only ~0.3 m of
// spawn clearance over the plunge surface. The body could wedge/buzz between
// the two planes instead of taking the slope (max speed pinned at launch
// speed, hundreds of impacts, airtime inflating, phase stuck FALLING), and
// the old silent auto-reset teleported it back to launch with the facts still
// counting. Now there is exactly ONE slope plane at the top, the spawn sits
// 2 m clear of it, the first contact is the slope after the launch arc, and
// every auto-reset ENDS the fall visibly instead of looping silently.

// Chute azimuth (radians around Y), same FACE as js/scene.js.
export const CHUTE_AZIMUTH = Math.PI / 4;
// Avatar proxy: one sphere body, pass 1 (no multi-body ragdoll).
export const BODY_RADIUS = 0.7;
// Gravity tuned so the ~800 m ride takes roughly 15-25 s with contact.
export const GRAVITY = -9.82;
// Slope contact: enough grip to tumble, enough bounce to ping off the rock.
export const SLOPE_FRICTION = 0.25;
export const SLOPE_RESTITUTION = 0.35;
// Side guides stay gentle: low friction, soft bounce.
export const GUIDE_FRICTION = 0.1;
export const GUIDE_RESTITUTION = 0.15;
export const GUIDE_HALF_WIDTH = 14;
// Hard termination: no fall runs longer than this, under any circumstances.
export const FALL_TIME_LIMIT = 35;

// Launch: top of the chute run (y = 540 -> r = 630 - 540 = 90), lifted 2.7 m
// above the single 45-degree slope line so the body (r = 0.7) starts 2 m
// clear of every proxy: radial 91.0 -> x = z = 64.35, y = 541.7.
export const LAUNCH_POS = { x: 64.35, y: 541.7, z: 64.35 };
// One outward impulse: ~5 m/s out along the fall line, ~3.5 m/s up, so the
// body arcs off the rim and its first contact is the slope ~10 m down.
export const LAUNCH_VEL = { x: 3.54, y: 3.5, z: 3.54 };

function radialDir() {
  return new CANNON.Vec3(Math.cos(CHUTE_AZIMUTH), 0, Math.sin(CHUTE_AZIMUTH));
}

function sideDir() {
  return new CANNON.Vec3(-Math.sin(CHUTE_AZIMUTH), 0, Math.cos(CHUTE_AZIMUTH));
}

function staticPlane(world, material, normal, point) {
  const b = new CANNON.Body({
    mass: 0,
    material,
    shape: new CANNON.Plane(),
  });
  b.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), normal);
  b.position.set(point.x, point.y, point.z);
  world.addBody(b);
  return b;
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
  const guideMat = new CANNON.Material('guide');
  world.addContactMaterial(new CANNON.ContactMaterial(bodyMat, slopeMat, {
    friction: SLOPE_FRICTION,
    restitution: SLOPE_RESTITUTION,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(bodyMat, guideMat, {
    friction: GUIDE_FRICTION,
    restitution: GUIDE_RESTITUTION,
  }));

  const er = radialDir();
  const et = sideDir();

  // THE slope: one continuous 45-degree plane, surface y = 630 - r, normal
  // (er + up) / sqrt(2), anchored mid-chute (r = 330 -> x = z = 233.35).
  // It runs unbroken from above the launch to the slope foot, so there is no
  // pocket, wedge, or crossing anywhere near the spawn.
  const mainN = new CANNON.Vec3(er.x * 0.70710678, 0.70710678, er.z * 0.70710678);
  staticPlane(world, slopeMat, mainN, new CANNON.Vec3(233.35, 300, 233.35));

  // Steeper foot where the visual chute runout narrows (r = 570 -> 600 as
  // y = 60 -> 0, ~63 degrees), carrying the body onto the landing.
  const footN = new CANNON.Vec3(er.x * 0.8944, 0.4472, er.z * 0.8944);
  footN.unit(footN);
  staticPlane(world, slopeMat, footN, new CANNON.Vec3(er.x * 570, 60, er.z * 570));

  // Flat landing plane at the landing disc top (y = 0.3).
  staticPlane(world, slopeMat, new CANNON.Vec3(0, 1, 0), new CANNON.Vec3(0, 0.3, 0));

  // Gentle side guides: vertical planes parallel to the fall line, centred
  // on the chute, keeping the body from wandering off the fall line.
  staticPlane(world, guideMat,
    new CANNON.Vec3(-et.x, 0, -et.z),
    new CANNON.Vec3(et.x * GUIDE_HALF_WIDTH, 300, et.z * GUIDE_HALF_WIDTH));
  staticPlane(world, guideMat,
    new CANNON.Vec3(et.x, 0, et.z),
    new CANNON.Vec3(-et.x * GUIDE_HALF_WIDTH, 300, -et.z * GUIDE_HALF_WIDTH));

  const body = new CANNON.Body({
    mass: 1,
    material: bodyMat,
    shape: new CANNON.Sphere(BODY_RADIUS),
  });
  body.position.set(spawn.x, spawn.y, spawn.z);
  body.angularDamping = 0.05;
  body.linearDamping = 0.01;
  world.addBody(body);

  // Runtime proof the spawn is clear: signed distance from LAUNCH_POS to
  // every proxy plane, recomputed here in plain JS from the same normals and
  // anchors used above. The readout shows the minimum gap; anything under
  // the body radius means the spawn intersects rock and the launch is
  // invalid on its face. Expected: main plane ~2.0, guides 14, foot/landing
  // hundreds (behind/below, no contact).
  function planeGap(n, q) {
    return n.x * (LAUNCH_POS.x - q.x) + n.y * (LAUNCH_POS.y - q.y) + n.z * (LAUNCH_POS.z - q.z);
  }
  const spawnGap = Math.min(
    planeGap({ x: er.x * 0.70710678, y: 0.70710678, z: er.z * 0.70710678 }, { x: 233.35, y: 300, z: 233.35 }),
    planeGap({ x: er.x * 0.8944, y: 0.4472, z: er.z * 0.8944 }, { x: er.x * 570, y: 60, z: er.z * 570 }),
    planeGap({ x: 0, y: 1, z: 0 }, { x: 0, y: 0.3, z: 0 }),
    planeGap({ x: -et.x, y: 0, z: -et.z }, { x: et.x * GUIDE_HALF_WIDTH, y: 300, z: et.z * GUIDE_HALF_WIDTH }),
    planeGap({ x: et.x, y: 0, z: et.z }, { x: -et.x * GUIDE_HALF_WIDTH, y: 300, z: -et.z * GUIDE_HALF_WIDTH })
  );

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
      spawnGap,
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
