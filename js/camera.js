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

// Fall camera. mode 'chase': back-and-up offset aligned to the chute,
// smoothed with a lerp; the camera never rolls with the avatar's tumble.
// mode 'lookback': low and near the avatar, looking up at the summit.
export function updateFallCamera(camera, avatar, dt, mode) {
  const d = chaseDistance;
  if (mode === 'lookback') {
    _desired.set(
      avatar.position.x - CHUTE_FX * 4.5,
      avatar.position.y + 1.1,
      avatar.position.z - CHUTE_FZ * 4.5
    );
    camera.position.lerp(_desired, 1 - Math.exp(-2 * dt));
    camera.lookAt(SUMMIT_LOOK);
    return;
  }
  _desired.set(
    avatar.position.x - CHUTE_FX * d,
    avatar.position.y + d * 0.5,
    avatar.position.z - CHUTE_FZ * d
  );
  camera.position.lerp(_desired, 1 - Math.exp(-3 * dt));
  _look.set(avatar.position.x, avatar.position.y + 1, avatar.position.z);
  camera.lookAt(_look);
}
