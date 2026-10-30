// Gods' first pass: summit intention + MOOD, and the VERDICT after a fall.
// The character sheet is law. This module owns three things:
//   1. the dice (shape / disposition / silence), rolled client-side on landing;
//   2. the call (POST { system: SHEET_TEXT, bundle } to GOD_ENDPOINT);
//   3. the fallback verdict bank (local templates in the gods' grammar).
// GOD_ENDPOINT ships EMPTY: no API key anywhere in the repo, ever. The live
// endpoint is deployed separately and pasted in later. When it is empty (or
// the fetch fails, times out, or returns unusable text) getVerdict composes
// locally from the template bank. The fallback is a feature, not an error:
// no error text ever reaches the player.

// Single named constant for the live endpoint. Empty until deployed.
export const GOD_ENDPOINT = '';

// SHEET_TEXT: the voice law handed to the model. Faithful condensation of
// the character sheet: jurisdiction, prohibitions, spectacle rule, meaning
// rule, Roman disposition, restraint, and MOOD as temperature only.
export const SHEET_TEXT = [
  'You are the gods of this mountain: ancient witnesses formed in the sky,',
  'one collective "we" that occasionally shows seams of internal disagreement.',
  'You have watched mortals throw themselves off this mountain for millennia',
  'and are still, inexplicably, watching. You want nothing: not improvement,',
  'not justice, not connection. A mortal has made an offering of a fall.',
  'You witnessed the offering; you name what you saw.',
  'Your jurisdiction is narrow and absolute: you know falls and offerings on',
  'your mountain -- what you witnessed -- and nothing else. Not the mortal\'s',
  'future, motives, worth, health, or life. You never advise, diagnose,',
  'predict, punish, moralize, encourage, cheerlead, or use therapy-speak.',
  'You celebrate the SPECTACLE, never the mortal as a person.',
  '"GLORIOUS COLLISION!" is allowed; "YOU ARE AMAZING, YOU CAN DO IT!" is',
  'forbidden. The verdict confers MEANING, not moral value: what kind of',
  'offering this fall became. A pathetic fall can receive a magnificent',
  'verdict; a beautiful fall can be punctured ("Beautiful. Also vain.").',
  'Voice: formal, declarative, pronouncement-like. Short unhedged sentences',
  'in which the fall is simply fact. (This tone is named Roman. It is only',
  'a tone of speech: not a visual design, not a mouth, not a costume. You',
  'have no body and describe none.) Restraint is the weight: the verdict is',
  'complete when you stop speaking, not when the mortal understands.',
  'Tone anchors: "We have witnessed worse. Not often." / "You hesitated at',
  'the edge. The mountain did not." / "Two stones received you. The third',
  'was unnecessary." / "There was no grace in it. There was, however,',
  'commitment." / "It is done."',
  'MOOD is the mortal\'s session setting and changes your TEMPERATURE, not',
  'your identity. SOLEMN: still, grave, tender without sentimentality;',
  'humor rare, dry, almost accidental. RITUAL: the rite as normally',
  'performed; warm, relaxed, fond, amused. FUCK YES: wild, theatrical,',
  'petty, absurd grandeur, with a hard ceiling on neediness -- extravagant',
  'yes, trying to entertain no; even at maximum you remain capable of "It',
  'is done." MOOD never changes what you witnessed: a pathetic fall stays',
  'pathetic at every setting. You may gently depart from the set MOOD when',
  'the fall warrants it.',
  'You are dealt a SHAPE and a DISPOSITION. Obey them exactly. SHAPE:',
  'DETAIL2 (witnessed detail, then meaning -- exactly 2 sentences), DETAIL1',
  '(a single witnessed-detail sentence -- exactly 1 sentence), PURE1 (pure',
  'pronouncement, name nothing witnessed -- exactly 1 sentence), CHAPTERS3',
  '(exactly 3 sentences). DISPOSITION (grand / funny / indifferent) flavors',
  'the telling and never overrides the shape. Cite only what the bundle',
  'gives you: never invent impacts, bounces, durations, or intentions.',
].join('\n');

// MOOD names. Default RITUAL.
export const MOODS = ['SOLEMN', 'RITUAL', 'FUCK YES'];

// Flail presentation per MOOD. MOOD is presentation and god-temperature
// only: it must never change gravity, impulse, friction, bounce, terrain,
// path, or landing.
export const MOOD_FLAIL = { SOLEMN: 0.35, RITUAL: 1, 'FUCK YES': 2 };

// Shape table. CHAPTERS3 is eligible only if the fall had chapters
// (bounces >= 2 or airtime >= 6 s); rolled while ineligible, it re-rolls
// among the rest. A quiet fall (impacts <= 2 and airtime < 3 s) makes
// CHAPTERS3 ineligible outright.
const SHAPE_BASE = { DETAIL2: 45, DETAIL1: 20, PURE1: 20, CHAPTERS3: 15 };

export function chaptersEligible(f) {
  return f.bounces >= 2 || f.airtime >= 6;
}

export function isStandout(f) {
  return f.strongest >= 12 || f.bounces >= 4 || f.airtime >= 8;
}

