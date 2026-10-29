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

// Visual-terrain clearance for the fall camera (fix 1). The chase offset sits
// inward and up of the avatar -- near the summit that point is INSIDE the
// curved dome rock (dome surface at radial ~79 reaches y ~553+ridge while the
// old desired point sat at y ~547), which strobed interior/exterior views.
// The desired point is now clamped above a conservative terrain height built
// from the same js/scene.js constants (dome cap + summit bowl, chute line,
// runout, landing apron), with margin for the dome's sculpted ridges.
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
// Exactly one write path per frame: clamp above the visual rock, one lerp,
// one lookAt. The camera never rolls with the avatar's tumble (up stays +Y).
export function updateFallCamera(camera, avatar, dt, mode) {
  const d = chaseDistance;
  if (mode === 'lookback') {
    _desired.set(
      avatar.position.x - CHUTE_FX * 4.5,
      avatar.position.y + 1.1,
      avatar.position.z - CHUTE_FZ * 4.5
    );
  } else {
    _desired.set(
      avatar.position.x - CHUTE_FX * d,
      avatar.position.y + d * 0.5,
      avatar.position.z - CHUTE_FZ * d
    );
  }
  const floor = terrainClearanceY(_desired.x, _desired.z);
  if (_desired.y < floor) _desired.y = floor;
  camera.position.lerp(_desired, 1 - Math.exp(-(mode === 'lookback' ? 2 : 3) * dt));
  if (mode === 'lookback') {
    camera.lookAt(SUMMIT_LOOK);
  } else {
    _look.set(avatar.position.x, avatar.position.y + 1, avatar.position.z);
    camera.lookAt(_look);
  }
}
