import * as THREE from 'three';

// FROZEN CONTRACT: keep createCamera(avatar) and placeBehindAvatar(camera, avatar).
// The camera set owns this file; other sets must not change these signatures.
// Third-person default camera. Placeholder: replaced by the camera set later.
//
// TEMPORARY REVIEW ONLY (mountain-1): frameWideView, frameLookbackView, and
// attachReviewViews exist so the 600 m mountain can be reviewed. Remove before merge.
export function createCamera(avatar) {
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    4000
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

// TEMPORARY REVIEW ONLY: whole mountain in one frame.
// Azimuth 135 deg is side-on to the chute (FACE = 45 deg), so the fall line,
// flanking boulder walls, and dome breadth read in profile instead of
// foreshortening into a wedge. Distance ~1370 m fits the 1200 m foot and the
// 1400 m landing rim at FOV 60: summit ~14 deg off-axis, near rim ~28 deg
// against a 30 deg vertical half-FOV.
export function frameWideView(camera) {
  camera.position.set(-954.6, 500, 954.6);
  camera.lookAt(0, 270, 0);
}

// TEMPORARY REVIEW ONLY: from the runout apron on the chute side, looking
// back up the fall line at the boulders and the dome towering above.
export function frameLookbackView(camera) {
  camera.position.set(500, 25, 500);
  camera.lookAt(0, 450, 0);
}

// TEMPORARY REVIEW ONLY: keys 1/2/3 or tap cycle the three views.
// Whole mountain is the default so a plain reload shows the dome.
// Review views keep the evening fog color with range extended for review
// distance: scene fog 100-900 would swallow the mountain from ~1370 m.
export function attachReviewViews(camera, avatar, scene) {
  const badge = document.getElementById('badge');
  const normalFog = scene.fog;
  const reviewFog = new THREE.Fog(0xeaa972, 500, 2600);
  const views = [
    ['Whole mountain (-954.6, 500, 954.6) to (0, 270, 0)', () => { scene.fog = reviewFog; frameWideView(camera); }],
    ['Summit close-up', () => { scene.fog = normalFog; placeBehindAvatar(camera, avatar); }],
    ['Look-back from bottom (500, 25, 500) to (0, 450, 0)', () => { scene.fog = reviewFog; frameLookbackView(camera); }],
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