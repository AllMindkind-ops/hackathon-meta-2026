// Sound-1: synthesized fall audio, no audio files. All sound is made live
// with the Web Audio API, driven by the physics engine's collide stream
// (the same events that feed the impact counters) and its contact state.
// Self-contained: app.js only dynamic-imports this module, subscribes the
// fall's onImpact stream, and calls update()/playLanding(). If Web Audio is
// unavailable, initSound() returns a silent no-op stub and the game plays
// exactly as before.
export const MASTER_GAIN = 0.5;
export const IMPACT_FLOOR_V = 1.5;
export const THUMP_MIN_GAP_MS = 150;
export const THUMP_TONE_START_HZ = 140;
export const THUMP_TONE_END_HZ = 45;
export const THUMP_DUR_MIN_S = 0.12;
export const THUMP_DUR_MAX_S = 0.25;
export const THUMP_FULL_V = 15;
export const THUMP_NOISE_LO_HZ = 300;
export const THUMP_NOISE_HI_HZ = 900;
export const LANDING_TONE_START_HZ = 100;
export const LANDING_TONE_END_HZ = 35;
export const LANDING_DUR_S = 0.4;
export const SCRAPE_BAND_HZ = 900;
export const SCRAPE_BAND_Q = 1.4;
export const SCRAPE_MIN_SPEED = 1.0;
export const SCRAPE_MAX_GAIN = 0.22;
export const SCRAPE_ATTACK_S = 0.03;
export const SCRAPE_RELEASE_S = 0.12;

function hasAudio() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.AudioContext || window.webkitAudioContext);
}

function stub() {
  return {
    unavailable: true,
    notifyImpact() {},
    update() {},
    playLanding() {},
    toggleMute() {},
    setMuted() {},
    isMuted: () => false,
    getThumpCount: () => 0,
    resetThumpCount() {},
  };
}

