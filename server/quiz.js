"use strict";
/** Builds quiz sessions from the course data and grades submissions. */
const fs = require("fs");
const path = require("path");
const db = require("./db");
const srs = require("./srs");
const { grade } = require("./grade");
const ai = require("./ai");
const combos = require("./combos");

const DATA = path.join(__dirname, "..", "data");
const myLessons = require("./lessons");
const cards = JSON.parse(fs.readFileSync(path.join(DATA, "cards.json"), "utf8")).decks
  .concat(myLessons.decks);
const sentences = JSON.parse(fs.readFileSync(path.join(DATA, "sentences.json"), "utf8")).items
  .concat(myLessons.sentenceItems);

const cardById = new Map();
cards.forEach((d) => d.cards.forEach((c) =>
  cardById.set(c.id, { ...c, deck: d.code, deckTitle: d.title, week: d.week, kind: d.kind || "word" })));
const sentById = new Map(sentences.map((s) => [s.id, s]));

/** Strip the "(m)" / "(vt)" tag and any [bracketed] pronunciation off a romanization. */
const bare = (rom) => String(rom || "")
  .replace(/\((m|f|vt|vi|inv|adj|adv)\)/gi, "")
  .replace(/\[[^\]]*\]/g, "")
  .trim();

/**
 * Letter decks (D01/D02) hold alphabet cards, not vocabulary — their "English"
 * field is an example word, so asking "what does क mean?" is nonsense. They get
 * their own two drills: name the letter, and write the letter.
 */
const isLetter = (c) => c.kind === "letter";

const MODES = {
  recognise: {
    label: "Read it", hint: "What does this mean?",
    answer: "en", from: "dev",
    build: (c) => isLetter(c)
      ? { prompt: c.dev, sub: "", expected: bare(c.rom), answerMode: "roman",
          hint: "What sound is this letter?" }
      // Tutor cards may have no Devanagari yet (the teacher works romanized) —
      // fall back to prompting with the roman form.
      : { prompt: c.dev || bare(c.rom), sub: "", expected: c.eng, answerMode: "en" },
  },
  produce: {
    label: "Say it", hint: "Type the Hindi in roman letters",
    answer: "roman", from: "eng",
    build: (c) => isLetter(c) ? null
      : { prompt: c.eng, sub: "", expected: bare(c.rom), answerMode: "roman" },
  },
  script: {
    label: "Write it", hint: "Type it in Devanagari",
    answer: "dev", from: "eng",
    build: (c) => isLetter(c)
      ? { prompt: bare(c.rom), sub: "", expected: c.dev, answerMode: "dev",
          hint: "Write this letter in Devanagari" }
      : (!c.dev ? null   // no script form on record — nothing to write yet
         : { prompt: c.eng, sub: bare(c.rom), expected: c.dev, answerMode: "dev" }),
  },
  sentence: {
    label: "Translate", hint: "Translate into English",
    answer: "en", from: "dev",
    build: (s) => ({ prompt: s.dev || s.rom, sub: s.dev ? s.rom : "",
                     expected: s.eng, answerMode: "en" }),
  },
  sentenceHi: {
    label: "Into Hindi", hint: "Translate into Hindi (roman letters are fine)",
    answer: "roman", from: "eng",
    build: (s) => ({ prompt: s.eng, sub: "", expected: s.rom, answerMode: "roman" }),
  },
  // Generated recombinations of taught material — handled by combos.js, never
  // built from a stored card, so build() stays null for real items.
  combo: {
    label: "Mix it up", hint: "Type the Hindi in roman letters",
    answer: "roman", from: "eng",
    build: () => null,
  },
};

/** Per-user settings live as a JSON blob on the users row. */
function userSettings(user) {
  try { return JSON.parse((user && user.settings) || "{}"); } catch (e) { return {}; }
}
/** Devanagari is opt-in: script drills and Devanagari prompts arrive only
 *  once the learner flips the toggle on. */
const devanagariOn = (user) => userSettings(user).devanagari === "on";

