// Intention release: the typed words travel down with the player, fray in
// the wind, jostle on impacts, and shed upward letter by letter until they
// are gone about halfway down. Presentation only: the gods' copy of the
// intention (bundle.intention) is untouched, and the words are released,
// never destroyed or trivialized -- they rise away, out of frame.
// Wordless falls never create a layer. Transforms and opacity only.

// The descent fraction driving the factor is normalized in physics
// (getState().descent, against launch height and the landing surface).

// Release factor: 0 at launch, 1 at 55% of the descent. Every landed fall
// must cross 55% (the capture zone sits at the bottom of the column), so
// completion never depends on collision count. Bounces are accents only.
const COMPLETE_AT = 0.55;
// Letter size: the single tuning knob for release readability (~2x the old
// 15 px summit-panel size so the words read at a glance on a phone). Applied
// to the layer below; styles.css carries the same value as fallback.
export const RELEASE_LETTER_PX = 30;
export function releaseFactor(descentMax) {
  return Math.min(1, Math.max(0, descentMax) / COMPLETE_AT);
}

// Per-letter shed thresholds scatter across this factor band.
const SHED_START = 0.08;
const SHED_END = 0.52;

export function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Deterministic index hash: thresholds are scattered but stable per fall
// (seeded by a per-release counter), so letters never reshuffle mid-fall.
function hash01(i, seed) {
  let h = (Math.imul(i + 1, 2654435761) ^ Math.imul(seed + 1, 40503)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

let seq = 0;
let layer = null;   // outer #release: centering + fray (blur/fade/spacing)
let kicker = null;  // inner .rkick: impact offset/rotation
let letters = [];
let sparkBox = null; // absolute-positioned spark layer inside the host
let live = [];       // active sparks: { el, x0, y0, vx, vy, t0, dur }
const kick = { x: 0, y: 0, r: 0 };

export function releaseActive() {
  return !!layer;
}

export function beginRelease(text) {
  endRelease();
  const seed = (seq += 1);
  const host = document.createElement('div');
  host.style.fontSize = RELEASE_LETTER_PX + 'px';
  host.id = 'release';
  host.setAttribute('aria-hidden', 'true');
  const inner = document.createElement('div');
  inner.className = 'rkick';
  host.appendChild(inner);
  sparkBox = document.createElement('div');
  sparkBox.className = 'rsparks';
  host.appendChild(sparkBox);
  live = [];
  const n = text.length;
  letters = [];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'rletter';
    s.textContent = text[i] === ' ' ? ' ' : text[i];
    letters.push({
      el: s,
      i,
      // Pre-scattered spark casts: 3 trail wisps shed at rise start, 5 burst
      // sparks on burnout. Velocities in host px, durations in ms.
      trail: [0, 1, 2].map((k) => ({
        vx: (hash01(i * 5 + k, seed + 31) * 2 - 1) * 14,
        vy: -10 - 24 * hash01(i * 5 + k, seed + 37),
        dur: 500 + 400 * hash01(i * 5 + k, seed + 41),
      })),
      burst: [0, 1, 2, 3, 4].map((k) => {
        const a = hash01(i * 7 + k, seed + 53) * Math.PI * 2;
        const sp = 20 + 35 * hash01(i * 7 + k, seed + 59);
        return {
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 18,
          dur: 350 + 300 * hash01(i * 7 + k, seed + 61),
        };
      }),
      threshold: SHED_START + (SHED_END - SHED_START) * hash01(i, seed),
      dur: 1200 + 800 * hash01(i + n + 7, seed),
      rise: 40 + 80 * hash01(i * 3 + 1, seed + 11),
      drift: (hash01(i * 7 + 3, seed + 101) * 2 - 1) * 30,
      rot: (hash01(i * 13 + 5, seed + 1009) * 2 - 1) * 25,
      t0: -1,
      done: false,
    });
    inner.appendChild(s);
  }
  document.body.appendChild(host);
  layer = host;
  kicker = inner;
  kick.x = kick.y = kick.r = 0;
}

// Impact kick on the letter container, scaled by impact strength, decaying
// back toward rest. The words ride the fall like something attached.
export function kickRelease(strength, hitId) {
  if (!layer) return;
  const k = Math.min(1, Math.max(0, strength / 20));
  const dir = hash01(hitId, 77) * 2 - 1;
  kick.x += dir * k * 14;
  kick.y += (hash01(hitId, 913) * 2 - 1) * k * 10;
  kick.r += dir * k * 3;
}

// Ember sparks: tiny gold dots living in the host's own pixel space. The host
// is fixed-positioned, so absolute children track the letters exactly; each
// letter's start centre is captured once, at its own shed moment.
function letterCX(L) {
  const r = L.el.getBoundingClientRect();
  const h = layer.getBoundingClientRect();
  return r.left + r.width / 2 - h.left;
}
function letterCY(L) {
  const r = L.el.getBoundingClientRect();
  const h = layer.getBoundingClientRect();
  return r.top + r.height / 2 - h.top;
}
function spawnSpark(x0, y0, vx, vy, now, dur) {
  if (!sparkBox) return;
  const el = document.createElement('span');
  el.className = 'spark';
  sparkBox.appendChild(el);
  live.push({ el, x0, y0, vx, vy, t0: now, dur });
}
export function updateRelease(factor, dt, now) {
  if (!layer) return;
  const d = Math.exp(-3 * Math.max(0, dt));
  kick.x *= d;
  kick.y *= d;
  kick.r *= d;
  kicker.style.transform =
    `translate(${kick.x.toFixed(2)}px, ${kick.y.toFixed(2)}px)` +
    ` rotate(${kick.r.toFixed(2)}deg)`;
  // Fray: wind-worn before it sheds. Blur caps near 2px, slight fade,
  // letter-spacing widens on the one overlay container.
  layer.style.filter = factor > 0.001 ? `blur(${(factor * 2).toFixed(2)}px)` : '';
  layer.style.opacity = String(1 - 0.25 * factor);
  layer.style.letterSpacing = `${(factor * 0.35).toFixed(3)}em`;
  for (let si = live.length - 1; si >= 0; si--) {
    const sp = live[si];
    const sq = (now - sp.t0) / sp.dur;
    if (sq >= 1) {
      sp.el.remove();
      live.splice(si, 1);
      continue;
    }
    const se = sq * sq * (3 - 2 * sq);
    sp.el.style.transform =
      `translate(${(sp.x0 + sp.vx * se).toFixed(1)}px, ${(sp.y0 + sp.vy * se - 24 * se * se).toFixed(1)}px)`;
    sp.el.style.opacity = String(1 - sq);
  }
  for (const L of letters) {
    if (L.done) continue;
    if (L.t0 < 0) {
      if (factor < L.threshold) continue;
      L.t0 = now;
      // Shed moment: capture the centre and lay the trail wisps. The letter
      // keeps rising past them, which reads as a trail.
      L.x0 = letterCX(L);
      L.y0 = letterCY(L);
      for (const t of L.trail) spawnSpark(L.x0, L.y0, t.vx, t.vy, now, t.dur);
    }
    const q = Math.min(1, (now - L.t0) / L.dur);
    const e = q * q * (3 - 2 * q);
    L.el.style.transform =
      `translate(${(L.drift * e).toFixed(1)}px, ${(-L.rise * e).toFixed(1)}px)` +
      ` rotate(${(L.rot * e).toFixed(1)}deg)`;
    // Ember-gold flash for the first breath of the shed, then back to stone.
    L.el.style.color = q < 0.3 ? '#ffc45e' : '';
    L.el.style.opacity = String(1 - e);
    if (q >= 1) {
      L.done = true;
      // Burnout: the letter ends as sparks from its final risen spot,
      // not a plain fade.
      for (const b of L.burst) spawnSpark(L.x0 + L.drift, L.y0 - L.rise, b.vx, b.vy, now, b.dur);
      L.el.style.visibility = 'hidden';
    }
  }
}

export function endRelease() {
  if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
  layer = null;
  kicker = null;
  sparkBox = null;
  live = [];
  letters = [];
  kick.x = kick.y = kick.r = 0;
}
