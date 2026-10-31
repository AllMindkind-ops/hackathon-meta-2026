import * as THREE from 'three';

// FROZEN CONTRACT: keep createCamera(avatar) and placeBehindAvatar(camera, avatar).
// The camera set owns this file; other sets must not change these signatures.
// Third-person default camera. Far plane widened for the 600 m fall so the
// peak stays visible from the landing.
// Fall follow + look-back live in updateFallCamera (added for the fall set).
// Round A: Act 1 tracking ride. Steady damped distance band, hard terrain
// floor sampled ahead, sight-line guarantee, velocity-lead aim, lateral
// profile offset, damped impacts, timed blend from the summit. No cuts.
// Look-back branch is unchanged (landing handoff identical).

// --- Round A named config (reported per round) ---
// Floor margin above terrain at the camera's own position, sampled ahead.
export const FLOOR_MARGIN = 2.5;
// Aim lead ahead of the avatar along its velocity.
export const AIM_LEAD = 0.3;
// Aim drop below the predicted centre so the avatar rides upper-center
// with slope visible below her (tuned: ~7 deg above axis at 5 m).
export const AIM_DROP = 0.55;
// Act 1 steady chase distance band (3D camera-to-body metres). Mid-band
// ~4.75 m puts the ~1.3 m avatar at roughly a quarter of the 60 deg
// vertical FOV height on a phone viewport. A later round adds an Act 2 band.
export const ACT1_DIST_MIN = 4.0;
export const ACT1_DIST_MAX = 5.5;
// Tracking offset: degrees around from directly behind the fall direction
// toward the open side, plus which side (+1 keeps the existing chase side).
export const CHASE_ANGLE_DEG = 40;
export const CHASE_SIDE = 1;
// Summit -> tracking blend: settled well before the first impact.
export const CHASE_BLEND_TIME = 1.0;

// Chute azimuth (same FACE as js/scene.js): the chase offset and the
// look-back view align to the fall line, never to the avatar's tumble.
const CHUTE_FX = Math.cos(Math.PI / 4);
const CHUTE_FZ = Math.sin(Math.PI / 4);
// Lateral (one consistent side) for the chase offset.
const CHUTE_LX = -Math.sin(Math.PI / 4);
const CHUTE_LZ = Math.cos(Math.PI / 4);
// Look-back clearance: the apron is known-flat rock, so the look-back
// holds a 1.5 m floor instead of the chase margin.
const LOOKBACK_CLEARANCE = 1.5;
// Sight-line clearance: the camera->avatar segment clears rock by this.
const SIGHT_CLEAR = 1.0;
// Chase smoothing rates (1/s, exponential damp).
const CHASE_RATE = 3.5;
const BLEND_RATE = 5.0;
const LOOK_RATE = 6.0;
const DIST_RATE = 2.0;
// Split of the band distance into horizontal reach vs height above the
// anchor: 0.88 / 0.47 keeps 3D distance ~= band with ~28 deg elevation so
// the ride sits above the slope plane and bounces read in profile.
const HORIZ_F = 0.88;
const VERT_F = 0.47;
// Anchor prediction (where the body is going) so the follow holds distance
// at speed instead of sagging behind.
const ANCHOR_LEAD = 0.25;

// Sampled centreline profile from physics (set once at boot): the colliders
// are laid on these heights, so the floor rule measures rock the body
// actually rides instead of the analytic line. Null until setFallProfile.
let fallProfile = null;
export function setFallProfile(p) {
  fallProfile = p;
}

function profileSurfaceY(x, z) {
  if (!fallProfile || fallProfile.length === 0) return -Infinity;
  const r = Math.hypot(x, z);
  if (r <= fallProfile[0].r) return fallProfile[0].h;
  for (let i = 1; i < fallProfile.length; i++) {
    if (r <= fallProfile[i].r) {
      const a = fallProfile[i - 1], b = fallProfile[i];
      const t = (r - a.r) / (b.r - a.r);
      return a.h + (b.h - a.h) * t;
    }
  }
  return fallProfile[fallProfile.length - 1].h;
}

// Chase state: wheel / pinch zoom changes the target distance only, clamped
// to the Act 1 band; _dist damps toward it so terrain never drives distance.
let chaseDistance = (ACT1_DIST_MIN + ACT1_DIST_MAX) / 2;
let _dist = chaseDistance;
// Summit blend state: snapChaseCamera arms it, updateFallCamera settles it.
let _blending = false;
let _blendT = 0;
// Smoothed look target: the avatar jolts inside the frame on impacts while
// the frame itself never snaps.
let _lookInit = false;
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _lookSm = new THREE.Vector3();
const _anchor = new THREE.Vector3();
const _pull = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _prevCam = new THREE.Vector3();
let _havePrev = false;

// Impact kick: a fresh bounce pops the look target up to 0.15 m,
// decaying fast. Felt, never a strobe. Skipped under reduced motion.
let kick = 0;
let kickT = 1;

export function kickCamera(normalSpeed) {
  kick = Math.min(1, normalSpeed / 10);
  kickT = 0;
}

function reducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Visual-terrain height for the fall camera, from the same js/scene.js
// constants (dome cap + summit bowl, chute line, runout, landing apron).
const DOME_R = 90;
const DOME_BASE = 510;
const BOWL_R = 30;
const BOWL_Y = 600;

function chuteSurfaceY(r) {
  if (r <= 570) return 630 - r;
  if (r <= 600) return 60 - (r - 570) * 2;
  return 0.3;
}

function rockHeightY(x, z) {
  const r = Math.hypot(x, z);
  let y = chuteSurfaceY(r);
  if (r < DOME_R + 5) {
    const dome = r < BOWL_R ? BOWL_Y : DOME_BASE + Math.sqrt(Math.max(0, DOME_R * DOME_R - r * r));
    if (dome > y) y = dome;
  }
  return y;
}

// Hard floor at (x, z): the higher of analytic rock and sampled profile
// surface, plus the margin. Max keeps the camera out of the visual mesh
// where the follow swings alongside the widening lower skirt.
function floorY(x, z) {
  const a = rockHeightY(x, z);
  const p = profileSurfaceY(x, z);
  const surf = p > a ? p : a;
  return surf + FLOOR_MARGIN;
}

export function setChaseDistance(d) {
  chaseDistance = THREE.MathUtils.clamp(d, ACT1_DIST_MIN, ACT1_DIST_MAX);
}

export function bumpChaseDistance(f) {
  setChaseDistance(chaseDistance * f);
}

export function getChaseDistance() {
  return chaseDistance;
}

export function createCamera(avatar) {
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    3000
  );
  camera.name = 'third-person-camera';
  placeBehindAvatar(camera, avatar);
  return camera;
}

export function placeBehindAvatar(camera, avatar) {
  camera.position.set(
    avatar.position.x - 3.2,
    avatar.position.y + 2.4,
    avatar.position.z + 4.2
  );
  camera.lookAt(
    avatar.position.x,
    avatar.position.y + 1.4,
    avatar.position.z
  );
}

// Lift the desired point so the whole travel segment (current -> desired)
// clears the floor: for each sample the segment height must beat the local
// floor, which solves to a lift on the desired end. Returns metres to add.
function aheadLift(cx, cy, cz, dx, dy, dz) {
  let lift = 0;
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    const px = cx + (dx - cx) * t;
    const pz = cz + (dz - cz) * t;
    const segY = cy + (dy - cy) * t;
    const need = floorY(px, pz) - segY;
    if (need > 0) {
      const d = need / t;
      if (d > lift) lift = d;
    }
  }
  return lift;
}

// Sight-line lift: the segment camera -> look target must clear rock by
// SIGHT_CLEAR. Line height at t is cy*(1-t)+ay*t; requiring
// >= rockH+CLEAR solves to cy >= (rockH+CLEAR-t*ay)/(1-t). Max over samples.
function sightLift(cx, cy, cz, ax, ay, az) {
  let lift = 0;
  for (let i = 1; i <= 8; i++) {
    const t = 0.05 + i * 0.1;
    if (t >= 1) continue;
    const px = cx + (ax - cx) * t;
    const pz = cz + (az - cz) * t;
    const rockH = rockHeightY(px, pz);
    const need = (rockH + SIGHT_CLEAR - t * ay) / (1 - t) - cy;
    if (need > lift) lift = need;
  }
  return lift > 0 ? lift : 0;
}

