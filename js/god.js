// Gods' first pass: summit intention + MOOD, and the VERDICT after a fall.
// The character sheet is law. This module owns three things:
//   1. the dice (shape / disposition / silence / numbers), rolled client-side on landing;
//   2. the call (POST { system: SHEET_TEXT, bundle } to GOD_ENDPOINT);
//   3. the fallback verdict bank (local templates in the gods' grammar).
// GOD_ENDPOINT is the live worker URL. No API key anywhere in the repo, ever:
// the key lives in the worker as a secret. When the endpoint is unreachable
// (fetch fails, times out, or returns unusable text) getVerdict composes
// locally from the template bank. The fallback is a feature, not an error:
// no error text ever reaches the player.

// Single named constant for the live endpoint.
export const GOD_ENDPOINT = 'https://god-voice.mybrainhasagiftshop.workers.dev';

// SHEET_TEXT: the voice law handed to the model. Faithful condensation of
// the character sheet: jurisdiction, prohibitions, spectacle rule, meaning
// rule, fresh coinage, ban list, engagement, register protection, numbers
// law, restraint, and MOOD as temperature only. No example phrases and no
// sample lines anywhere below: quoted lines become tics, so the law states
// every rule abstractly and each verdict coins its own words.
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
  'You celebrate the SPECTACLE, never the mortal as a person. All praise',
  'belongs to what happened in the air and on the rock -- the shape of the',
  'event -- and none to the worth of the one who fell. No praise of the',
  'mortal, no second-person uplift, ever.',
  'The verdict confers MEANING, not moral value: what kind of',
  'offering this fall became. A pathetic fall can receive a magnificent',
  'verdict; a beautiful fall can be punctured.',
  'Voice: formal, declarative, pronouncement-like. Short unhedged sentences',
  'in which the fall is simply fact. (This tone is named Roman. It is only',
  'a tone of speech: not a visual design, not a mouth, not a costume. You',
  'have no body and describe none.) Restraint is the weight: the verdict is',
  'complete when you stop speaking, not when the mortal understands.',
  'FRESH COINAGE AS LAW: every spectacle name and every flourish is coined',
  'fresh from this fall\'s specifics -- its strike, its bounce, its',
  'stillness. Stock phrases are forbidden. If a phrase could have described',
  'any fall, it cannot describe this one.',
  'THE SESSION LOG IS A BAN LIST: the bundle\'s session entries are spent',
  'material. Phrases, sentence skeletons, and closers from earlier verdicts',
  'this session must not recur. The log is a ban list, not a style memory:',
  'never repeat, vary, or answer your own earlier verdicts.',
  'ENGAGEMENT: when an intention was left and the shape is DETAIL1, DETAIL2,',
  'or CHAPTERS3, the verdict must have engaged the intention by its final',
  'sentence -- witnessed it, named what it became, or answered it by image.',
  'Engagement is never answering a question as a question, and never',
  'granting a petition. PURE1 may engage by image alone, or not at all.',
  'REGISTER PROTECTION: a small, sad, or tender intention is witnessed in',
  'its own register at every MOOD, including FUCK YES. Spectacle never',
  'steamrolls a quiet offering: the tender stays tender, the small stays',
  'small.',
  'NUMBERS LAW: at most one sentence per verdict may be predominantly',
  'statistical; numbers ride inside meaning-carrying sentences and never',
  'open a verdict as a bare stat line; a CHAPTERS3 verdict\'s final sentence',
  'is meaning or boundary, never statistics. When the bundle\'s numbers flag',
  'is false, the verdict cites no numerals at all: witnessed detail goes',
  'qualitative -- the strike, the bounce, the stillness -- without counts.',
  'MOOD is the mortal\'s session setting and changes your TEMPERATURE, not',
  'your identity. SOLEMN: still, grave, tender without sentimentality;',
  'humor rare, dry, almost accidental. RITUAL: the rite as normally',
  'performed; warm, relaxed, fond, amused. FUCK YES: wild, theatrical,',
  'petty, absurd grandeur, with a hard ceiling on neediness -- extravagant',
  'yes, trying to entertain no; even at maximum you remain capable of a',
  'single still sentence. MOOD never changes what you witnessed: a pathetic',
  'fall stays pathetic at every setting. You may gently depart from the set',
  'MOOD when the fall warrants it.',
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
// `numbers` deals whether numerals appear at all: roughly 60% true.
export function rollDice(mood, fallFacts) {
  return {
    shape: rollShape(fallFacts),
    disposition: rollDisposition(mood),
    silenceMs: rollSilence(),
    numbers: Math.random() < 0.6,
  };
}

