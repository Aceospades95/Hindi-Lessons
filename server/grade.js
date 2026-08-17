/**
 * The forgiving grader.
 *
 * Design goal: never punish a learner for a stray space, a missing article, a
 * comma, or a romanization ambiguity the course itself created — but always TELL
 * them what differed, because the difference is the lesson.
 *
 * Verdicts:
 *   perfect — exact after harmless normalization
 *   close   — accepted, with a note explaining the difference (counts as correct)
 *   wrong   — not accepted (still returns a diff so they can see why)
 *
 * Layers, cheapest first. The AI adjudicator in ai.js only runs for freeform
 * sentence answers that this file rates `wrong`, and can only upgrade a verdict.
 */

"use strict";

// ---------------------------------------------------------------- normalizing

const PUNCT = /[.,!?;:"'‘’“”()\[\]{}—–\-…।|]/g;

/** Harmless cleanup applied to every answer before anything else. */
function normalize(s) {
  return String(s == null ? "" : s)
    .normalize("NFC")
    .replace(/‍|‌/g, "")     // zero-width joiners
    .replace(PUNCT, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lower(s) {
  return normalize(s).toLowerCase();
}

/** English-side leniency: drop articles and the infinitive "to". */
function englishKey(s) {
  return lower(s)
    .replace(/\b(a|an|the)\b/g, " ")
    .replace(/^to\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Expand a gloss into every answer we should accept.
 *   "yes / no (polite)"      -> ["yes no polite", "yes no", "yes", "no", ...]
 *   "book (m)"               -> ["book"]
 *   "to do, to make"         -> ["do", "make", "do make"]
 *   "father-in-law"          -> ["father in law"]
 *   "cap, hat"               -> ["cap", "hat"]
 */
function acceptSet(expected) {
  const out = new Set();
  const add = (v) => { const k = englishKey(v); if (k) out.add(k); };

  let base = String(expected || "");
  add(base);

  // without any parenthetical / bracketed asides
  const noParen = base.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  add(noParen);

  // strip a trailing gender/pos tag even when unparenthesised
  add(noParen.replace(/\b(m|f|vt|vi|inv|adj|adv)\b\s*$/i, ""));

  // split on separators that mean "or"
  for (const chunk of noParen.split(/[/;,]| — | – |\bor\b/)) {
    add(chunk);
    add(chunk.replace(/\b(m|f|vt|vi|inv)\b/gi, ""));
  }

  // "to do" ~ "do" is handled by englishKey; also accept the -ing form
  for (const v of Array.from(out)) {
    const m = v.match(/^([a-z]+)e?$/);
    if (m && v.length > 3) out.add(m[1].replace(/e$/, "") + "ing");
  }
  out.delete("");
  return out;
}

// ---------------------------------------------------- romanization skeletons

/**
 * Collapse the dimensions of our romanization that learners legitimately
 * confuse, so `dilee`, `dillee`, `Dillee` and `dilli` all share a skeleton.
 * What we deliberately do NOT collapse: aspiration (kh vs k), retroflex vs
 * dental as *letters* (only case), sh vs s. Those change words.
 */
function romanSkeleton(s) {
  let t = lower(s);
  t = t.replace(/।/g, " ");
  // Delhi nukta relaxations
  t = t.replace(/z/g, "j").replace(/q/g, "k").replace(/f/g, "ph");
  // v/w are one phoneme in Hindi
  t = t.replace(/w/g, "v");
  // vowel length is the #1 spelling wobble
  t = t.replace(/aa/g, "a").replace(/ee/g, "i").replace(/oo/g, "u");
  t = t.replace(/ii/g, "i").replace(/uu/g, "u");
  // ai/au kept, but their common alternates fold in
  t = t.replace(/ei/g, "ai").replace(/ou/g, "au");
  // final schwa / trailing -a is optional
  t = t.replace(/a\b/g, "");
  // gemination
  t = t.replace(/([bcdfghjklmnprstvy])\1+/g, "$1");
  // nasal spellings: n/m/ n( ) all collapse
  t = t.replace(/\(n\)/g, "n").replace(/m\b/g, "n");
  return t.replace(/\s+/g, " ").trim();
}

/** Devanagari skeleton: ignore nukta, anusvar/candrabindu choice, danda. */
function devSkeleton(s) {
  return String(s || "")
    .normalize("NFC")
    .replace(/[।॥]/g, " ")
    .replace(/़/g, "")                    // nukta
    .replace(/[ँं]/g, "ं")      // candrabindu -> anusvar
    .replace(/न्(?=[कखगघचछजझटठडढतथदधपफबभ])/g, "ं")  // हिन्दी == हिंदी
    .replace(/म्(?=[पफबभ])/g, "ं")
    .replace(/\s+/g, "")
    .trim();
}

// ------------------------------------------------------------ edit distance

function damerau(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);   // transposition
      }
    }
  }
  return d[m][n];
}

/** How many edits we forgive, by target length. */
function tolerance(len) {
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  if (len <= 14) return 2;
  if (len <= 25) return 3;
  return Math.min(6, Math.floor(len / 8));
}

/** Word-overlap score for long freeform answers (0..1). */
function wordOverlap(a, b) {
  const A = a.split(" ").filter(Boolean), B = b.split(" ").filter(Boolean);
  if (!A.length || !B.length) return 0;
  const bag = new Map();
  B.forEach((w) => bag.set(w, (bag.get(w) || 0) + 1));
  let hit = 0;
  A.forEach((w) => { const c = bag.get(w); if (c) { hit++; bag.set(w, c - 1); } });
  return (2 * hit) / (A.length + B.length);
}

// ------------------------------------------------------------------- diffing

/** Minimal char-level diff, returned as spans for the UI to render. */
function diff(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = a[i - 1] === b[j - 1]
        ? d[i - 1][j - 1]
        : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
  const out = [];
  let i = m, j = n;
  const push = (op, ch) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text = ch + last.text;
    else out.push({ op, text: ch });
  };
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) { push("same", a[i - 1]); i--; j--; }
    else if (j > 0 && (i === 0 || d[i][j - 1] <= d[i - 1][j] && d[i][j - 1] <= d[i - 1][j - 1])) { push("add", b[j - 1]); j--; }
    else if (i > 0 && (j === 0 || d[i - 1][j] <= d[i - 1][j - 1])) { push("del", a[i - 1]); i--; }
    else { push("del", a[i - 1]); push("add", b[j - 1]); i--; j--; }
  }
  // we backtracked from the end, so the runs came out last-first
  return out.reverse();
}

