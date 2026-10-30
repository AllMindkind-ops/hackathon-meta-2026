import * as CANNON from 'cannon-es';
import * as THREE from 'three';

// Fall-loop physics, pass 1 (fix 4: ride the visible surface). ONE dynamic
// body (a sphere) carries the avatar. The visual mountain in js/scene.js is
// never touched and never trimeshed: the body collides with simplified
// INVISIBLE proxies aligned to the chute.
//
// History: fix 1 removed a crossing infinite-plane wedge at the spawn; fix 2
// proved an infinite runout plane sat 213 m behind the spawn and ejected the
// body on step one; fix 3 replaced every terrain collider with finite boxes.
// This fix samples the VISIBLE surface itself: segment boxes laid on the max
// rock surface along the chute centreline (skirt chute, dome/shoulder
// overlap, runout), so the body rides what the player sees - never under it,
// never floating above it. Every collider stays finite.
// Fix 5: the 1.3 NaN was zone damping 2.5 (cannon-es damps with
// Math.pow(1-d, dt), so d >= 1 NaNs velocity on the first zone frame);
// zone braking is manual scaling now. Retuned slower with bounce rhythm,
// deader foot material, bounces counted as airborne->contact transitions.

// Chute azimuth (radians around Y), same FACE as js/scene.js.
export const CHUTE_AZIMUTH = Math.PI / 4;
// Avatar proxy: one sphere body, pass 1 (no multi-body ragdoll).
export const BODY_RADIUS = 0.7;
// Retuned for a slow cruise with bounce rhythm: lighter gravity for floatier
// air, moderate slope friction so it skids and tumbles instead of rolling
// smooth, lively slope restitution for visible hops, linear damping as the
// top-speed governor, grabby foot material so the 63-degree foot brakes
// instead of re-accelerating. (Fix 7: angular-damping-while-touching
// reverted -- it sedated the roll. Damping is constant again; the only
// delta vs 1.5 is linear 0.1 -> 0.12.)
export const GRAVITY = -5.5;
// Slope contact: skiddy enough to tumble, bouncy enough to leave the rock.
export const SLOPE_FRICTION = 0.45;
export const SLOPE_RESTITUTION = 0.6;
// Damping, pass 6 reverted: angular damping 0.6 while touching turned the
// roll into a crawl (a rolling sphere's spin IS its motion). Constant 0.08
// everywhere; linear 0.12 as the whole roll cap (was 0.1 in 1.5).
// Predicted: slope terminal ~17.8 m/s, ~14 at r=200, ~17 at r=400,
// ~18 at the foot exit, ~50-56 s down.
export const ANG_DAMP = 0.08;
export const LIN_DAMP = 0.12;
// Steep runout contact: deliberately grabby + dead bounce so the foot acts
// as a brake pad instead of re-accelerating: caps peak speed at ~21-22 m/s
// on exit (the 60 m foot drop otherwise floors the peak near 26).
export const FOOT_FRICTION = 2.0;
export const FOOT_RESTITUTION = 0.15;
// Landing contact: deader than the slope so the run settles into a slide-out.
export const LAND_FRICTION = 1.0;
export const LAND_RESTITUTION = 0.2;
// Side guides stay gentle: low friction, soft bounce.
export const GUIDE_FRICTION = 0.1;
export const GUIDE_RESTITUTION = 0.15;
// Guide inner faces sit this far either side of the fall line.
export const GUIDE_INNER = 14;
// Bottom capture zone (r, y): manual velocity braking, high friction,
// backstop. (Never cannon damping >= 1 here: Math.pow(1-d, dt) NaNs.)
export const ZONE_R_MIN = 595;
export const ZONE_R_MAX = 680;
export const ZONE_Y = 4;
// Retention per second applied manually to velocity + spin inside the zone.
export const ZONE_BRAKE = 0.15;
export const ZONE_SETTLE_SPEED = 3;
export const ZONE_SETTLE_TIME = 0.5;
export const ZONE_MAX_TIME = 2.5;
// Hard termination: no fall runs longer than this, under any circumstances.
export const FALL_TIME_LIMIT = 75;
// Launch radial: surface height is sampled from the visible profile, plus
// clearance straight up (provable 2 m skin clearance whatever the local dip).
export const LAUNCH_R = 102;
export const LAUNCH_CLEARANCE = 2.7;
// One outward impulse: ~5 m/s out along the fall line, ~3.5 m/s up.
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
  const zB = new THREE.Vector3().crossVectors(xA, yA).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(xA, yA, zB)
  );
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

// Signed clearance from a point to a box solid (negative = penetration).
// Used live: the readout proves the spawn sits outside every solid.
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

