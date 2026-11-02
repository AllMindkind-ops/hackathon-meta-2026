// Round C — jump cutscene + dealt launch flavors. Pre-launch staging and
// presentation ONLY: physics is never touched here. The handoff calls the
// game's standard fall.launch() with the identical spawn state, and the
// release layer is created at handoff so its timing relative to the fall
// is exactly as it is today. Flavor animations are procedural, built from
// the avatar's existing pivots (neck, shoulderL/R, hipL/R); no new geometry.
import * as THREE from 'three';
import { poseStarfish } from './avatar.js';

// Beauty beat: same full length on every jump; sameness is the ritual.
export const BEAUTY_S = 2.0;
export const BEAUTY_REDUCED_S = 0.5;
// Staging per flavor beyond the beauty beat (the Send's run-up runs longer).
export const FLAVOR_S = { leap: 1.6, step: 1.8, trust: 1.6, send: 2.5 };
// Free-fall beat: camera held a touch high so the avatar drops away into a
// brief empty frame, then the Round A descent blend (already armed by
// snapChaseCamera at handoff) settles before the first impact.
export const FREEFALL_S = 0.9;
export const FREEFALL_LIFT_M = 1.2;
export const FREEFALL_AIM_M = 1.0;

// Flavor deal, MOOD-weighted. Weights are config; the deal reads MOOD only
// (mirror-coin style: Math.random, MOOD-independent beyond the weights).
export const FLAVOR_WEIGHTS = {
  'SOLEMN': { leap: 15, step: 50, trust: 30, send: 5 },
  'RITUAL': { leap: 30, step: 30, trust: 25, send: 15 },
  'FUCK YES': { leap: 40, step: 15, trust: 10, send: 35 },
};
export function dealFlavor(mood) {
  const w = FLAVOR_WEIGHTS[mood] || FLAVOR_WEIGHTS['RITUAL'];
  const total = w.leap + w.step + w.trust + w.send;
  let r = Math.random() * total;
  if ((r -= w.leap) < 0) return 'leap';
  if ((r -= w.step) < 0) return 'step';
  if ((r -= w.trust) < 0) return 'trust';
  return 'send';
}

const _erV = new THREE.Vector3();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _l = new THREE.Vector3();