/**
 * A character diff only teaches something when the two strings are actually
 * related. If half the characters differ, it renders as alphabet soup — better
 * to show nothing and let the reference answer speak.
 */
function usefulDiff(a, b) {
  const d = damerau(a.toLowerCase(), b.toLowerCase());
  return d <= Math.max(3, Math.ceil(Math.max(a.length, b.length) * 0.5)) ? diff(a, b) : null;
}

// -------------------------------------------------------- retroflex coaching

/** Did they get the word right but flatten a retroflex to lowercase? */
function retroflexNote(given, expected) {
  const g = normalize(given), e = normalize(expected);
  if (g.toLowerCase() !== e.toLowerCase()) return null;
  const bad = [];
  for (let i = 0; i < Math.min(g.length, e.length); i++) {
    if (g[i] !== e[i] && "TDNR".includes(e[i]) && e[i].toLowerCase() === g[i]) bad.push(e[i]);
  }
  if (!bad.length) return null;
  const uniq = Array.from(new Set(bad));
  return `Right word — but ${uniq.join(", ")} is retroflex (tongue curled back). We write it capitalised: ${e}`;
}

// ------------------------------------------------------------------ grading

/**
 * @param {string} given     what the learner typed
 * @param {string} expected  the canonical answer
 * @param {object} opts      { mode: 'en'|'roman'|'dev'|'free' }
 * @returns {{verdict, score, note, expected, given, diff, needsAI}}
 */
