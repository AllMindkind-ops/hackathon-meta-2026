import * as THREE from 'three';

// FROZEN CONTRACT: keep createCamera(avatar) and placeBehindAvatar(camera, avatar).
// The camera set owns this file; other sets must not change these signatures.
// Third-person default camera. Far plane widened for the 600 m fall so the
// peak stays visible from the landing.
// Fall follow + look-back live in updateFallCamera (added for the fall set).

// Chute azimuth (same FACE as js/scene.js): the chase offset and the
// look-back view align to the fall line, never to the avatar's tumble.
const CHUTE_FX = Math.cos(Math.PI / 4);
const CHUTE_FZ = Math.sin(Math.PI / 4);
// Summit point the look-back view aims at after landing.
const SUMMIT_LOOK = new THREE.Vector3(0, 590, 0);

// Chase state: wheel / pinch zoom changes distance only (about 6-24 units),
// never direction or steering.
let chaseDistance = 12;
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _anchor = new THREE.Vector3();
const _pull = new THREE.Vector3();
const _vel = new THREE.Vector3();

// Impact kick: a fresh bounce pops the look target up to 0.15 m,
// decaying over ~0.2 s. Felt, never a strobe.
let kick = 0;
let kickT = 1;

export function kickCamera(normalSpeed) {
  kick = Math.min(1, normalSpeed / 10);
  kickT = 0;
}

// Visual-terrain clearance for the fall camera. The chase offset sits
// inward and up of the avatar -- near the summit that point can sit inside
// the curved dome rock -- so desired points are clamped above a conservative
// terrain height built from the same js/scene.js constants (dome cap +
// summit bowl, chute line, runout, landing apron), with margin for the
// dome's sculpted ridges.
const DOME_R = 90;
const DOME_BASE = 510;
const BOWL_R = 30;
const BOWL_Y = 600;
const CAM_CLEARANCE = 7;

function chuteSurfaceY(r) {
  if (r <= 570) return 630 - r;
  if (r <= 600) return 60 - (r - 570) * 2;
  return 0.3;
}

function terrainClearanceY(x, z) {
  const r = Math.hypot(x, z);
  let y = chuteSurfaceY(r);
  if (r < DOME_R + 5) {
    const dome = r < BOWL_R ? BOWL_Y : DOME_BASE + Math.sqrt(Math.max(0, DOME_R * DOME_R - r * r));
    if (dome > y) y = dome;
  }
  return y + CAM_CLEARANCE;
}

export function setChaseDistance(d) {
  chaseDistance = THREE.MathUtils.clamp(d, 6, 24);
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

// Fall camera. mode 'chase': back-and-up offset aligned to the chute;
// mode 'lookback': low and near the avatar, looking up at the summit.
// Exactly one write sequence per call: clamp the desired point above the
// visual rock, lerp toward it, hard-bound the camera inside 1.5x zoom of
// the body anchor (lerp lag alone strands it ~100 m behind at speed),
// clamp the actual position above rock again (the lerp path can sweep
// through the dome), then one lookAt with a small velocity lead.
// The camera never rolls with the avatar's tumble (up stays +Y).
export function updateFallCamera(camera, avatar, dt, mode, vel) {
  const d = chaseDistance;
  // Predicted body position: the follow tracks where the body is going
  // (0.4 s lead), not where the lerp left it, so it holds distance instead
  // of sagging behind at speed.
  _anchor.set(avatar.position.x, avatar.position.y + 1, avatar.position.z);
  if (vel) {
    _anchor.addScaledVector(_vel.set(vel.x, vel.y, vel.z), 0.4);
  }
  if (mode === 'lookback') {
    _desired.set(
      avatar.position.x - CHUTE_FX * 4.5,
      avatar.position.y + 1.1,
      avatar.position.z - CHUTE_FZ * 4.5
    );
  } else {
    _desired.set(
      _anchor.x - CHUTE_FX * d,
      _anchor.y + d * 0.5 - 1,
      _anchor.z - CHUTE_FZ * d
    );
  }
  const floor = terrainClearanceY(_desired.x, _desired.z);
  if (_desired.y < floor) _desired.y = floor;
  camera.position.lerp(_desired, 1 - Math.exp(-(mode === 'lookback' ? 2 : 5) * dt));
  _anchor.set(avatar.position.x, avatar.position.y + 1, avatar.position.z);
  _pull.copy(camera.position).sub(_anchor);
  const dist = _pull.length();
  const maxDist = 1.5 * d;
  if (dist > maxDist) {
    camera.position.copy(_anchor).addScaledVector(_pull, maxDist / dist);
  }
  const rock = terrainClearanceY(camera.position.x, camera.position.z);
  if (camera.position.y < rock) camera.position.y = rock;
  // Look target: the avatar itself with a small velocity lead, computed
  // before the sight-line check below. (The 0.4 s prediction lives in
  // _anchor for the follow; the look target stays on the avatar so it
  // holds centre-frame.)
  if (mode !== 'lookback') {
    _look.set(avatar.position.x, avatar.position.y + 1, avatar.position.z);
    if (vel) {
      _look.addScaledVector(_vel.set(vel.x, vel.y, vel.z), 0.15);
    }
  }
  // Sight-line clearance: the camera position can be legal while the VIEW
  // crosses rock (e.g. over the dome shoulder into the chute top). Sample
  // the segment camera->avatar (t = 0.15..0.85) and raise the camera until
  // the whole line clears the terrain by 2 m. Line height at t is
  // cy*(1-t)+ay*t; requiring >= rockH+2 solves to cy >= (rockH+2-t*ay)/(1-t).
  // Raise-only; framing wins over the distance bound here.
  if (mode !== 'lookback') {
    const ax = _look.x, ay = _look.y, az = _look.z;
    for (let i = 1; i <= 8; i++) {
      const t = 0.05 + i * 0.1;
      const px = camera.position.x + (ax - camera.position.x) * t;
      const pz = camera.position.z + (az - camera.position.z) * t;
      const rockH = terrainClearanceY(px, pz) - CAM_CLEARANCE;
      const need = (rockH + 2 - t * ay) / (1 - t);
      if (need > camera.position.y) camera.position.y = need;
    }
  }
  if (mode === 'lookback') {
    camera.lookAt(SUMMIT_LOOK);
  } else {
    kickT += dt;
    _look.y += 0.15 * kick * Math.exp(-kickT / 0.07);
    camera.lookAt(_look);
  }
}

// Snap the chase camera to the body on Jump: a clean cut to the action so
// the avatar is framed from the first falling frame, then the bound holds it.
export function snapChaseCamera(camera, avatar, vel) {
  const d = chaseDistance;
  _anchor.set(avatar.position.x, avatar.position.y + 1, avatar.position.z);
  if (vel) {
    _anchor.addScaledVector(_vel.set(vel.x, vel.y, vel.z), 0.4);
  }
  camera.position.set(
    _anchor.x - CHUTE_FX * d,
    _anchor.y + d * 0.5 - 1,
    _anchor.z - CHUTE_FZ * d
  );
  const rock = terrainClearanceY(camera.position.x, camera.position.z);
  if (camera.position.y < rock) camera.position.y = rock;
  _look.set(avatar.position.x, avatar.position.y + 1, avatar.position.z);
  camera.lookAt(_look);
}