function itemPayload(itemId, mode, opts = {}) {
  if (combos.isGen(itemId)) return mode === "combo" ? combos.payload(itemId, cardById) : null;
  const spec = MODES[mode];
  if (!spec || mode === "combo") return null;
  const noDev = !!opts.noDev;
  if (noDev && mode === "script") return null;
  const isSent = itemId.startsWith("s");
  const src = isSent ? sentById.get(itemId) : cardById.get(itemId);
  if (!src) return null;
  if (noDev && !isSent && isLetter(src)) return null;   // letter cards are pure script
  if (isSent !== (mode === "sentence" || mode === "sentenceHi")) return null;
  const built = spec.build(src);
  if (!built || !built.expected || !built.prompt) return null;
  if (noDev) {
    // Devanagari toggle off: prompt in roman instead of script
    if (mode === "recognise") { built.prompt = bare(src.rom); }
    if (mode === "sentence") { built.prompt = src.rom; built.sub = ""; }
    if (!built.prompt) return null;
  }
  return {
    itemId, mode, label: spec.label, hint: built.hint || spec.hint,
    prompt: built.prompt, sub: built.sub, answerMode: built.answerMode,
    // reference shown only AFTER answering
    reveal: isSent
      ? { dev: src.dev, rom: src.rom, phon: src.phon, eng: src.eng, src: src.src }
      : { dev: src.dev, rom: src.rom, phon: src.phon, eng: src.eng, note: src.note, deck: src.deckTitle },
    _expected: built.expected,
  };
}

