// FROZEN CONTRACT (base commit af21917): app.js only wires modules.
// Fan-out agents: do not change these imports or the boot order.
// scene.js: createScene() -> { scene, summit }; summit.userData.playerStart (Vector3) is the spawn.
// avatar.js: createAvatar() -> THREE.Group, origin at feet.
// camera.js: createCamera(avatar) -> camera; placeBehindAvatar(camera, avatar).
// Fall set wiring (pass 1) is appended below the original boot lines:
// physics.js owns the fall body and facts, ui.js owns the button/readout.
// Gods' pass appends: summit intention + MOOD, dice-on-landing, verdict call,
// verdict display, session log. MOOD only sets flailConfig.level: physics
// constants never change.
import * as THREE from 'three';
import { createScene } from './scene.js';
import { createAvatar, updateFlail, flailConfig } from './avatar.js';
import { createCamera, placeBehindAvatar, updateFallCamera, bumpChaseDistance, snapChaseCamera, kickCamera, setFallProfile } from './camera.js';
import { CHUTE_AZIMUTH } from './physics.js';
import { createFall } from './physics.js';
import { getUI, setButtonMode, setFacts, setSummitVisible, setSummitEditable, setMoodUI, setVerdictVisible, showVerdict, clearVerdict } from './ui.js';
import { rollDice, getVerdict, MOOD_FLAIL } from './god.js';

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
// The camera standoff rule measures the same sampled heights the colliders ride.
setFallProfile(fall.profile);
const ui = getUI();
setButtonMode(ui, 'jump');

// Gods' session state. MOOD persists across falls within the session and is
// only a presentation + god-temperature setting. The session log holds one
// entry per completed fall for later bundles, most recent last.
let mood = 'RITUAL';
let intentionForFall = null;
let maxSpeed = 0;
const sessionLog = [];
let verdictToken = 0;
flailConfig.level = MOOD_FLAIL[mood];
setMoodUI(ui, mood);
setSummitVisible(ui, true);
setVerdictVisible(ui, true);

for (const b of ui.moodButtons) {
  b.addEventListener('click', () => {
    mood = b.dataset.mood;
    // MOOD -> flail presentation only. Physics constants never change.
    flailConfig.level = MOOD_FLAIL[mood] ?? 1;
    setMoodUI(ui, mood);
  });
}

const _off = new THREE.Vector3();
function syncAvatarToBody() {
  // Centre pivot while falling ONLY: the 1.3 m avatar sits concentrically
  // inside the 0.7 m body sphere (half-height 0.65 < 0.7) and turns about the
  // body's centre, so flips clear the surface by construction instead of
  // sweeping the head through rock. Idle and landed keep the plain
  // feet-on-ground origin the createAvatar() contract promises.
  _off.set(0, 0.65, 0).applyQuaternion(fall.body.quaternion);
  avatar.position.set(
    fall.body.position.x - _off.x,
    fall.body.position.y - _off.y,
    fall.body.position.z - _off.z
  );
  avatar.quaternion.copy(fall.body.quaternion);
}

function doJump() {
  if (fall.getState().phase !== 'falling') {
    // Whatever is typed (or nothing) is stored for this fall. Wordless
    // falls are first-class: empty input becomes null.
    const typed = ui.intention ? ui.intention.value.trim() : '';
    intentionForFall = typed ? typed : null;
    maxSpeed = 0;
    verdictToken += 1;
    clearVerdict(ui, true);
    setVerdictVisible(ui, false);
    setSummitVisible(ui, false);
    fall.launch();
    // Cut straight to the action: the bound holds the frame from here.
    syncAvatarToBody();
    snapChaseCamera(camera, avatar, fall.body.velocity);
    setButtonMode(ui, 'falling');
  }
}

function doReset() {
  verdictToken += 1;
  intentionForFall = null;
  fall.resetToTop();
  avatar.position.copy(spawn);
  avatar.quaternion.identity();
  placeBehindAvatar(camera, avatar);
  clearVerdict(ui, true);
  setVerdictVisible(ui, true);
  setSummitVisible(ui, true);
  setFacts(ui, fall.getState(), camera);
  setButtonMode(ui, 'jump');
  setSummitEditable(ui, true);
}

ui.button.addEventListener('click', () => {
  const phase = fall.getState().phase;
  if (phase === 'landed') doReset();
  else doJump();
});

window.addEventListener('keydown', (e) => {
  // Typing must never launch: ignore game keys from text inputs, so a
  // multi-word intention keeps its spaces. Space with the field unfocused
  // still jumps.
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
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

// A completed fall, as the gods will receive it. facts_summary + verdict as
// actually shown; session entries accumulate most-recent-last.
function factsSummary(s) {
  return {
    duration_s: s.time,
    impacts: s.impacts,
    strongest_impact_ms: s.strongest,
    airtime_s: s.airtime,
    bounces: s.bounces,
    max_speed_ms: maxSpeed,
  };
}

// Landed: roll the dice BEFORE any god call, then ask. The silence delay
// runs from the landing moment; display fires only if this fall is still
// the current one and the phase is still landed.
function beginVerdict(s) {
  const dice = rollDice(mood, {
    bounces: s.bounces,
    airtime: s.airtime,
    strongest: s.strongest,
    impacts: s.impacts,
  });
  ui.god.shape = dice.shape;
  ui.god.disp = dice.disposition;
  ui.god.source = '-';
  const bundle = {
    intention: intentionForFall,
    mood,
    shape: dice.shape,
    disposition: dice.disposition,
    fall: factsSummary(s),
    session: sessionLog.slice(),
  };
  const token = verdictToken;
  const landedAt = performance.now();
  getVerdict(bundle).then((result) => {
    ui.god.source = result.source;
    sessionLog.push({
      intention: bundle.intention,
      facts_summary: bundle.fall,
      verdict: result.sentences.join(' '),
    });
    if (token !== verdictToken) return;
    if (fall.getState().phase !== 'landed') return;
    const wait = Math.max(0, dice.silenceMs - (performance.now() - landedAt));
    setTimeout(() => {
      if (token !== verdictToken) return;
      if (fall.getState().phase !== 'landed') return;
      showVerdict(ui, result.sentences);
    }, wait);
  });
}

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
    if (s.speed > maxSpeed) maxSpeed = s.speed;
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
    setSummitVisible(ui, true);
    // The verdict stands: the finished fall's intention and MOOD lock.
    setSummitEditable(ui, false);
    setVerdictVisible(ui, true);
    beginVerdict(s);
  }
  if (s.phase === 'idle' && prevPhase === 'falling') {
    // Visible end (escape or time limit): the body is parked at launch with
    // facts frozen. Park the avatar on it, restore the summit view, and
    // offer a fresh Jump. Never leave the player staring at fog. No verdict:
    // the gods only speak for landed falls.
    verdictToken += 1;
    syncAvatarToBody();
    placeBehindAvatar(camera, avatar);
    clearVerdict(ui, true);
    setVerdictVisible(ui, true);
    setSummitVisible(ui, true);
    setSummitEditable(ui, true);
    setButtonMode(ui, 'jump');
  }
  prevPhase = s.phase;

  renderer.render(scene, camera);
});