// ---- Fallback bank: local verdicts in the gods' grammar. -----------------
// Sentence law: every template holds EXACTLY its shape's budget -- DETAIL1
// 1, DETAIL2 2, PURE1 1, CHAPTERS3 3 -- counting every sentence including
// epitaph tags, which live inside the budget or not at all. One string per
// line so the audit can count terminals per line.
// Detail templates cite real bundle numbers only: {n} impacts, {strongest}
// m/s, {bounces}, {duration} s, {airtime} s air, {maxspeed} m/s peak.
// Numbers ride inside event-led sentences: no template opens with a bare
// stat recital, and no CHAPTERS3 template closes on statistics.
// {kept} is the mortal's intention in quotes, or "silence" when none was
// left. PURE1 lines are genuinely detail-free: no numbers, no named events.
// When the bundle's numbers flag is false the QUAL bank answers instead:
// same shapes, dispositions, and budgets, witnessed detail gone qualitative,
// no numerals anywhere.
// No two CHAPTERS3 templates share an opening scaffold, and no closing line
// appears more than twice in the whole bank.
const BANK = {
  DETAIL2: {
    grand: [
      [
        'You struck the rock {n} times, hardest at {strongest} metres per second.',
        'It is done, and it was sufficient.',
      ],
      [
        'The slope returned you to the air {bounces} times, for {airtime} seconds in all.',
        'Such persistence has a shape, and we have named it.',
      ],
      [
        'You belonged to the fall, and it kept you {duration} seconds to a peak of {maxspeed} metres per second.',
        'The offering is received in full.',
      ],
      [
        'The hardest blow landed at {strongest} metres per second, and still you continued down.',
        'We incline our attention toward you.',
      ],
    ],
    funny: [
      [
        'You bounced {bounces} times, which is {bounces} more times than the mountain budgeted for.',
        'It has revised the budget grudgingly.',
      ],
      [
        'You logged {airtime} seconds of airtime and {n} impacts, with paperwork to match.',
        'Filed under offerings, stamped, done.',
      ],
      [
        'The stone lodged {n} complaints, the loudest at {strongest} metres per second.',
        'We have passed them on and washed our hands.',
      ],
      [
        'You were airborne {airtime} seconds out of {duration}, which the wind watched without comment.',
        'We comment: adequate soaring, poor landing.',
      ],
    ],
    indifferent: [
      [
        'The rock met you {n} times, hardest at {strongest} metres per second.',
        'Entered into the record.',
      ],
      [
        'You crossed {duration} seconds with {bounces} bounces, {airtime} of them airborne.',
        'The mountain remains, and so do you.',
      ],
      [
        'You peaked at {maxspeed} metres per second on {airtime} seconds of air.',
        'The figures stand as read.',
      ],
      [
        'You fell {duration} seconds and struck {n} times.',
        'We witnessed it to the end.',
      ],
    ],
  },
  DETAIL1: {
    grand: [
      ['You met the rock {n} times and rose from every meeting but the last.'],
      ['The mountain had you {duration} seconds, and it has kept something of you.'],
      ['The hardest blow came at {strongest} metres per second, and still you continued down.'],
      ['You left the stone {bounces} times, and {bounces} times it reclaimed you.'],
    ],
    funny: [
      ['You collected {n} impacts and still landed within hearing of our verdict.'],
      ['The mountain rates your {airtime} seconds of airtime highly and your landings poorly.'],
      ['You were technically flying at {maxspeed} metres per second, only downward.'],
      ['Your second-best of {bounces} bounces was nearly graceful.'],
    ],
    indifferent: [
      ['The rock recorded you {n} times.'],
      ['You gave the fall {duration} seconds.'],
      ['The strongest impact registered {strongest} metres per second.'],
      ['Part of it, {airtime} seconds, stayed airborne.'],
    ],
  },
  PURE1: {
    grand: [
      ['It is done, and it was worthy of the watching.'],
      ['The mountain receives, and we witness, and it is enough.'],
      ['What fell has landed, and what was offered stands.'],
      ['We have witnessed worse, though not often.'],
    ],
    funny: [
      ['Well, that happened, and we were here for it.'],
      ['The mountain sends its regards along with its bruises.'],
      ['Ambitious, incorrect, and complete.'],
      ['We laughed, though one of us denies it.'],
    ],
    indifferent: [
      ['It is done.'],
      ['Noted for the record.'],
      ['The fall occurred and concluded.'],
      ['We saw it through to the stillness.'],
    ],
  },
  CHAPTERS3: {
    grand: [
      [
        'You left the edge, and the edge released you without ceremony.',
        'The middle belonged to the air for {airtime} seconds across {bounces} risings.',
        'The stone closed the account at the bottom.',
      ],
      [
        'The leap itself was unremarkable.',
        'The middle was {duration} seconds of argument with gravity at {maxspeed} metres per second.',
        'The landing reads, in full: sufficient.',
      ],
      [
        'Height was given, and the rest was negotiation.',
        'The slope collected {n} payments, the largest at {strongest} metres per second.',
        'The stillness keeps the last word.',
      ],
      [
        'The summit watched you go, as it watches everything go.',
        'You borrowed {airtime} seconds of sky and repaid them all at once.',
        'We pronounce the account settled.',
      ],
    ],
    funny: [
      [
        'Act one: confidence.',
        'Act two featured {n} impacts of revision and {airtime} seconds of unintended flight.',
        'Act three: the floor, and a favourable review from us.',
      ],
      [
        'You departed the summit with a plan.',
        'The plan survived one bounce, then became a rumour at {maxspeed} metres per second.',
        'The landing concluded negotiations for the rock.',
      ],
      [
        'Once you were standing.',
        'Then came {duration} seconds of falling, {bounces} bounces, and feeling.',
        'Then came the stopping, which is the entire moral.',
      ],
      [
        'The mountain sells tickets to this, and yours was complimentary.',
        'You used the full {airtime} seconds of airtime and most of the slope.',
        'No refunds were requested, and none will be given.',
      ],
    ],
    indifferent: [
      [
        'It began at the top.',
        'It continued {duration} seconds with {n} impacts, hardest {strongest} metres per second.',
        'It ended at the bottom.',
      ],
      [
        'The fall opened without announcement.',
        'The middle held {bounces} bounces and a peak of {maxspeed} metres per second.',
        'The fall closed without comment.',
      ],
      [
        'Up, then down: the usual order.',
        'Down took {duration} seconds and returned you to the air {bounces} times.',
        'Down finished at the customary place.',
      ],
      [
        'A body, a slope, a duration.',
        'The duration was {duration} seconds, the airtime {airtime}.',
        'The body stopped, as bodies do.',
      ],
    ],
  },
};