export function initSound() {
  if (!hasAudio() || typeof document === 'undefined') return stub();
  const AC = window.AudioContext || window.webkitAudioContext;

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let scrapeSrc = null;
  let scrapeFilter = null;
  let scrapeGain = null;
  let muted = false;
  let gapUntil = 0;
  let pendingStrongest = 0;
  let gapTimer = null;
  let thumpCount = 0;
  function buildGraph() {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    scrapeSrc = ctx.createBufferSource();
    scrapeSrc.buffer = noiseBuf;
    scrapeSrc.loop = true;
    scrapeFilter = ctx.createBiquadFilter();
    scrapeFilter.type = 'bandpass';
    scrapeFilter.frequency.value = SCRAPE_BAND_HZ;
    scrapeFilter.Q.value = SCRAPE_BAND_Q;
    scrapeGain = ctx.createGain();
    scrapeGain.gain.value = 0;
    scrapeSrc.connect(scrapeFilter);
    scrapeFilter.connect(scrapeGain);
    scrapeGain.connect(master);
    scrapeSrc.start();
  }

  // Gesture gate: the context is created on the first user gesture and
  // resumed on later ones if suspended. Nothing audible can exist before.
  function unlock() {
    if (!ctx) buildGraph();
    else if (ctx.state === 'suspended') ctx.resume();
  }

  function playThump(v, landing = false) {
    const t = ctx.currentTime;
    const k = Math.min(1, Math.max(0,
      (v - IMPACT_FLOOR_V) / (THUMP_FULL_V - IMPACT_FLOOR_V)));
    const dur = landing
      ? LANDING_DUR_S
      : THUMP_DUR_MIN_S + (THUMP_DUR_MAX_S - THUMP_DUR_MIN_S) * k;
    const peak = landing ? 1.0 : 0.12 + 0.88 * k;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(
      landing ? LANDING_TONE_START_HZ : THUMP_TONE_START_HZ, t);
    osc.frequency.exponentialRampToValueAtTime(
      landing ? LANDING_TONE_END_HZ : THUMP_TONE_END_HZ, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0011), t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(og);
    og.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = landing ? 500
      : THUMP_NOISE_LO_HZ + (THUMP_NOISE_HI_HZ - THUMP_NOISE_LO_HZ) * k;
    const ng = ctx.createGain();
    const ndur = Math.min(dur, landing ? 0.25 : 0.09);
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(Math.max(peak * 0.6, 0.0011), t + 0.005);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + ndur);
    src.connect(flt);
    flt.connect(ng);
    ng.connect(master);
    src.start(t);
    src.stop(t + ndur + 0.02);
  }

  // Discrete impacts (sound 1.2): physics notifies once per COUNTED hit
  // (the hits= increment). A spacing guard keeps thumps countable: at
  // least THUMP_MIN_GAP_MS between thump starts; a notification inside
  // the window only raises the remembered strongest, which plays alone
  // when the window opens. Landing bypasses this guard.
  function notifyImpact(v) {
    if (!ctx || muted || ctx.state !== 'running') return;
    if (v < IMPACT_FLOOR_V) return;
    const now = performance.now();
    if (now >= gapUntil) {
      gapUntil = now + THUMP_MIN_GAP_MS;
      pendingStrongest = 0;
      startThump(v);
    } else {
      if (v > pendingStrongest) pendingStrongest = v;
      if (gapTimer === null) {
        gapTimer = setTimeout(fireGap, gapUntil - now);
      }
    }
  }
  function fireGap() {
    gapTimer = null;
    const strongest = pendingStrongest;
    pendingStrongest = 0;
    if (strongest >= IMPACT_FLOOR_V && ctx && !muted && ctx.state === 'running') {
      gapUntil = performance.now() + THUMP_MIN_GAP_MS;
      startThump(strongest);
    }
  }
  function startThump(v, landing = false) {
    thumpCount += 1;
    playThump(v, landing);
  }

  // Continuous scrape. The target is zero by construction whenever the
  // body is airborne (!touching) or still, so air is silent; smoothing
  // via setTargetAtTime (attack ~30 ms, release ~120 ms) avoids clicks.
  function update(dt, contact) {
    if (!ctx || ctx.state !== 'running' || !scrapeGain) return;
    void dt;
    let target = 0;
    let rate = 0.7;
    if (!muted && contact && contact.touching
        && contact.slideSpeed > SCRAPE_MIN_SPEED) {
      target = Math.min(1, contact.slideSpeed / 12) * SCRAPE_MAX_GAIN;
      rate = 0.7 + Math.min(1, contact.slideSpeed / 15) * 0.6;
    }
    const now = ctx.currentTime;
    const tau = target > scrapeGain.gain.value
      ? SCRAPE_ATTACK_S : SCRAPE_RELEASE_S;
    scrapeGain.gain.setTargetAtTime(target, now, tau);
    scrapeSrc.playbackRate.setTargetAtTime(rate, now, 0.05);
  }

  // Final resting impact: one deeper, longer thump, bypassing the
  // throttle. Called from the existing falling -> landed transition.
  function playLanding() {
    if (!ctx || muted || ctx.state !== 'running') return;
    startThump(THUMP_FULL_V, true);
  }

  const muteBtn = document.getElementById('mute');
  function setMuted(m) {
    muted = m;
    if (master && ctx) {
      master.gain.setTargetAtTime(m ? 0 : MASTER_GAIN, ctx.currentTime, 0.02);
    }
    if (muteBtn) {
      muteBtn.setAttribute('aria-pressed', String(m));
      muteBtn.textContent = m ? '🔇' : '🔊';
    }
  }
  function toggleMute() {
    setMuted(!muted);
  }
  if (muteBtn) {
    muteBtn.hidden = false;
    muteBtn.addEventListener('click', () => {
      unlock();
      toggleMute();
    });
  }

  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', (e) => {
    unlock();
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'KeyM') toggleMute();
  });

  return {
    unavailable: false,
    notifyImpact,
    update,
    playLanding,
    toggleMute,
    setMuted,
    isMuted: () => muted,
    getThumpCount: () => thumpCount,
    resetThumpCount() {
      thumpCount = 0;
      gapUntil = 0;
      pendingStrongest = 0;
      if (gapTimer !== null) {
        clearTimeout(gapTimer);
        gapTimer = null;
      }
    },
  };
}