function grade(given, expected, opts = {}) {
  const mode = opts.mode || "en";
  const g0 = normalize(given), e0 = normalize(expected);
  const base = { given: g0, expected: e0, diff: null, note: null, needsAI: false };

  if (!g0) return { ...base, verdict: "wrong", score: 0, note: "Nothing entered." };

  // ---- exact, ignoring case+punct+spacing
  if (lower(g0) === lower(e0)) {
    const rn = mode === "roman" ? retroflexNote(g0, e0) : null;
    return rn
      ? { ...base, verdict: "close", score: 0.9, note: rn, diff: diff(g0, e0) }
      : { ...base, verdict: "perfect", score: 1 };
  }

  // ---- Devanagari
  if (mode === "dev") {
    if (devSkeleton(g0) === devSkeleton(e0)) {
      return { ...base, verdict: "close", score: 0.9, diff: diff(g0, e0),
               note: "Accepted — the difference is a nukta or nasal mark. Compare them carefully." };
    }
    const dist = damerau(devSkeleton(g0), devSkeleton(e0));
    if (dist <= tolerance(devSkeleton(e0).length)) {
      return { ...base, verdict: "close", score: 0.7, diff: diff(g0, e0),
               note: `Very close — ${dist} character${dist === 1 ? "" : "s"} off.` };
    }
    return { ...base, verdict: "wrong", score: 0, diff: usefulDiff(g0, e0) };
  }

  // ---- English meaning: any of the derived alternates counts
  if (mode === "en") {
    // NOTE: build the accept-set from the RAW gloss — normalize() strips the very
    // commas, slashes and dashes that mark the alternatives apart.
    const set = acceptSet(expected);
    set.add(englishKey(e0));
    const gk = englishKey(g0);
    if (set.has(gk)) return { ...base, verdict: "perfect", score: 1 };

    let bestDist = Infinity, bestAlt = null;
    for (const alt of set) {
      const dist = damerau(gk, alt);
      if (dist < bestDist) { bestDist = dist; bestAlt = alt; }
    }
    if (bestAlt !== null && bestDist <= tolerance(bestAlt.length)) {
      return { ...base, verdict: "close", score: 0.85, diff: diff(g0, e0),
               note: bestDist <= 1 ? "Typo — counted as correct." : "Close enough — counted as correct." };
    }
    // long answers: judge by word overlap instead of characters
    if (e0.split(" ").length >= 4) {
      const ov = wordOverlap(gk, englishKey(e0));
      if (ov >= 0.75) return { ...base, verdict: "close", score: 0.8, diff: diff(g0, e0),
                               note: "Same meaning, different wording — counted as correct." };
      if (ov >= 0.45) return { ...base, verdict: "wrong", score: 0, diff: usefulDiff(g0, e0), needsAI: true };
    }
    return { ...base, verdict: "wrong", score: 0, diff: usefulDiff(g0, e0), needsAI: e0.split(" ").length >= 4 };
  }

  // ---- romanization (and freeform Hindi)
  const gs = romanSkeleton(g0), es = romanSkeleton(e0);
  if (gs === es) {
    const rn = retroflexNote(g0, e0);
    return { ...base, verdict: "close", score: 0.9, diff: diff(g0, e0),
             note: rn || "Accepted — vowel length or spelling differs. The bold letters show what the course uses." };
  }
  const dist = damerau(gs, es);
  if (dist <= tolerance(es.length)) {
    return { ...base, verdict: "close", score: 0.75, diff: diff(g0, e0),
             note: `Close — ${dist} letter${dist === 1 ? "" : "s"} off from the course spelling.` };
  }
  if (e0.split(" ").length >= 3) {
    const ov = wordOverlap(gs, es);
    if (ov >= 0.8) return { ...base, verdict: "close", score: 0.7, diff: diff(g0, e0),
                            note: "Most of the sentence is right — check the highlighted bits." };
    if (ov >= 0.4) return { ...base, verdict: "wrong", score: 0, diff: usefulDiff(g0, e0), needsAI: true };
  }
  return { ...base, verdict: "wrong", score: 0, diff: usefulDiff(g0, e0), needsAI: mode === "free" };
}

module.exports = { grade, normalize, romanSkeleton, devSkeleton, acceptSet, damerau, diff, usefulDiff, tolerance };
