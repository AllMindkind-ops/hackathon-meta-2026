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
const kick = { x: 0, y: 0, r: 0 };

export function releaseActive() {
  return !!layer;
}

export function beginRelease(text) {
  endRelease();
  const seed = (seq += 1);
  const host = document.createElement('div');
  host.id = 'release';
  host.setAttribute('aria-hidden', 'true');
  const inner = document.createElement('div');
  inner.className = 'rkick';
  host.appendChild(inner);
  const n = text.length;
  letters = [];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'rletter';
    s.textContent = text[i] === ' ' ? ' ' : text[i];
    letters.push({
      el: s,
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
  for (const L of letters) {
    if (L.done) continue;
    if (L.t0 < 0) {
      if (factor < L.threshold) continue;
      L.t0 = now;
    }
    const q = Math.min(1, (now - L.t0) / L.dur);
    const e = q * q * (3 - 2 * q);
    L.el.style.transform =
      `translate(${(L.drift * e).toFixed(1)}px, ${(-L.rise * e).toFixed(1)}px)` +
      ` rotate(${(L.rot * e).toFixed(1)}deg)`;
    L.el.style.opacity = String(1 - e);
    if (q >= 1) {
      L.done = true;
      L.el.style.visibility = 'hidden';
    }
  }
}

export function endRelease() {
  if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
  layer = null;
  kicker = null;
  letters = [];
  kick.x = kick.y = kick.r = 0;
}