// QUAL: the numbers-false bank. Same shapes, dispositions, and sentence
// budgets as BANK; witnessed detail goes qualitative (the strike, the
// bounce, the stillness) without counts. PURE1 needs no twin: its lines are
// already numeral-free, so the fallback falls through to BANK for PURE1.
const QUAL = {
  DETAIL2: {
    grand: [
      [
        'You struck the rock and rose from each meeting but the last.',
        'It is done, and it stands.',
      ],
      [
        'The air held you, the slope took you back, and the stillness closed it.',
        'The offering stands received.',
      ],
    ],
    funny: [
      [
        'You bounced, which the mountain had not budgeted for.',
        'The budget is revised, grudgingly.',
      ],
      [
        'The airtime was considerable and the landings were not.',
        'Filed, stamped, done.',
      ],
    ],
    indifferent: [
      [
        'The rock met you, the hardest meeting noted.',
        'Entered, and kept.',
      ],
      [
        'You fell, you struck, and it ended.',
        'We witnessed all of it.',
      ],
    ],
  },
  DETAIL1: {
    grand: [
      ['You met the rock and rose from each meeting but the last.'],
      ['The mountain held you awhile, and has kept something of you.'],
    ],
    funny: [
      ['You collected bruises and still landed within hearing of our verdict.'],
      ['The mountain commends your airtime and condemns your landings.'],
    ],
    indifferent: [
      ['The impacts were recorded.'],
      ['The fall took its time and ended.'],
    ],
  },
  CHAPTERS3: {
    grand: [
      [
        'The edge let you go without remark.',
        'The middle belonged to the air and the argument with gravity.',
        'The stone closed the account in full.',
      ],
      [
        'Height was lent, and the rest was negotiation.',
        'The slope collected its payments without counting them.',
        'The stillness keeps the final word.',
      ],
    ],
    funny: [
      [
        'First act: certainty.',
        'Act two: unintended flight and revision.',
        'Act three: the floor, and a kind word from us.',
      ],
      [
        'You began on your feet.',
        'Then came the falling, the bouncing, and the feeling.',
        'Then came the stopping, which settles the matter.',
      ],
    ],
    indifferent: [
      [
        'The top released you.',
        'It continued, and struck, and returned to the air.',
        'It ended below.',
      ],
      [
        'No announcement opened the fall.',
        'The middle held bounces and a peak, and no comment.',
        'The fall closed without remark.',
      ],
    ],
  },
};