// Sample the VISIBLE rock surface along the chute centreline: cast rays
// straight down at successive radii and take the highest rock hit. Clouds
// (transparent billboards) and pine billboards (instanced) are skipped;
// dome, shoulder, skirt, boulders and the landing disc all count. Falls back
// to the chuteR line where a ray hits nothing.
function sampleProfile(raycaster, meshes, er) {
  const dir = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();
  const pts = [];
  // Fix 8: 8 m spacing (was 24). A sphere rolling on 24 m colinear planks
  // has no normal velocity for restitution to return, so the mid-slope
  // stayed glued (bn frozen, gap pinned). At 8 m the sampled kinks -- ring
  // joints every ~17 m in y, vertex jitter to +/-0.36 m downslope, mesh
  // transitions -- survive into the collision surface as 2-5 deg kinks that
  // relaunch the body. Same raycast source, same mesh rules, same 0.4 m
  // joint overlap, same launch derivation; 63 samples -> 62 segment boxes.
  for (let r = 90; r <= 570; r += 8) pts.push(r);
  pts.push(585, 600);
  const profile = [];
  for (const r of pts) {
    origin.set(er.x * r, 1500, er.z * r);
    raycaster.set(origin, dir);
    const hits = raycaster.intersectObjects(meshes, false);
    let h = null;
    for (const hit of hits) {
      const o = hit.object;
      if (o.isInstancedMesh) continue;
      if (o.geometry && o.geometry.type === 'PlaneGeometry') continue;
      h = hit.point.y;
      break;
    }
    if (h === null) h = r <= 570 ? 630 - r : 60 - (r - 570) * 2;
    profile.push({ r, h });
  }
  return profile;
}

function profileHeightAt(profile, r) {
  if (r <= profile[0].r) return profile[0].h;
  for (let i = 1; i < profile.length; i++) {
    if (r <= profile[i].r) {
      const a = profile[i - 1], b = profile[i];
      const t = (r - a.r) / (b.r - a.r);
      return a.h + (b.h - a.h) * t;
    }
  }
  return profile[profile.length - 1].h;
}