function shuffle(a, seed) {
  let s = seed || 1;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Assemble a session: due reviews first, then fresh items from decks the
 * learner's course week has unlocked.
 */
/** Does this item id belong to one of the filtered decks?
 *  Cards: "T03-001" → deck T03. Sentences: "sT03-01" → deck T03.
 *  Course sentences ("s0001") carry no deck and never match a filter. */
function inDecks(itemId, filter) {
  return filter.some((code) => itemId.indexOf(code + "-") === 0 ||
                               itemId.indexOf("s" + code + "-") === 0);
}

function buildSession(user, { size = 15, modes, decks: deckFilter, week, onlyDue = false, seed } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const devOn = devanagariOn(user);
  const rndSeed = seed || Date.now() % 100000;
  const wantModes = (modes && modes.length ? modes : ["recognise", "produce", "script", "sentence"])
    .filter((m) => MODES[m])
    .filter((m) => devOn || m !== "script");   // script drills only when the toggle is on
  const withCombos = wantModes.includes("combo");
  const qModes = wantModes.filter((m) => m !== "combo");
  const pOpts = { noDev: !devOn };
  const filtered = deckFilter && deckFilter.length ? deckFilter : null;
  const out = [];
  const used = new Set();

  // 1. due reviews first — shuffled within the due window, so a backlog stops
  // serving the identical items in the identical order every single session.
  const dueRows = [];
  for (const d of srs.dueItems(user.id, today, size * 3)) {
    if (!qModes.includes(d.mode)) continue;
    if (filtered && !inDecks(d.item_id, filtered)) continue;
    dueRows.push(d);
  }
  shuffle(dueRows, rndSeed + 7);
  const takeDue = (limit) => {
    for (const d of dueRows) {
      if (out.length >= limit) break;
      const k = d.item_id + d.mode;
      if (used.has(k)) continue;
      const p = itemPayload(d.item_id, d.mode, pOpts);
      if (p) { out.push({ ...p, isReview: true }); used.add(k); }
    }
  };
  // unless review-only was asked for, keep room in every session for fresh material
  takeDue(onlyDue ? size : Math.ceil(size * 0.7));
  if (onlyDue) return out;

  // 2. new material, weighted to the learner's current week
  const seen = srs.seenSet(user.id);
  const maxWeek = week || 26;
  const pool = [];
  for (const deck of cards) {
    if (deckFilter && deckFilter.length && !deckFilter.includes(deck.code)) continue;
    if (deck.week > maxWeek + 1) continue;
    for (const c of deck.cards) pool.push({ id: c.id, kind: "card" });
  }
  for (const s of sentences) {
    if (filtered) {
      // deck-scoped session: only sentences that belong to a chosen deck
      if (!s.deck || filtered.indexOf(s.deck) === -1) continue;
    } else if (s.week > maxWeek) continue;
    pool.push({ id: s.id, kind: "sent" });
  }
  shuffle(pool, rndSeed);

  const cardModes = qModes.filter((m) => m !== "sentence" && m !== "sentenceHi");
  const sentModes = qModes.filter((m) => m === "sentence" || m === "sentenceHi");
  // combos claim a slice of the session up front (all of it if they're the only mode)
  const comboTarget = !withCombos ? 0
    : (cardModes.length || sentModes.length)
      ? Math.min(size - out.length, Math.max(3, Math.ceil(size / 3)))
      : size - out.length;
  const freshLimit = size - comboTarget;
  let mi = 0;
  for (const p of pool) {
    if (out.length >= freshLimit) break;
    const list = p.kind === "sent" ? sentModes : cardModes;
    if (!list.length) continue;
    const mode = list[mi++ % list.length];
    const k = p.id + mode;
    if (used.has(k) || seen.has(p.id + "|" + mode)) continue;
    const payload = itemPayload(p.id, mode, pOpts);
    if (!payload) continue;
    out.push({ ...payload, isReview: false });
    used.add(k);
  }

  // 3. combos fill their slice — plus whatever fresh material couldn't cover
  if (withCombos && out.length < size) {
    for (const id of combos.generate(cardById, (size - out.length) * 2, rndSeed + 13)) {
      if (out.length >= size) break;
      const p = itemPayload(id, "combo");
      if (p) out.push({ ...p, isReview: false });
    }
  }

  // 4. still short (pool exhausted, no combos)? let due reviews use the space
  if (out.length < size) takeDue(size);

  // due stays first; fresh material and combos interleave behind it
  const head = out.filter((x) => x.isReview);
  const tail = out.filter((x) => !x.isReview);
  shuffle(tail, rndSeed + 29);
  return head.concat(tail);
}

/** Grade one submitted answer, record it, and advance the schedule. */
async function submit(user, { itemId, mode, given, ms = 0, tzOffset = 0 }) {
  const payload = itemPayload(itemId, mode, { noDev: !devanagariOn(user) });
  if (!payload) return { error: "unknown item" };
  const isGen = combos.isGen(itemId);

  let result = grade(given, payload._expected, { mode: payload.answerMode });
  let judgedBy = "rules";

  if (result.verdict === "wrong" && result.needsAI && ai.enabled()) {
    const verdict = await ai.adjudicate({
      prompt: payload.prompt, expected: payload._expected, given, mode: payload.answerMode,
    });
    if (verdict && verdict.verdict !== "wrong") {
      judgedBy = "ai";
      result = {
        ...result,
        verdict: verdict.verdict === "correct" ? "close" : "close",
        score: verdict.verdict === "correct" ? 0.9 : 0.6,
        note: verdict.note || "Accepted — your wording works.",
      };
    }
  }

  const day = new Date(Date.now() - tzOffset * 60000).toISOString().slice(0, 10);
  db.prepare(`INSERT INTO attempts
      (user_id,item_id,mode,prompt,expected,given,verdict,score,ms,judged_by,note,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(user.id, itemId, mode, payload.prompt, payload._expected, String(given || ""),
         result.verdict, result.score, ms, judgedBy, result.note || null, new Date().toISOString());

  // Generated combos are graded and counted, but never scheduled for review.
  const state = isGen
    ? { due: "not scheduled — combos are fresh every time", box: 0 }
    : srs.review(user.id, itemId, mode, result.verdict, day);
  bumpDay(user.id, day, { reviewed: 1, correct: result.verdict === "wrong" ? 0 : 1 });

  return {
    verdict: result.verdict, score: result.score, note: result.note,
    diff: result.diff, expected: payload._expected, judgedBy,
    reveal: payload.reveal, next: state.due, box: state.box,
  };
}

/** Learner insists they were right — respect it, and log that they did. */
function override(user, attemptId) {
  const a = db.prepare("SELECT * FROM attempts WHERE id=? AND user_id=?").get(attemptId, user.id);
  if (!a) return { error: "not found" };
  db.prepare("UPDATE attempts SET verdict='close', score=0.8, judged_by='override' WHERE id=?").run(attemptId);
  const day = a.created_at.slice(0, 10);
  if (a.verdict === "wrong") {
    db.prepare("UPDATE study_days SET correct = correct + 1 WHERE user_id=? AND day=?").run(user.id, day);
    if (!combos.isGen(a.item_id)) srs.review(user.id, a.item_id, a.mode, "close", new Date().toISOString().slice(0, 10));
  }
  return { ok: true };
}

function bumpDay(userId, day, { seconds = 0, reviewed = 0, correct = 0, chapters = 0 }) {
  db.prepare(`
    INSERT INTO study_days (user_id, day, seconds, reviewed, correct, chapters)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id, day) DO UPDATE SET
      seconds = seconds + excluded.seconds,
      reviewed = reviewed + excluded.reviewed,
      correct = correct + excluded.correct,
      chapters = chapters + excluded.chapters
  `).run(userId, day, seconds, reviewed, correct, chapters);
}

const deckList = () => cards.map((d) => ({
  code: d.code, title: d.title, group: d.group, week: d.week, n: d.cards.length,
}));

module.exports = { buildSession, submit, override, bumpDay, deckList, MODES, itemPayload,
                   totals: { cards: cardById.size, sentences: sentById.size } };