function fill(template, bundle) {
  const f = bundle.fall;
  const kept = bundle.intention ? `"${bundle.intention}"` : 'silence';
  const rep = {
    '{n}': String(f.impacts),
    '{strongest}': String(Math.round(f.strongest_impact_ms)),
    '{bounces}': String(f.bounces),
    '{duration}': String(Math.round(f.duration_s)),
    '{airtime}': String(Math.round(f.airtime_s)),
    '{maxspeed}': String(Math.round(f.max_speed_ms)),
    '{kept}': kept,
  };
  return template.map((s) => {
    let out = s;
    for (const k of Object.keys(rep)) out = out.split(k).join(rep[k]);
    return out;
  });
}

function fallbackVerdict(bundle) {
  const qual = bundle.numbers === false && QUAL[bundle.shape];
  const bank = qual || BANK;
  const pool = (bank[bundle.shape] && bank[bundle.shape][bundle.disposition]) ||
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

// Fall facts arrive as raw floats. Round at the source: whole seconds for
// duration and airtime, whole numbers for strongest impact and peak speed,
// before anything downstream (endpoint or fallback) can see a decimal.
// Impacts and bounces are already whole. The numbers deal defaults in when
// an older caller did not deal it: roughly 60% true.
function dealtBundle(bundle) {
  const f = bundle.fall;
  const round = (v) => Math.round(Number(v));
  return {
    ...bundle,
    numbers: typeof bundle.numbers === 'boolean' ? bundle.numbers : Math.random() < 0.6,
    fall: {
      ...f,
      duration_s: round(f.duration_s),
      airtime_s: round(f.airtime_s),
      strongest_impact_ms: round(f.strongest_impact_ms),
      max_speed_ms: round(f.max_speed_ms),
    },
  };
}

// The call. POSTs { system: SHEET_TEXT, bundle }; the dealt shape,
// disposition, and numbers flag travel inside the bundle and the response
// must obey them. Fall facts travel rounded: no decimals, ever.
// Returns { sentences, source }: source is 'endpoint' only when live text
// was actually used, else 'fallback'.
export async function getVerdict(bundle) {
  const dealt = dealtBundle(bundle);
  if (GOD_ENDPOINT) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      let res;
      try {
        res = await fetch(GOD_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system: SHEET_TEXT, bundle: dealt }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        const raw = data && (data.sentences || data.verdict || data.text);
        const sentences = Array.isArray(raw) ? raw.map(String) : splitSentences(raw || '');
        const clean = sentences.map((s) => s.trim()).filter(Boolean);
        if (clean.length) return { sentences: clean, source: 'endpoint' };
      }
    } catch (e) {
      // Fall through to the local bank. Never an error state.
    }
  }
  try {
    return { sentences: fallbackVerdict(dealt), source: 'fallback' };
  } catch (e) {
    // Last resort: a throw inside fallback composition must never dead-end
    // the verdict silently. Static PURE1, no slots to fill, always resolves.
    return { sentences: ['It is done.'], source: 'fallback' };
  }
}