// Fall camera. mode 'chase': Act 1 tracking ride from a damped distance
// band, offset laterally so bounces read in profile, aimed with a velocity
// lead and a downward bias for upper-center framing. mode 'lookback':
// unchanged landing framing. Exactly one lookAt per call; up stays +Y.
export function updateFallCamera(camera, avatar, dt, mode, vel) {
  const dts = Math.min(Math.max(dt, 0), 0.05);
  const reduced = reducedMotion();

  if (mode === 'lookback') {
    _blending = false;
    _desired.set(
      avatar.position.x + CHUTE_FX * 4.5,
      avatar.position.y + 1.1,
      avatar.position.z + CHUTE_FZ * 4.5
    );
    _look.set(
      avatar.position.x - CHUTE_FX * 3,
      avatar.position.y + 2.3,
      avatar.position.z - CHUTE_FZ * 3
    );
    const margin = LOOKBACK_CLEARANCE;
    const floor = rockHeightY(_desired.x, _desired.z) + margin;
    if (_desired.y < floor) _desired.y = floor;
    camera.position.lerp(_desired, 1 - Math.exp(-2 * dts));
    const rock = rockHeightY(camera.position.x, camera.position.z) + margin;
    if (camera.position.y < rock) camera.position.y = rock;
    camera.lookAt(_look);
    _lookInit = false;
    _havePrev = false;
    return;
  }

  // Chase: deliberate damped distance, never terrain-driven.
  const target = THREE.MathUtils.clamp(chaseDistance, ACT1_DIST_MIN, ACT1_DIST_MAX);
  if (_blending) {
    // Snap the distance at blend start so framing is right from frame one;
    // the position still travels smoothly (no cut).
    _dist = target;
  } else {
    _dist += (target - _dist) * (1 - Math.exp(-DIST_RATE * dts));
  }

  // Anchor on the body's predicted centre: avatar origin rides near the
  // body centre mid-fall, +0.65 m recovers centre from feet-origin.
  _anchor.set(avatar.position.x, avatar.position.y + 0.65, avatar.position.z);
  if (vel) {
    _anchor.addScaledVector(_vel.set(vel.x, vel.y, vel.z), ANCHOR_LEAD);
  }

  // Tracking offset: behind the fall line, swung laterally by the named
  // angle toward the open side, elevated above the slope plane.
  const ang = CHASE_ANGLE_DEG * Math.PI / 180;
  const behindW = Math.cos(ang);
  const latW = Math.sin(ang) * CHASE_SIDE;
  const horiz = _dist * HORIZ_F;
  const vert = _dist * VERT_F;
  _desired.set(
    _anchor.x + (-CHUTE_FX * behindW + CHUTE_LX * latW) * horiz,
    _anchor.y + vert,
    _anchor.z + (-CHUTE_FZ * behindW + CHUTE_LZ * latW) * horiz
  );

  // Aim with a lead: predicted centre dropped so the avatar rides
  // upper-center with slope visible below her.
  _look.set(avatar.position.x, avatar.position.y + 0.65, avatar.position.z);
  if (vel) {
    _look.addScaledVector(_vel.set(vel.x, vel.y, vel.z), AIM_LEAD);
  }
  _look.y -= AIM_DROP;
  if (!_lookInit) {
    _lookSm.copy(_look);
    _lookInit = true;
  }

  // Hard floor, sampled ahead along the travel segment.
  _desired.y += aheadLift(
    camera.position.x, camera.position.y, camera.position.z,
    _desired.x, _desired.y, _desired.z
  );

  // Sight-line guarantee on the desired point: raise, and (full motion
  // only) slide further laterally when the lift alone is large.
  const need = sightLift(_desired.x, _desired.y, _desired.z, _look.x, _look.y, _look.z);
  if (need > 0) {
    _desired.y += need;
    if (!reduced) {
      const slide = Math.min(2.0, Math.max(0, need - 2.5) * 0.5);
      if (slide > 0) {
        _desired.x += CHUTE_LX * CHASE_SIDE * slide;
        _desired.z += CHUTE_LZ * CHASE_SIDE * slide;
      }
    }
  }

  // Damped travel: the avatar jolts inside the frame on impacts, the frame
  // itself never whips. Faster during the summit blend so the ride is
  // settled before the first impact.
  if (_blending) {
    _blendT += dts;
    if (_blendT >= CHASE_BLEND_TIME) _blending = false;
  }
  const rate = (_blending && !reduced) ? BLEND_RATE : (reduced ? BLEND_RATE : CHASE_RATE);
  camera.position.lerp(_desired, 1 - Math.exp(-rate * dts));

  // Hard guarantees on the actual position (instant, never a cut): floor at
  // the camera plus one lookahead step along its motion, then sight-line.
  // The lookahead keeps the wide lower skirt from ever swallowing the view.
  let guardY = floorY(camera.position.x, camera.position.z);
  if (_havePrev) {
    _pull.copy(camera.position).sub(_prevCam);
    const mlen = Math.hypot(_pull.x, _pull.z);
    if (mlen > 1e-4) {
      const step = Math.min(2.0, mlen * 8 * dts + 0.5);
      const ax = camera.position.x + (_pull.x / mlen) * step;
      const az = camera.position.z + (_pull.z / mlen) * step;
      const ahead = floorY(ax, az);
      if (ahead > guardY) guardY = ahead;
    }
  }
  if (camera.position.y < guardY) camera.position.y = guardY;
  const fix = sightLift(camera.position.x, camera.position.y, camera.position.z,
    _look.x, _look.y, _look.z);
  if (fix > 0) camera.position.y += fix;
  _prevCam.copy(camera.position);
  _havePrev = true;

  // Smoothed look with a small decaying impact pop (skipped when reduced).
  _lookSm.lerp(_look, 1 - Math.exp(-LOOK_RATE * dts));
  if (!reduced) {
    kickT += dts;
    _lookSm.y += 0.15 * kick * Math.exp(-kickT / 0.07);
  }
  camera.lookAt(_lookSm);
}

// Jump handoff: NO cut. Arm the timed blend from the summit framing into
// the tracking ride; updateFallCamera travels there within CHASE_BLEND_TIME
// (<= 1.2 s) so the ride is settled before the first impact. Distance snaps
// so framing is right from frame one; position never teleports.
export function snapChaseCamera(camera, avatar, vel) {
  void camera;
  void avatar;
  void vel;
  _blending = true;
  _blendT = 0;
  const target = THREE.MathUtils.clamp(chaseDistance, ACT1_DIST_MIN, ACT1_DIST_MAX);
  _dist = target;
}