function ss(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function createCutscene() {
  const cs = {
    active: false,
    flavor: 'leap',
    t: 0,
    reduced: false,
    avatar: null,
    camera: null,
    launchPos: null,
    er: null,
    stage: new THREE.Vector3(),
    yaw: 0,
    rest: null,
  };

  function pivots() {
    return cs.avatar.userData.pivots;
  }

  function captureRest() {
    const P = pivots();
    cs.rest = {};
    for (const k of ['neck', 'shoulderL', 'shoulderR', 'hipL', 'hipR']) {
      cs.rest[k] = P[k].rotation.clone();
    }
  }

  function limb(joint, key, x, y, z) {
    const r = cs.rest[key];
    joint.rotation.set(r.x + x, r.y + y, r.z + z);
  }

  // Over-the-shoulder: back of the avatar, the drop and the sky beyond.
  // One rig for the whole cutscene; the flavor plays inside it.
  function frameOTS(push) {
    const dist = 3.4 - 0.5 * push;
    const sway = Math.sin(cs.t * 0.6) * 0.15;
    _s.copy(cs.stage).addScaledVector(cs.er, -dist);
    _s.y += 2.4;
    _s.x += -cs.er.z * sway;
    _s.z += cs.er.x * sway;
    cs.camera.position.copy(_s);
    _l.copy(cs.stage).addScaledVector(cs.er, 7);
    _l.y -= 2.0;
    cs.camera.lookAt(_l);
  }

  function root(fwd, up, yawAdd, pitch) {
    cs.avatar.position.copy(cs.stage).addScaledVector(cs.er, fwd);
    cs.avatar.position.y += up;
    _e.set(pitch, cs.yaw + yawAdd, 0, 'YXZ');
    cs.avatar.quaternion.setFromEuler(_e);
  }

  cs.start = function (opts) {
    cs.avatar = opts.avatar;
    cs.camera = opts.camera;
    cs.launchPos = opts.launchPos;
    cs.er = _erV.set(opts.er.x, 0, opts.er.z);
    cs.flavor = opts.flavor;
    cs.reduced = !!opts.reduced;
    cs.t = 0;
    cs.active = true;
    // Stage at the existing launch point: feet under the body-spawn centre.
    cs.stage.set(opts.launchPos.x, opts.launchPos.y - 0.65, opts.launchPos.z);
    cs.yaw = Math.atan2(opts.er.x, opts.er.z);
    cs.avatar.rotation.order = 'YXZ';
    captureRest();
    root(0, 0, 0, 0);
    frameOTS(0);
  };

  cs._pose = { root, limb };
  cs.cancel = function () {
    cs.active = false;
  };

  cs.duration = function () {
    const beauty = cs.reduced ? BEAUTY_REDUCED_S : BEAUTY_S;
    if (cs.reduced) return beauty;
    return beauty + (FLAVOR_S[cs.flavor] || 1.6);
  };

  cs.update = function (dt) {
    if (!cs.active) return null;
    cs.t += Math.min(Math.max(dt, 0), 0.05);
    const beauty = cs.reduced ? BEAUTY_REDUCED_S : BEAUTY_S;
    const P = pivots();
    if (cs.t < beauty) {
      // Beauty beat: held OTS framing, near-still avatar, slow push-in.
      root(0, Math.sin(cs.t * 1.2) * 0.02, 0, 0.02);
      limb(P.shoulderL, 'shoulderL', 0, 0, 0);
      limb(P.shoulderR, 'shoulderR', 0, 0, 0);
      limb(P.hipL, 'hipL', 0, 0, 0);
      limb(P.hipR, 'hipR', 0, 0, 0);
      limb(P.neck, 'neck', 0.05, 0, 0);
      frameOTS(cs.t / cs.duration());
      return null;
    }
    if (cs.reduced) {
      cs.active = false;
      return 'handoff';
    }
    const ft = cs.t - beauty;
    const dur = FLAVOR_S[cs.flavor] || 1.6;
    playFlavor(cs._pose, cs.avatar, cs.flavor, ft, dur);
    frameOTS(cs.t / cs.duration());
    if (ft >= dur) {
      cs.active = false;
      return 'handoff';
    }
    return null;
  };

  return cs;
}

function playFlavor(pose, avatar, flavor, ft, dur) {
  if (flavor === 'send') sendFlavor(pose, avatar, ft, dur);
  else if (flavor === 'step') stepFlavor(pose, avatar, ft, dur);
  else if (flavor === 'trust') trustFlavor(pose, avatar, ft, dur);
  else leapFlavor(pose, avatar, ft, dur);
}

function limbs(pose, avatar) {
  return avatar.userData.pivots;
}

// LEAP: crouch, spring off the edge, hang.
function leapFlavor(pose, avatar, ft) {
  const P = limbs(pose, avatar);
  const crouch = ss(0, 0.5, ft);
  const spring = ss(0.5, 0.9, ft);
  const u = ss(0.5, 1.3, ft);
  const y = -0.32 * crouch * (1 - spring) + 1.1 * 4 * u * (1 - u);
  const fwd = 2.0 * u;
  pose.root(fwd, y, 0, 0.25 * crouch * (1 - spring) - 0.15 * spring);
  pose.limb(P.shoulderL, 'shoulderL', 0.7 * crouch * (1 - spring) - 2.2 * spring, 0, -0.2 * spring);
  pose.limb(P.shoulderR, 'shoulderR', 0.7 * crouch * (1 - spring) - 2.2 * spring, 0, 0.2 * spring);
  pose.limb(P.hipL, 'hipL', 0.4 * crouch * (1 - spring) + 0.6 * spring, 0, 0);
  pose.limb(P.hipR, 'hipR', 0.4 * crouch * (1 - spring) + 0.6 * spring, 0, 0);
  pose.limb(P.neck, 'neck', 0.3 * crouch * (1 - spring) - 0.2 * spring, 0, 0);
}

// STEP-OFF: two calm steps forward off the edge, deadpan.
function stepFlavor(pose, avatar, ft) {
  const P = limbs(pose, avatar);
  const fwd = 0.8 * (ss(0.1, 0.7, ft) + ss(0.7, 1.3, ft));
  const swing = Math.sin(ft * 5.2);
  const bob = 0.05 * Math.abs(Math.cos(ft * 5.2)) * ss(0.1, 1.3, ft);
  pose.root(fwd, bob, 0, 0.08);
  pose.limb(P.shoulderL, 'shoulderL', 0.3 * swing, 0, 0);
  pose.limb(P.shoulderR, 'shoulderR', -0.3 * swing, 0, 0);
  pose.limb(P.hipL, 'hipL', -0.45 * swing, 0, 0);
  pose.limb(P.hipR, 'hipR', 0.45 * swing, 0, 0);
  pose.limb(P.neck, 'neck', 0.05, 0, 0);
}

// TRUST FALL: turn to face the summit, fall backwards.
function trustFlavor(pose, avatar, ft) {
  const P = limbs(pose, avatar);
  const turn = ss(0, 0.6, ft);
  const fall = ss(0.6, 1.5, ft);
  pose.root(0.3 * fall, -0.75 * fall, Math.PI * turn, -1.15 * fall);
  pose.limb(P.shoulderL, 'shoulderL', 0, 0, 0.4 * turn);
  pose.limb(P.shoulderR, 'shoulderR', 0, 0, -0.4 * turn);
  pose.limb(P.hipL, 'hipL', 0.2 * fall, 0, 0);
  pose.limb(P.hipR, 'hipR', 0.2 * fall, 0, 0);
  pose.limb(P.neck, 'neck', -0.3 * fall, 0, 0);
}

// THE SEND: back up, RUN at the edge, deepest crouch, maximum leap with
// the head thrown back, starfish from the leap until handoff (the flag
// carries it from handoff to the first impact).
function sendFlavor(pose, avatar, ft) {
  const P = limbs(pose, avatar);
  if (ft < 0.7) {
    // Back up 2-3 steps.
    const a = ss(0, 0.7, ft);
    const w = Math.PI * 2 * 2.2 * ft;
    pose.root(-2.2 * a, -0.2 * a + 0.03 * Math.abs(Math.sin(w)), 0, 0.1);
    pose.limb(P.shoulderL, 'shoulderL', 0.4 * Math.sin(w), 0, 0);
    pose.limb(P.shoulderR, 'shoulderR', 0.4 * Math.sin(w + Math.PI), 0, 0);
    pose.limb(P.hipL, 'hipL', -0.3 * Math.sin(w), 0, 0);
    pose.limb(P.hipR, 'hipR', -0.3 * Math.sin(w + Math.PI), 0, 0);
    pose.limb(P.neck, 'neck', 0.1, 0, 0);
    return;
  }
  if (ft < 1.4) {
    // Run at the edge: longer runway, faster run, windmilling arms.
    const b = ss(0.7, 1.4, ft);
    const w = Math.PI * 2 * 3.2 * ft;
    pose.root(-2.2 + 3.7 * b, -0.2 + 0.04 * Math.abs(Math.sin(w)), 0, 0.35);
    pose.limb(P.shoulderL, 'shoulderL', 0.9 * Math.sin(w), 0, -0.2);
    pose.limb(P.shoulderR, 'shoulderR', 0.9 * Math.sin(w + Math.PI), 0, 0.2);
    pose.limb(P.hipL, 'hipL', -0.7 * Math.sin(w), 0, 0);
    pose.limb(P.hipR, 'hipR', -0.7 * Math.sin(w + Math.PI), 0, 0);
    pose.limb(P.neck, 'neck', 0.15, 0, 0);
    return;
  }
  if (ft < 1.6) {
    // Deepest crouch.
    const c = ss(1.4, 1.6, ft);
    pose.root(1.5, -0.2 - 0.25 * c, 0, 0.35 - 0.2 * c);
    pose.limb(P.shoulderL, 'shoulderL', 0.9 - 0.4 * c, 0, -0.2);
    pose.limb(P.shoulderR, 'shoulderR', 0.9 - 0.4 * c, 0, 0.2);
    pose.limb(P.hipL, 'hipL', 0.5, 0, 0);
    pose.limb(P.hipR, 'hipR', 0.5, 0, 0);
    pose.limb(P.neck, 'neck', 0.3, 0, 0);
    return;
  }
  // Maximum leap: head thrown BACK and held, starfish spread.
  const u = Math.min(1, Math.max(0, (ft - 1.6) / 0.9));
  pose.root(1.5 + 2.5 * u, -0.45 + 0.45 * u + 1.5 * 4 * u * (1 - u), 0, 0.15 - 0.35 * u);
  poseStarfish(avatar, ft);
  pose.limb(P.neck, 'neck', -0.6, 0, 0);
}

// Free-fall beat: hold the frame a touch high with the aim riding above
// the avatar so she drops away into a brief empty frame, then get out of
// the way — the armed Round A blend owns the ride from here and settles
// before the first impact. Pure overlay: no camera state is touched.
export function updateFreefallCamera(camera, avatar, t) {
  const k = Math.min(1, Math.max(0, 1 - t / FREEFALL_S));
  if (k <= 0) return;
  camera.position.y += FREEFALL_LIFT_M * k;
  _l.set(avatar.position.x, avatar.position.y + 0.65 + FREEFALL_AIM_M * k, avatar.position.z);
  camera.lookAt(_l);
}
