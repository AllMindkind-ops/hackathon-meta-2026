import * as CANNON from 'cannon-es';

// Fall-loop physics, pass 1. ONE dynamic body (a sphere) carries the avatar.
// The visual mountain in js/scene.js is never touched and never trimeshed:
// the body collides with simplified INVISIBLE proxies aligned to the chute
// constants read from that file:
//   SUMMIT_Y = 600, FACE = PI/4 (chute azimuth),
//   chuteR(y) = 630 - y for y >= 60 (clean 45-degree chute),
//   runout r = 570 + (60 - y) * 0.5 for y < 60,
//   landing disc: radius 700, top surface at y = 0.3.
// Proxies: a short steep plunge at the top, the main ~45-degree slope, a
// steeper foot section, a flat landing plane, and gentle side guides that
// keep the body in the chute.

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

// Launch: top of the chute run (y = 540 -> r = 630 - 540 = 90), lifted along
// the slope normal by one body radius plus clearance so it starts in air:
// radial 90.9 -> x = z = 64.29, y = 540.92.
export const LAUNCH_POS = { x: 64.29, y: 540.92, z: 64.29 };
// One outward impulse: ~5 m/s out along the fall line, ~3.5 m/s up, so the
// body arcs off the rim, lands on the slope below, and starts tumbling.
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
  world.broadphase = new CANNON.SAPBroadphase(world);
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

  // Main ~45-degree slope: surface y = 630 - r, normal (er + up) / sqrt(2),
  // anchored mid-chute (r = 330 -> x = z = 233.35, y = 300).
  const mainN = new CANNON.Vec3(er.x * 0.70710678, 0.70710678, er.z * 0.70710678);
  staticPlane(world, slopeMat, mainN, new CANNON.Vec3(233.35, 300, 233.35));

  // Short steep plunge at the top: dome rim (r = 62, y = 574) down to the
  // chute top (r = 92, y = 538) at ~50 degrees, matching the visual drop
  // from the summit bowl onto the fall line.
  const plungeN = new CANNON.Vec3(er.x * 0.7688, 0.6407, er.z * 0.7688);
  plungeN.unit(plungeN);
  staticPlane(world, slopeMat, plungeN, new CANNON.Vec3(er.x * 62, 574, er.z * 62));

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

  // Fall facts for later gods; no god code in this step.
  const facts = {
    phase: 'idle',
    time: 0,
    impacts: 0,
    strongest: 0,
    airtime: 0,
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
    lastImpact.strength = 0;
    lastImpact.age = 99;
    settle = 0;
  }

  // Escape hatch: a body that leaves the proxies or the world is put back
  // at the launch with downslope speed; the run and its facts continue.
  function autoReset() {
    placeAt(LAUNCH_POS, { x: 4, y: -5.66, z: 4 });
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
        autoReset();
      } else if (p.y < -30 || r > 1500 || p.y > 2000) {
        autoReset();
      } else if ((p.y < 3 && speed < 3) || (r > 595 && p.y < 8 && speed < 6)) {
        settle += dt;
        if (settle > 1.2) {
          facts.phase = 'landed';
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
    return {
      phase: facts.phase,
      time: facts.time,
      impacts: facts.impacts,
      strongest: facts.strongest,
      airtime: facts.airtime,
      // Live motion for the avatar sync and the flail, pass 1.
      speed: body.velocity.length(),
      spin: { x: body.angularVelocity.x, y: body.angularVelocity.y, z: body.angularVelocity.z },
      airborne: facts.phase === 'falling' && !touching,
      impact: lastImpact.strength * Math.exp(-3 * lastImpact.age),
    };
  }

  return { world, body, launch, resetToTop, step, getState };
}
