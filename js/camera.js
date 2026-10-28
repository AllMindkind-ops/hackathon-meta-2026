import * as THREE from 'three';

// FROZEN CONTRACT: keep createCamera(avatar) and placeBehindAvatar(camera, avatar).
// The camera set owns this file; other sets must not change these signatures.
// Third-person default camera. Placeholder: replaced by the camera set later.
//
// TEMPORARY REVIEW ONLY (mountain-1): frameWideView, frameLookbackView, and
// attachReviewViews exist so the 300 m mountain can be reviewed. Remove before merge.
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

// TEMPORARY REVIEW ONLY: whole mountain in one frame from a distance.
export function frameWideView(camera) {
  camera.position.set(440, 360, 440);
  camera.lookAt(0, 280, 0);
}

// TEMPORARY REVIEW ONLY: from the landing apron, looking back up at the summit.
export function frameLookbackView(camera) {
  camera.position.set(610, 12, 60);
  camera.lookAt(0, 560, 0);
}

// TEMPORARY REVIEW ONLY: keys 1/2/3 or tap cycle the three views.
// Wide and look-back views relax the fog so the rock reads at distance;
// the summit view restores it.
export function attachReviewViews(camera, avatar, scene) {
  const badge = document.getElementById('badge');
  const normalFog = scene.fog;
  const clearFog = new THREE.Fog(0x87a5c4, 400, 2500);
  const views = [
    ['Summit close-up', () => { scene.fog = normalFog; placeBehindAvatar(camera, avatar); }],
    ['Whole mountain', () => { scene.fog = clearFog; frameWideView(camera); }],
    ['Look-back from bottom', () => { scene.fog = clearFog; frameLookbackView(camera); }],
  ];
  let i = 0;
  const show = (n) => {
    i = (n + views.length) % views.length;
    views[i][1]();
    if (badge) badge.textContent = `Mountain review: ${views[i][0]} (${i + 1}/3, tap or key)`;
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === '1') show(0);
    if (e.key === '2') show(1);
    if (e.key === '3') show(2);
  });
  window.addEventListener('pointerdown', () => show(i + 1));
  show(0);
}
