// Settling star-dust for the verdict wait: small pale-gold points of light
// drifting slowly downward through the air around the landed avatar.
// Weather, not UI: no text, no symbols, no progress mapping of any kind --
// density grows only with wall-clock time (staggered births), never from
// fetch state, so a short wait correctly shows few or none. A few dozen
// points maximum, one draw call, transforms only. Instant removal the
// moment the verdict is ready: never overlapping the panel text.
import * as THREE from 'three';

const MAX_POINTS = 36;
const SPREAD_R = 6; // cylinder radius around the landing spot (m)
const TOP = 7; // volume height above the ground (m)
const MAX_OPACITY = 0.55; // faint: attended, not busy
const FADE_IN = 2.5; // global opacity ramp (s)
const BIRTH_SPAN = 6; // per-point appearance stagger (s)

// Deterministic scatter: the field is stable, never reshuffled.
function hash01(i, salt) {
  let h = (Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

let points = null;
let geo = null;
let mat = null;
let baseX = null;
let baseZ = null;
let fallSpeed = null;
let phase = null;
let birthAt = null;
let born = null;
let t0 = 0;

export function weatherActive() {
  return !!points;
}

export function beginWeather(scene, center) {
  endWeather();
  const pos = new Float32Array(MAX_POINTS * 3);
  baseX = new Float32Array(MAX_POINTS);
  baseZ = new Float32Array(MAX_POINTS);
  fallSpeed = new Float32Array(MAX_POINTS);
  phase = new Float32Array(MAX_POINTS);
  birthAt = new Float32Array(MAX_POINTS);
  born = new Array(MAX_POINTS).fill(false);
  for (let i = 0; i < MAX_POINTS; i++) {
    // Uniform disc scatter, parked below ground until each point's birth.
    const r = SPREAD_R * Math.sqrt(hash01(i, 5));
    const a = hash01(i, 13) * Math.PI * 2;
    baseX[i] = r * Math.cos(a);
    baseZ[i] = r * Math.sin(a);
    pos[i * 3] = baseX[i];
    pos[i * 3 + 1] = -5;
    pos[i * 3 + 2] = baseZ[i];
    fallSpeed[i] = 0.25 + 0.35 * hash01(i, 29);
    phase[i] = hash01(i, 47) * Math.PI * 2;
    birthAt[i] = hash01(i, 91) * BIRTH_SPAN;
  }
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  mat = new THREE.PointsMaterial({
    color: 0xffe9c4,
    size: 0.32,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  points = new THREE.Points(geo, mat);
  points.position.copy(center);
  points.frustumCulled = false;
  scene.add(points);
  t0 = performance.now();
}

export function updateWeather(dt) {
  if (!points) return;
  const age = (performance.now() - t0) / 1000;
  mat.opacity = Math.min(MAX_OPACITY, (age / FADE_IN) * MAX_OPACITY);
  const arr = geo.attributes.position.array;
  const step = Math.max(0, dt);
  for (let i = 0; i < MAX_POINTS; i++) {
    if (!born[i]) {
      if (age < birthAt[i]) continue;
      born[i] = true;
      arr[i * 3 + 1] = hash01(i, 61) * TOP;
    }
    let y = arr[i * 3 + 1] - fallSpeed[i] * step;
    if (y < 0) y += TOP;
    arr[i * 3] = baseX[i] + 0.6 * Math.sin(age * 0.4 + phase[i]);
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = baseZ[i] + 0.6 * Math.cos(age * 0.33 + phase[i]);
  }
  geo.attributes.position.needsUpdate = true;
}

export function endWeather() {
  if (!points) return;
  if (points.parent) points.parent.remove(points);
  points = null;
  if (geo) geo.dispose();
  geo = null;
  if (mat) mat.dispose();
  mat = null;
  baseX = baseZ = fallSpeed = phase = birthAt = born = null;
}
