// FROZEN CONTRACT (base commit af21917): app.js only wires modules.
// Fan-out agents: do not change these imports or the boot order.
// scene.js: createScene() -> { scene, summit }; summit.userData.playerStart (Vector3) is the spawn.
// avatar.js: createAvatar() -> THREE.Group, origin at feet.
// camera.js: createCamera(avatar) -> camera; placeBehindAvatar(camera, avatar).
// Fall set wiring (pass 1) is appended below the original boot lines:
// physics.js owns the fall body and facts, ui.js owns the button/readout.
import * as THREE from 'three';
import { createScene } from './scene.js';
import { createAvatar, updateFlail } from './avatar.js';
import { createCamera, placeBehindAvatar, updateFallCamera, bumpChaseDistance, snapChaseCamera, kickCamera } from './camera.js';
import { CHUTE_AZIMUTH } from './physics.js';
import { createFall, BODY_RADIUS } from './physics.js';
import { getUI, setButtonMode, setFacts } from './ui.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const { scene, summit } = createScene();

const avatar = createAvatar();
const spawn = summit.userData.playerStart;
avatar.position.copy(spawn);
scene.add(avatar);

const camera = createCamera(avatar);

const mountain = scene.getObjectByName('mountain');
const fall = createFall(spawn, mountain);
const ui = getUI();
setButtonMode(ui, 'jump');

function syncAvatarToBody() {
  avatar.position.set(
    fall.body.position.x,
    fall.body.position.y - BODY_RADIUS,
    fall.body.position.z
  );
  avatar.quaternion.copy(fall.body.quaternion);
}

function doJump() {
  if (fall.getState().phase !== 'falling') {
    fall.launch();
    // Cut straight to the action: the bound holds the frame from here.
    syncAvatarToBody();
    snapChaseCamera(camera, avatar, fall.body.velocity);
    setButtonMode(ui, 'falling');
  }
}

function doReset() {
  fall.resetToTop();
  avatar.position.copy(spawn);
  avatar.quaternion.identity();
  placeBehindAvatar(camera, avatar);
  setFacts(ui, fall.getState(), camera);
  setButtonMode(ui, 'jump');
}

ui.button.addEventListener('click', () => {
  const phase = fall.getState().phase;
  if (phase === 'landed') doReset();
  else doJump();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    doJump();
  } else if (e.code === 'KeyR') {
    doReset();
  }
});

// Wheel zoom changes chase distance only, never direction or steering.
window.addEventListener('wheel', (e) => {
  bumpChaseDistance(e.deltaY > 0 ? 1.1 : 1 / 1.1);
}, { passive: true });

// Pinch zoom (touch): two-finger spread changes chase distance only.
let pinchD0 = 0;
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    pinchD0 = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && pinchD0 > 0) {
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    bumpChaseDistance(pinchD0 / d);
    pinchD0 = d;
  }
}, { passive: true });
canvas.addEventListener('touchend', () => { pinchD0 = 0; }, { passive: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
let prevPhase = 'idle';
let prevHitId = 0;
// Landed rest pose: filled in on the falling -> landed transition.
let restPose = null;
const IDENTITY_Q = new THREE.Quaternion();
const _er = { x: Math.cos(CHUTE_AZIMUTH), z: Math.sin(CHUTE_AZIMUTH) };
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const s = fall.step(dt);

  // Impact kick: a fresh hard bounce pops the look target. Felt, not a flash.
  if (s.hitId !== prevHitId) {
    prevHitId = s.hitId;
    if (s.lastHitV > 4) kickCamera(s.lastHitV);
  }

  if (s.phase === 'falling') {
    // Mid-fall: all player input is ignored (no steering of any kind).
    // The body, the flail, and the chase camera do all the work.
    restPose = null;
    syncAvatarToBody();
    updateFallCamera(camera, avatar, dt, 'chase', fall.body.velocity);
  } else if (s.phase === 'landed') {
    // Parked: ease the avatar upright at its rest spot, then hold the
    // look-back shot. One camera writer per frame, never a fight.
    if (restPose) {
      avatar.position.lerp(restPose.pos, 1 - Math.exp(-2 * dt));
      avatar.quaternion.slerp(IDENTITY_Q, 1 - Math.exp(-3 * dt));
    }
    updateFallCamera(camera, avatar, dt, 'lookback', fall.body.velocity);
  }
  // Idle holds whatever placeBehindAvatar set on transition.

  updateFlail(avatar, s, dt);
  setFacts(ui, s, camera);
  if (s.phase === 'landed' && prevPhase !== 'landed') {
    setButtonMode(ui, 'top');
    // Rest spot in the open apron: a few metres downslope of where the body
    // settled, feet on the landing top, clamped inside the disc. Presentation
    // park only; the physics facts stay exactly as recorded.
    let px = avatar.position.x + _er.x * 4;
    let pz = avatar.position.z + _er.z * 4;
    const rr = Math.hypot(px, pz);
    if (rr > 690) {
      px *= 690 / rr;
      pz *= 690 / rr;
    }
    restPose = { pos: new THREE.Vector3(px, 0.3, pz) };
  }
  if (s.phase === 'idle' && prevPhase === 'falling') {
    // Visible end (escape or time limit): the body is parked at launch with
    // facts frozen. Park the avatar on it, restore the summit view, and
    // offer a fresh Jump. Never leave the player staring at fog.
    syncAvatarToBody();
    placeBehindAvatar(camera, avatar);
    setButtonMode(ui, 'jump');
  }
  prevPhase = s.phase;

  renderer.render(scene, camera);
});
