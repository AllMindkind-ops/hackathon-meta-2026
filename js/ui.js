import * as THREE from 'three';

// Fall-loop UI: one big button plus a small phase/facts readout for testing.
// Gods' pass adds the summit panel (intention + MOOD, idle only) and the
// verdict panel (gods' words + the button, landed). Touch-friendly.
// No god text beyond the verdict, no What's next, no sounds.

const _bp = new THREE.Vector3();

export function getUI() {
  const ui = {
    button: document.getElementById('jump'),
    facts: document.getElementById('facts'),
    summit: document.getElementById('summit'),
    intention: document.getElementById('intention'),
    moodBox: document.getElementById('mood'),
    verdict: document.getElementById('verdict'),
    godtext: document.getElementById('godtext'),
    // Gods' readout state: mood persists across falls; shape/disp/source
    // hold the last landed fall's dealt dice and verdict source.
    god: { mood: 'RITUAL', shape: '-', disp: '-', source: '-' },
  };
  ui.moodButtons = ui.moodBox
    ? Array.from(ui.moodBox.querySelectorAll('button[data-mood]'))
    : [];
  return ui;
}

// Button modes: 'jump' (idle) -> big Jump button; 'falling' (mid-fall, all
// input ignored) -> disabled "Falling..."; 'top' (landed) -> "Back to top".
export function setButtonMode(ui, mode) {
  if (mode === 'falling') {
    ui.button.textContent = 'Falling...';
    ui.button.disabled = true;
  } else if (mode === 'top') {
    ui.button.textContent = 'Back to top';
    ui.button.disabled = false;
  } else {
    ui.button.textContent = 'Jump';
    ui.button.disabled = false;
  }
}

// Summit panel (intention + MOOD): visible between falls, never mid-fall.
export function setSummitVisible(ui, show) {
  if (ui.summit) ui.summit.hidden = !show;
}

// Highlight the active MOOD stop.
export function setMoodUI(ui, mood) {
  ui.god.mood = mood;
  for (const b of ui.moodButtons) {
    const on = b.dataset.mood === mood;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-pressed', 'true');
    else b.removeAttribute('aria-pressed');
  }
}

// Verdict panel visibility. The panel carries the verdict and the button.
export function setVerdictVisible(ui, show) {
  if (ui.verdict) ui.verdict.hidden = !show;
}

// Verdict display: sentences fade in in order (CSS .gline transition,
// staggered here). Called after the rolled silence delay.
export function showVerdict(ui, sentences) {
  clearVerdict(ui, true);
  sentences.forEach((text, i) => {
    const line = document.createElement('div');
    line.className = 'gline';
    line.textContent = text;
    ui.godtext.appendChild(line);
    setTimeout(() => line.classList.add('on'), 120 + i * 450);
  });
}

export function clearVerdict(ui, keepOpen) {
  if (ui.godtext) ui.godtext.textContent = '';
  if (!keepOpen) setVerdictVisible(ui, false);
}

// Readout: phase, fall clock, impact count, strongest impact, airtime, body
// cylindrical position (r, y), current speed, worst per-box clearance and
// which box, camera-to-body distance, visible-end resets, how the fall
// ended, camera position, and the gods' state (mood / dealt shape and
// disposition / verdict source).
export function setFacts(ui, s, camera) {
  let cam = '';
  let dist = '';
  if (camera) {
    _bp.set(s.pos.x, s.pos.y + 0.3, s.pos.z);
    dist = `  dist=${camera.position.distanceTo(_bp).toFixed(1)}`;
    cam = `  cam=${camera.position.x.toFixed(1)},${camera.position.y.toFixed(1)},${camera.position.z.toFixed(1)}`;
  }
  const g = s.gapWorst;
  const gap = `  gap=${g < 0 ? '' : '+'}${Math.abs(g) >= 100 ? g.toFixed(0) : g.toFixed(2)}/${s.gapBox}`;
  const god = `  mood=${ui.god.mood} shape=${ui.god.shape} disp=${ui.god.disp} god=${ui.god.source}`;
  ui.facts.textContent =
    `PHASE ${s.phase.toUpperCase()}  t=${s.time.toFixed(1)}s` +
    `  hits=${s.impacts}  max=${s.strongest.toFixed(1)}m/s  air=${s.airtime.toFixed(1)}s` +
    `  bn=${s.bounces}` +
    `  r=${s.r.toFixed(1)} y=${s.pos.y.toFixed(1)} v=${s.speed.toFixed(1)}` +
    gap + dist +
    `  resets=${s.resets} end=${s.endReason}${cam}${god}`;
}
