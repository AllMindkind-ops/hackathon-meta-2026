// Fall-loop UI, pass 1: one big button plus a small phase/facts readout
// for testing. Touch-friendly. No intention field, no MOOD control, no god
// text, no What's next, no sounds.

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
// cylindrical position (r, y), current speed, visible-end resets, how the
// fall ended, per-collider spawn clearance proof, and camera position.
export function setFacts(ui, s, camera) {
  const cam = camera
    ? `  cam=${camera.position.x.toFixed(1)},${camera.position.y.toFixed(1)},${camera.position.z.toFixed(1)}`
    : '';
  const g = s.gaps;
  const f1 = (v) => (v < 0 ? '' : '+') + (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
  ui.facts.textContent =
    `PHASE ${s.phase.toUpperCase()}  t=${s.time.toFixed(1)}s` +
    `  hits=${s.impacts}  max=${s.strongest.toFixed(1)}m/s  air=${s.airtime.toFixed(1)}s` +
    `  r=${s.r.toFixed(1)} y=${s.pos.y.toFixed(1)} v=${s.speed.toFixed(1)}` +
    `  gaps=M${f1(g.SLOPE)}/F${f1(g.FOOT)}/L${f1(g.LAND)}/A${f1(g['GUIDE-A'])}/B${f1(g['GUIDE-B'])}` +
    `  resets=${s.resets} end=${s.endReason}${cam}`;
}