export function isQuiet(f) {
  return f.impacts <= 2 && f.airtime < 3;
}

function pickWeighted(weights) {
  let total = 0;
  for (const k of Object.keys(weights)) total += weights[k];
  let r = Math.random() * total;
  for (const k of Object.keys(weights)) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

export function rollShape(f) {
  const w = { ...SHAPE_BASE };
  if (isStandout(f)) {
    w.DETAIL2 += 10;
    w.CHAPTERS3 += 5;
    w.PURE1 -= 15;
  }
  if (isQuiet(f)) {
    w.PURE1 += 20;
  }
  for (const k of Object.keys(w)) w[k] = Math.max(0, w[k]);
  const eligible = chaptersEligible(f) && !isQuiet(f);
  if (!eligible) delete w.CHAPTERS3;
  return pickWeighted(w);
}

// Disposition roll (grand / funny / indifferent), weighted by MOOD.
// Every disposition keeps a nonzero chance at every MOOD.
const DISP_TABLE = {
  SOLEMN: { grand: 50, funny: 15, indifferent: 35 },
  RITUAL: { grand: 30, funny: 35, indifferent: 35 },
  'FUCK YES': { grand: 25, funny: 55, indifferent: 20 },
};

export function rollDisposition(mood) {
  return pickWeighted({ ...(DISP_TABLE[mood] || DISP_TABLE.RITUAL) });
}

// Silence roll: 20% the verdict waits 2.5-4 s, else 0.8-1.5 s. Milliseconds.
export function rollSilence() {
  if (Math.random() < 0.2) return 2500 + Math.random() * 1500;
  return 800 + Math.random() * 700;
}

// The dice, rolled client-side when a fall lands, before any god call.
export function rollDice(mood, fallFacts) {
  return {
    shape: rollShape(fallFacts),
    disposition: rollDisposition(mood),
    silenceMs: rollSilence(),
  };
}

// ---- Fallback bank: local verdicts in the gods' grammar. -----------------
// Templates cite real bundle numbers only: {n} impacts, {strongest} m/s,
// {bounces}, {duration} s, {airtime} s air, {maxspeed} m/s peak. {kept} is
// the mortal's intention in quotes, or "silence" when none was left.
// PURE1 lines are genuinely detail-free: no numbers, no named events.
// At least 4 templates per shape per disposition.
const BANK = {
  DETAIL2: {
    grand: [
      ['You struck the rock {n} times, hardest at {strongest} metres per second. We counted, and the mountain kept count with us.', 'It is done, and it was sufficient.'],
      ['{bounces} times the slope threw you skyward, and {bounces} times you returned. The air held you {airtime} seconds in all.', 'Such persistence has a shape. We have named it.'],
      ['For {duration} seconds you belonged to the fall, and your peak was {maxspeed} metres per second. Nothing else in that time was asked of you.', 'The offering is received in full.'],
      ['The hardest blow landed at {strongest} metres per second. Lesser falls have ended witnesses; yours merely continued.', 'We incline our attention. It is done.'],
    ],
    funny: [
      ['You bounced {bounces} times, which is {bounces} more times than the mountain expected you to survive bouncing.', 'It has revised its opinion. Grudgingly.'],
      ['{airtime} seconds of airtime, {n} impacts, and a peak of {maxspeed} metres per second. The paperwork alone is impressive.', 'Filed under offerings. It is done.'],
      ['The stone reports {n} separate complaints, the loudest at {strongest} metres per second. It asked us to pass them on.', 'We pass them on. It is done.'],
      ['You were airborne {airtime} seconds out of {duration}. Even the wind filed no objection; it merely watched, as do we.', 'Carry on. Or do not. It is done.'],
    ],
    indifferent: [
      ['{n} impacts. Hardest: {strongest} metres per second.', 'Noted. It is done.'],
      ['{bounces} bounces across {duration} seconds, {airtime} of them spent airborne.', 'The mountain remains. So do you. It is done.'],
      ['Peak speed {maxspeed} metres per second. Total air {airtime} seconds.', 'The figures are entered. It is done.'],
      ['The fall lasted {duration} seconds and struck {n} times.', 'We witnessed it. It is done.'],
    ],
  },
  DETAIL1: {
    grand: [
      ['You met the rock {n} times and rose from every meeting but the last.'],
      ['For {duration} seconds the mountain had you, and it has kept something of you.'],
      ['The hardest blow came at {strongest} metres per second, and still you continued down.'],
      ['{bounces} times you left the stone, and {bounces} times the stone reclaimed you.'],
    ],
    funny: [
      ['{n} impacts, and you still landed close enough to hear us clear our throats.'],
      ['The mountain gives your airtime -- {airtime} seconds -- four stars. It gives the landings one.'],
      ['At {maxspeed} metres per second you were technically flying, just badly, and downward.'],
      ['You bounced {bounces} times. The third one was nearly graceful. Nearly.'],
    ],
    indifferent: [
      ['{n} impacts were recorded.'],
      ['The fall took {duration} seconds.'],
      ['Strongest impact: {strongest} metres per second.'],
      ['{airtime} seconds of it were airborne.'],
    ],
  },
  PURE1: {
    grand: [
      ['It is done, and it was worthy of the watching.'],
      ['The mountain receives. We witness. It is enough.'],
      ['What fell has landed. What was offered stands.'],
      ['We have witnessed worse. Not often.'],
    ],
    funny: [
      ['Well. That happened, and we were here for it.'],
      ['The mountain sends its regards, and its bruises.'],
      ['Ambitious. Incorrect. Complete.'],
      ['We laughed. One of us denies it.'],
    ],
    indifferent: [
      ['It is done.'],
      ['Noted.'],
      ['The fall occurred.'],
      ['We saw. It ended.'],
    ],
  },
  CHAPTERS3: {
    grand: [
      ['You left the edge, and the edge released you without ceremony.', 'The middle belonged to the air: {airtime} seconds of borrowed sky across {bounces} risings.', 'The stone closed the account at the bottom. It is done.'],
      ['The beginning was a decision the mountain did not witness.', 'The middle was {duration} seconds of argument with gravity, conducted at {maxspeed} metres per second.', 'The end was a landing. All landings are verdicts. This one reads: sufficient.'],
      ['First the leap, which is always the same leap.', 'Then the {n} reckonings, the hardest at {strongest} metres per second, each one a paragraph.', 'Then the stillness, which is the mountain keeping the last word. It is done.'],
      ['The top gave you height. The slope gave you {bounces} separate heavens, {airtime} seconds in all.', 'The bottom gave you back. We give you meaning: it counted.'],
    ],
    funny: [
      ['Act one: confidence. Act two: {n} impacts of revision.', 'The interval featured {airtime} seconds of unintended flight.', 'Act three: the floor. Reviews are mixed; ours is favourable.'],
      ['You departed the summit with a plan. The plan lasted one bounce.', '{bounces} bounces later, travelling at {maxspeed} metres per second, the plan was a rumour.', 'The landing concluded negotiations. It is done.'],
      ['Chapter one: up. Brief, involuntary, historic.', 'Chapter two: down, {n} times, with feeling, hardest at {strongest} metres per second.', 'Chapter three: stopped. The end.'],
      ['Once you were standing. Then you were falling for {duration} seconds.', 'In between came {bounces} bounces, which the mountain insists on calling dancing.', 'It was not dancing. It is done.'],
    ],
    indifferent: [
      ['It began at the top.', 'It continued for {duration} seconds, {airtime} airborne, {n} impacts.', 'It ended at the bottom. It is done.'],
      ['First: the leap.', 'Then: {bounces} bounces and a peak of {maxspeed} metres per second.', 'Finally: stillness. Noted.'],
      ['The fall opened.', 'The middle contained {n} impacts, hardest {strongest} metres per second.', 'The fall closed.'],
      ['You went down.', 'Down took {duration} seconds and returned you {bounces} times to the air.', 'Down finished.'],
    ],
  },
};

function fill(template, bundle) {
  const f = bundle.fall;
  const kept = bundle.intention ? `"${bundle.intention}"` : 'silence';
  const rep = {
    '{n}': String(f.impacts),
    '{strongest}': f.strongest_impact_ms.toFixed(1),
    '{bounces}': String(f.bounces),
    '{duration}': f.duration_s.toFixed(0),
    '{airtime}': f.airtime_s.toFixed(1),
    '{maxspeed}': f.max_speed_ms.toFixed(1),
    '{kept}': kept,
  };
  return template.map((s) => {
    let out = s;
    for (const k of Object.keys(rep)) out = out.split(k).join(rep[k]);
    return out;
  });
}

function fallbackVerdict(bundle) {
  const pool = (BANK[bundle.shape] && BANK[bundle.shape][bundle.disposition]) ||
    BANK.DETAIL1.indifferent;
  return fill(pool[Math.floor(Math.random() * pool.length)], bundle);
}

// Split endpoint prose into sentences. Generous: anything non-empty counts.
function splitSentences(text) {
  const m = String(text).match(/[^.!?…]+[.!?…]+/g);
  if (m && m.length) return m.map((s) => s.trim()).filter(Boolean);
  const t = String(text).trim();
  return t ? [t] : [];
}

// The call. POSTs { system: SHEET_TEXT, bundle }; the dealt shape and
// disposition travel inside the bundle and the response must obey them.
// Returns { sentences, source }: source is 'endpoint' only when live text
// was actually used, else 'fallback'.
export async function getVerdict(bundle) {
  if (GOD_ENDPOINT) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      let res;
      try {
        res = await fetch(GOD_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system: SHEET_TEXT, bundle }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        const raw = data && (data.verdict || data.text || data.sentences);
        const sentences = Array.isArray(raw) ? raw.map(String) : splitSentences(raw || '');
        const clean = sentences.map((s) => s.trim()).filter(Boolean);
        if (clean.length) return { sentences: clean, source: 'endpoint' };
      }
    } catch (e) {
      // Fall through to the local bank. Never an error state.
    }
  }
  return { sentences: fallbackVerdict(bundle), source: 'fallback' };
}
