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

export function setFacts(ui, s) {
  ui.facts.textContent =
    `PHASE ${s.phase.toUpperCase()}  t=${s.time.toFixed(1)}s` +
    `  hits=${s.impacts}  max=${s.strongest.toFixed(1)}m/s  air=${s.airtime.toFixed(1)}s`;
}