// Spawn is summit.userData.playerStart: the avatar idles there until Jump.
// scenery is the mountain group: profile rays test its rock meshes.
export function createFall(spawn, scenery) {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, GRAVITY, 0),
  });
  world.broadphase = new CANNON.NaiveBroadphase();
  world.allowSleep = false;

  const bodyMat = new CANNON.Material('avatar');
  const slopeMat = new CANNON.Material('slope');
  const footMat = new CANNON.Material('foot');
  const landMat = new CANNON.Material('landing');
  const guideMat = new CANNON.Material('guide');
  world.addContactMaterial(new CANNON.ContactMaterial(bodyMat, slopeMat, {
    friction: SLOPE_FRICTION,
    restitution: SLOPE_RESTITUTION,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(bodyMat, footMat, {
    friction: FOOT_FRICTION,
    restitution: FOOT_RESTITUTION,
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

  const boxes = [];
  const box = (name, material, c, q, h) => {
    const desc = { name, c, q, h };
    solidBox(world, material, desc);
    boxes.push(desc);
    return desc;
  };

  // Segment boxes on the sampled visible surface: one finite box per
  // profile segment, top face through its two sample heights, 2 thick.
  // If the mountain group is missing, rays hit nothing and every sample
  // falls back to the chuteR line -- never a blank page.
  const rockMeshes = [];
  if (scenery) {
    scenery.updateMatrixWorld(true);
    scenery.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh && o.geometry && o.geometry.type !== 'PlaneGeometry') {
        rockMeshes.push(o);
      }
    });
  }
  const raycaster = new THREE.Raycaster();
  raycaster.far = 2000;
  const profile = sampleProfile(raycaster, rockMeshes, erT);
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1], b = profile[i];
    const dr = b.r - a.r, dh = b.h - a.h;
    const len = Math.hypot(dr, dh);
    const n = { x: erT.x * (-dh / len), y: dr / len, z: erT.z * (-dh / len) };
    const t = { x: erT.x * (dr / len), y: dh / len, z: erT.z * (dr / len) };
    const mr = (a.r + b.r) / 2, mh = (a.h + b.h) / 2;
    const segLen = len / 2 + 0.4;
    const segName = i < profile.length - 2 ? `SLOPE-${i}` : 'FOOT';
    box(segName, segName === 'FOOT' ? footMat : slopeMat,
      { x: erT.x * mr - n.x, y: mh - n.y, z: erT.z * mr - n.z },
      basisQuat(n, t),
      { x: 16, y: 1, z: segLen });
  }

  // Flat landing box, top at the landing disc top (y = 0.3), 6 thick so the
  // steep runout exit cannot tunnel through it.
  box('LAND', landMat,
    { x: 0, y: -2.7, z: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
    { x: 700, y: 3, z: 700 });

  // Guide walls: vertical boxes flanking the chute, inner faces at lateral
  // Â±14, spanning r 80-600 and y 0-600. -45-degree yaw maps local X to the
  // fall line (length) and local Z across it (thickness).
  const gq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 4);
  const guideQ = { x: gq.x, y: gq.y, z: gq.z, w: gq.w };
  for (const side of [1, -1]) {
    box(side > 0 ? 'GUIDE-A' : 'GUIDE-B', guideMat,
      {
        x: erT.x * 340 + etT.x * side * (GUIDE_INNER + 2),
        y: 300,
        z: erT.z * 340 + etT.z * side * (GUIDE_INNER + 2),
      },
      guideQ,
      { x: 260, y: 300, z: 2 });
  }

  // Backstop: invisible finite wall across the chute at about r = 680, in
  // case anything skips the capture zone at speed. Landing contact.
  box('BACKSTOP', landMat,
    { x: erT.x * 680, y: 3, z: erT.z * 680 },
    guideQ,
    { x: 2, y: 3, z: 20 });

  // Launch from the sampled surface at LAUNCH_R, clearance straight up:
  // provable skin clearance whatever the local dip.
  const launchH = profileHeightAt(profile, LAUNCH_R);
  const launchPos = { x: erT.x * LAUNCH_R, y: launchH + LAUNCH_CLEARANCE, z: erT.z * LAUNCH_R };

  const body = new CANNON.Body({
    mass: 1,
    material: bodyMat,
    shape: new CANNON.Sphere(BODY_RADIUS),
  });
  body.position.set(spawn.x, spawn.y, spawn.z);
  body.angularDamping = ANG_DAMP;
  body.linearDamping = LIN_DAMP;
  world.addBody(body);

  // Fall facts for later gods; no god code in this step.
  const facts = {
    phase: 'idle',
    time: 0,
    impacts: 0,
    strongest: 0,
    airtime: 0,
    bounces: 0,
    resets: 0,
    endReason: '-',
  };
  const lastImpact = { strength: 0, age: 99 };
  const lastHit = { id: 0, speed: 0 };
  let settle = 0;
  let zoneTime = 0;
  let airSinceContact = 0;
  let touching = false;
  let wasTouching = false;

  body.addEventListener('collide', (e) => {
    if (facts.phase !== 'falling') return;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v > 1.5) {
      facts.impacts += 1;
      if (v > facts.strongest) facts.strongest = v;
      lastImpact.strength = v;
      lastImpact.age = 0;
      lastHit.id += 1;
      lastHit.speed = v;
    }
  });

  function placeAt(pos, vel) {
    body.position.set(pos.x, pos.y, pos.z);
    body.velocity.set(vel.x, vel.y, vel.z);
    body.angularDamping = ANG_DAMP;
    body.linearDamping = LIN_DAMP;
    body.angularVelocity.set(0, 0, 0);
    body.quaternion.set(0, 0, 0, 1);
  }

  // Jump: teleport to the chute top with one outward impulse. Facts restart.
  function launch() {
    placeAt(launchPos, LAUNCH_VEL);
    facts.phase = 'falling';
    facts.time = 0;
    facts.impacts = 0;
    facts.strongest = 0;
    facts.airtime = 0;
    facts.bounces = 0;
    facts.resets = 0;
    facts.endReason = '-';
    lastImpact.strength = 0;
    lastImpact.age = 99;
    settle = 0;
    zoneTime = 0;
    airSinceContact = 0;
    wasTouching = false;
  }

  // Back to top: park at the summit spawn, everything zeroed, facts cleared.
  function resetToTop() {
    placeAt(spawn, { x: 0, y: 0, z: 0 });
    facts.phase = 'idle';
    facts.time = 0;
    facts.impacts = 0;
    facts.strongest = 0;
    facts.airtime = 0;
    facts.bounces = 0;
    facts.resets = 0;
    facts.endReason = '-';
    lastImpact.strength = 0;
    lastImpact.age = 99;
    settle = 0;
    zoneTime = 0;
    airSinceContact = 0;
    wasTouching = false;
  }

  // Visible end: the fall STOPS here. Phase to idle, body parked at launch,
  // facts frozen (kept, not cleared), resets counter incremented, and the
  // reason written into the readout so the next failure names itself:
  // oob-nan (non-finite state), oob-low (below the world), oob-far (left
  // the proxies sideways), oob-high (left the world upward), timeout
  // (60 s hard cap). The app parks the avatar on the body and flips the
  // button to Jump. No silent continuation, ever.
  function endFall(reason) {
    placeAt(launchPos, { x: 0, y: 0, z: 0 });
    facts.phase = 'idle';
    facts.resets += 1;
    facts.endReason = reason;
    settle = 0;
    zoneTime = 0;
    airSinceContact = 0;
    wasTouching = false;
  }

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
      if (!touching) {
        facts.airtime += dt;
        airSinceContact += dt;
      }
      // A bounce is an airborne -> contact transition, and only counts when
      // the body was properly airborne (0.25 s off the rock) and recontacts
      // with teeth (normal speed >= 1.5 m/s, judged on the fresh impact of
      // this step). The 0.25 s airtime gate is what excludes box-seam ticks
      // (seam transitions happen with gap ~= 0 and ~zero airtime). Fix 8:
      // the old 2 m/s bar exceeded what faithful mid-slope kinks deliver --
      // a 3-4 deg kink at ~17 m/s launches ~1 m/s normal, and even with
      // valley amplification (the ground falls away over the 8 m flight, so
      // the landing hits 1.5-2.5 m/s) most real mid-slope hops land under
      // 2. Dropping a ~0.3 m hop onto rock IS a bounce; the bar now says so.
      if (touching && !wasTouching) {
        if (airSinceContact >= 0.25 && lastImpact.age <= 0.1 && lastImpact.strength >= 1.5) {
          facts.bounces += 1;
        }
        airSinceContact = 0;
      }
      wasTouching = touching;

      const p = body.position;
      const speed = body.velocity.length();
      const r = Math.hypot(p.x, p.z);
      // Root cause of the 1.3 NaN (fix 5): cannon-es applies damping as
      // velocity *= Math.pow(1 - damping, dt), so any damping >= 1 NaNs the
      // velocity on the first stepped frame (Math.pow of a negative base).
      // Zone damping was 2.5: the body entered the capture zone healthy and
      // died there. Zone braking is now manual scaling (always safe), and
      // body damping stays below 1 everywhere.
      const inZone = r >= ZONE_R_MIN && r <= ZONE_R_MAX && p.y < ZONE_Y + 1;
      if (inZone) {
        const brake = Math.pow(ZONE_BRAKE, dt);
        body.velocity.scale(brake, body.velocity);
        body.angularVelocity.scale(brake, body.angularVelocity);
        zoneTime += dt;
        if (zoneTime > ZONE_MAX_TIME && speed >= ZONE_SETTLE_SPEED) {
          body.velocity.scale(0.9, body.velocity);
          body.angularVelocity.scale(0.9, body.angularVelocity);
        }
      }

      if (!Number.isFinite(p.x + p.y + p.z + speed)) {
        // Sanitize first: zero the garbage so nothing downstream inherits
        // it. A body that is positionally inside the landing zone when this
        // happens is treated as landed, not reset.
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        if (Number.isFinite(p.x + p.y + p.z) && r >= ZONE_R_MIN && r <= ZONE_R_MAX && p.y < ZONE_Y + 1) {
          facts.phase = 'landed';
          facts.endReason = 'landed';
        } else {
          endFall('oob-nan');
        }
      } else if (p.y < -30) {
        endFall('oob-low');
      } else if (r > 1500) {
        endFall('oob-far');
      } else if (p.y > 2000) {
        endFall('oob-high');
      } else if (facts.time > FALL_TIME_LIMIT) {
        endFall('timeout');
      } else if ((p.y < 3 && speed < ZONE_SETTLE_SPEED) || (inZone && speed < ZONE_SETTLE_SPEED)) {
        settle += dt;
        if (settle > ZONE_SETTLE_TIME) {
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
    const gaps = gapsAt({ x: p.x, y: p.y, z: p.z });
    let worst = null, worstName = '';
    for (const k of Object.keys(gaps)) {
      if (worst === null || gaps[k] < worst) {
        worst = gaps[k];
        worstName = k;
      }
    }
    return {
      phase: facts.phase,
      time: facts.time,
      impacts: facts.impacts,
      strongest: facts.strongest,
      airtime: facts.airtime,
      bounces: facts.bounces,
      hitId: lastHit.id,
      lastHitV: lastHit.speed,
      resets: facts.resets,
      endReason: facts.endReason,
      gaps,
      gapWorst: worst,
      gapBox: worstName,
      pos: { x: p.x, y: p.y, z: p.z },
      r: Math.hypot(p.x, p.z),
      // Live motion for the avatar sync, the flail, the camera, and the readout.
      speed: body.velocity.length(),
      spin: { x: body.angularVelocity.x, y: body.angularVelocity.y, z: body.angularVelocity.z },
      airborne: facts.phase === 'falling' && !touching,
      impact: lastImpact.strength * Math.exp(-3 * lastImpact.age),
    };
  }

  // The sampled centreline profile leaves with the handle so the camera's
  // standoff rule measures against the SAME heights the colliders ride.
  return { world, body, launch, resetToTop, step, getState, launchPos, profile };
}
