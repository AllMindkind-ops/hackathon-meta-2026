import * as THREE from 'three';

// Fall-loop UI, pass 1: one big button plus a small phase/facts readout
// for testing. Touch-friendly. No intention field, no MOOD control, no god
// text, no What's next, no sounds.

const _bp = new THREE.Vector3();

export function getUI() {
  return {
    button: document.getElementById('jump'),
    facts: document.getElementById('facts'),
  };
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

// Readout: phase, fall clock, impact count, strongest impact, airtime, body
// cylindrical position (r, y), current speed, worst per-box clearance and
// which box, camera-to-body distance, visible-end resets, how the fall
// ended, and camera position.
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
  ui.facts.textContent =
    `PHASE ${s.phase.toUpperCase()}  t=${s.time.toFixed(1)}s` +
    `  hits=${s.impacts}  max=${s.strongest.toFixed(1)}m/s  air=${s.airtime.toFixed(1)}s` +
    `  bn=${s.bounces}` +
    `  r=${s.r.toFixed(1)} y=${s.pos.y.toFixed(1)} v=${s.speed.toFixed(1)}` +
    gap + dist +
    `  resets=${s.resets} end=${s.endReason}${cam}`;
}
