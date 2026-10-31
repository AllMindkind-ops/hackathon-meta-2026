// Rising light for the verdict wait: a soft cone of twinkling pale-gold
// points climbing from the avatar's rest spot, slow and quiet. Attention,
// not weather: nothing falls, nothing is square, nothing maps to fetch
// state. Density grows only with wall-clock wait time (staggered births),
// so a short wait correctly shows few or none. One draw call, 36 points
// maximum, instant synchronous removal the moment the verdict is ready.
import * as THREE from 'three';

const MAX_POINTS = 36;
const TOP = 7; // cone height above the rest spot (m)
const BASE_R = 0.4; // cone radius at the base (m)
const TOP_R = 2.75; // cone radius at the top (m)
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

// Allowed cone radius at height y: apex at the avatar, widening upward.
function coneR(y) {
  return BASE_R + (TOP_R - BASE_R) * Math.min(1, Math.max(0, y / TOP));
}

// Soft sparkle sprite, generated once: warm radial core plus a faint
// four-point star cross, both fading to transparent at the tile edge.
let spriteTex = null;
function makeSprite() {
  if (spriteTex) return spriteTex;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');
  const core = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  core.addColorStop(0, 'rgba(255,252,244,1)');
  core.addColorStop(0.25, 'rgba(255,240,214,0.55)');
  core.addColorStop(0.6, 'rgba(255,230,190,0.16)');
  core.addColorStop(1, 'rgba(255,230,190,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, S, S);
  // Cross arms fade along their length so no hard ends survive.
  g.globalCompositeOperation = 'lighter';
  const arm = (x0, y0, x1, y1) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(255,246,224,0)');
    grad.addColorStop(0.5, 'rgba(255,246,224,0.4)');
    grad.addColorStop(1, 'rgba(255,246,224,0)');
    g.strokeStyle = grad;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };
  arm(S / 2, S * 0.16, S / 2, S * 0.84);
  arm(S * 0.16, S / 2, S * 0.84, S / 2);
  spriteTex = new THREE.CanvasTexture(cv);
  return spriteTex;
}

const VERT = `
attribute float aPhase;
attribute float aPeriod;
uniform float uTime;
uniform float uSize;
uniform float uScale;
varying float vTw;
void main() {
  float w = 6.2831853 * uTime / aPeriod + aPhase;
  float s = 0.5 + 0.5 * sin(w);
  vTw = 0.30 + 0.70 * s;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float breathe = 1.0 + 0.18 * sin(w + 1.3);
  gl_PointSize = uSize * breathe * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
varying float vTw;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  float a = tex.a * vTw * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * tex.rgb, a);
}
`;

let points = null;
let geo = null;
let mat = null;
let angle = null;
let frac = null;
let riseSpeed = null;
let spin = null;
let twPhase = null;
let twPeriod = null;
let birthAt = null;
let born = null;
let t0 = 0;

export function weatherActive() {
  return !!points;
}

export function beginWeather(scene, center) {
  endWeather();
  const pos = new Float32Array(MAX_POINTS * 3);
  const phaseArr = new Float32Array(MAX_POINTS);
  const periodArr = new Float32Array(MAX_POINTS);
  angle = new Float32Array(MAX_POINTS);
  frac = new Float32Array(MAX_POINTS);
  riseSpeed = new Float32Array(MAX_POINTS);
  spin = new Float32Array(MAX_POINTS);
  twPhase = new Float32Array(MAX_POINTS);
  twPeriod = new Float32Array(MAX_POINTS);
  birthAt = new Float32Array(MAX_POINTS);
  born = new Array(MAX_POINTS).fill(false);
  for (let i = 0; i < MAX_POINTS; i++) {
    angle[i] = hash01(i, 13) * Math.PI * 2;
    frac[i] = Math.sqrt(hash01(i, 5));
    riseSpeed[i] = 0.3 + 0.4 * hash01(i, 29);
    spin[i] = (hash01(i, 47) * 2 - 1) * 0.15;
    twPhase[i] = hash01(i, 71) * Math.PI * 2;
    twPeriod[i] = 0.8 + 0.8 * hash01(i, 83);
    birthAt[i] = hash01(i, 91) * BIRTH_SPAN;
    phaseArr[i] = twPhase[i];
    periodArr[i] = twPeriod[i];
    // Parked below ground until each point's birth.
    pos[i * 3] = 0;
    pos[i * 3 + 1] = -5;
    pos[i * 3 + 2] = 0;
  }
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phaseArr, 1));
  geo.setAttribute('aPeriod', new THREE.BufferAttribute(periodArr, 1));
  mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: makeSprite() },
      uColor: { value: new THREE.Color(0xffe9c4) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 0.3 },
      uScale: { value: 800 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
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
  // Mirror the renderer's pixel ratio cap so point size tracks the real
  // drawing buffer, matching THREE's own points attenuation formula.
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  mat.uniforms.uTime.value = age;
  mat.uniforms.uOpacity.value = Math.min(MAX_OPACITY, (age / FADE_IN) * MAX_OPACITY);
  mat.uniforms.uScale.value = (window.innerHeight * pr) * 0.5;
  const arr = geo.attributes.position.array;
  const step = Math.max(0, dt);
  for (let i = 0; i < MAX_POINTS; i++) {
    if (!born[i]) {
      if (age < birthAt[i]) continue;
      born[i] = true;
      arr[i * 3 + 1] = hash01(i, 61) * 1.5;
    }
    let y = arr[i * 3 + 1] + riseSpeed[i] * step;
    let a = angle[i] + spin[i] * step;
    if (y > TOP) {
      // Recycled to the base: golden-angle step keeps coverage even.
      y = 0;
      a += 2.39996;
    }
    angle[i] = a;
    const r = frac[i] * coneR(y);
    arr[i * 3] = r * Math.cos(a);
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = r * Math.sin(a);
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
  angle = frac = riseSpeed = spin = twPhase = twPeriod = birthAt = born = null;
}
