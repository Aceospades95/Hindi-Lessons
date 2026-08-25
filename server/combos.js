"use strict";
/**
 * "Mix it up" — endless fresh practice sentences, recombined from material the
 * teacher has already covered. Nothing is invented: every template is a lesson
 * pattern, every inflected form is copied from the lesson grids, and every noun
 * carries the gender recorded on its card. Generated items are graded like any
 * other answer but never enter the spaced-repetition schedule.
 *
 * Item ids are self-describing ("g:t3:T05-018:T05-008:-:0"), so a submitted
 * answer regenerates the same expected sentence statelessly on the server.
 */

// Adjective forms straight from the Aug 23 table (05-adjectives.json). Keyed by
// card id — ids are stable by repo rule, so these never drift from the lesson.
const ADJ = {
  "T05-001": { en: "big",    m: "badaa",   f: "badi" },
  "T05-002": { en: "small",  m: "chhota",  f: "chhoti" },
  "T05-003": { en: "long",   m: "lambaa",  f: "lambi" },
  "T05-004": { en: "good",   m: "achchha", f: "achchhi" },
  "T05-005": { en: "bad",    m: "bura",    f: "buri" },
  "T05-006": { en: "new",    m: "nayaa",   f: "nai" },
  "T05-007": { en: "old",    m: "bordha",  f: "bordhi" },
  "T05-008": { en: "old",    m: "purana",  f: "purani" },
  "T05-009": { en: "fat",    m: "mota",    f: "moti" },
  "T05-010": { en: "thin",   m: "patla",   f: "patli" },
  "T05-011": { en: "sweet",  m: "meetha",  f: "meethi" },
  "T05-012": { en: "sour",   m: "khatta",  f: "khatti" },
  "T05-013": { en: "bitter", m: "kadwa",   f: "kadwi" },
};

// Possessives from the Aug 16 grid.
const POSS = {
  my:   { en: "my",            m: "Mera",   f: "Meri" },
  yrF:  { en: "your (formal)", m: "Aapka",  f: "Aapki" },
  our:  { en: "our",           m: "Hamara", f: "Hamari" },
};

// Which nouns an adjective may describe. bordha is for living beings, purana
// for things (the Aug 23 rule); tastes stick to food. bhaiya is deliberately
// left out everywhere — it takes the respect plural, which combos don't do yet.
const LIVING = ["T02-003", "T02-004", "T05-015", "T05-016"];   // kutta billi bhai behen
const THINGS = ["T05-018", "T04-012"];                          // ghar gaadi
const FOOD_TAGS = ["fruit", "vegetable", "food"];

const PAIR = {
  "T05-011": "food", "T05-012": "food", "T05-013": "food",
  "T05-007": "living", "T05-009": "living", "T05-010": "living",
  "T05-003": "things", "T05-006": "things", "T05-008": "things",
  "T05-001": "any", "T05-002": "any", "T05-004": "any", "T05-005": "any",
};

const TPLS = ["t1", "t2", "t3", "t4", "t5"];

function cleanEn(en) {
  return String(en || "").replace(/\(s\)/g, "s").split("/")[0]
    .replace(/\([^)]*\)/g, "").trim();
}

function nounFrom(cardById, id) {
  const c = cardById.get(id);
  if (!c || (c.gender !== "m" && c.gender !== "f")) return null;
  const isFood = (c.tags || []).some((t) => FOOD_TAGS.includes(t));
  const kind = LIVING.includes(id) ? "living" : THINGS.includes(id) ? "things" : isFood ? "food" : null;
  if (!kind) return null;
  return { id, en: cleanEn(c.eng), rom: c.rom, gender: c.gender, kind };
}

function nounPool(cardById) {
  const out = [];
  for (const [id] of cardById) {
    const n = nounFrom(cardById, id);
    if (n) out.push(n);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

function fits(adjId, noun) {
  const want = PAIR[adjId];
  return want === "any" ? true : want === noun.kind;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Rebuild the English prompt and expected Hindi for a combo id, or null. */
function build(id, cardById) {
  const p = String(id || "").split(":");
  if (p.length !== 6 || p[0] !== "g" || !TPLS.includes(p[1])) return null;
  const [, tpl, nounId, adjId, possKey, negFlag] = p;
  const noun = nounFrom(cardById, nounId);
  if (!noun) return null;
  const adj = adjId === "-" ? null : ADJ[adjId];
  const poss = possKey === "-" ? null : POSS[possKey];
  const neg = negFlag === "1";
  const g = noun.gender;
  if (adjId !== "-" && (!adj || !fits(adjId, noun))) return null;
  if (possKey !== "-" && !poss) return null;

  if (tpl === "t1") {                                   // Aug 16: possessive + noun
    if (!poss || adj || neg) return null;
    return { en: poss.en + " " + noun.en, rom: poss[g] + " " + noun.rom };
  }
  if (tpl === "t2") {                                   // My X is very ADJ.
    if (!poss || !adj || neg) return null;
    return { en: cap(poss.en) + " " + noun.en + " is very " + adj.en + ".",
             rom: poss[g] + " " + noun.rom + " bahut " + adj[g] + " hai." };
  }
  if (tpl === "t3") {                                   // The X is very ADJ.
    if (poss || !adj || neg) return null;
    return { en: "The " + noun.en + " is very " + adj.en + ".",
             rom: cap(noun.rom) + " bahut " + adj[g] + " hai." };
  }
  if (tpl === "t4") {                                   // Aug 4: X ko Y chahiye
    if (poss || adj) return null;
    return { en: neg ? "I don't want " + noun.en + "." : "I want " + noun.en + ".",
             rom: "Mujhko " + noun.rom + (neg ? " nahi" : "") + " chahiye.",
             mujhe: true };
  }
  if (tpl === "t5") {                                   // I want ADJ X. (the khatti pani puri move)
    if (poss || !adj) return null;
    return { en: (neg ? "I don't want " : "I want ") + adj.en + " " + noun.en + ".",
             rom: "Mujhko " + adj[g] + " " + noun.rom + (neg ? " nahi" : "") + " chahiye.",
             mujhe: true };
  }
  return null;
}

const isGen = (id) => typeof id === "string" && id.indexOf("g:") === 0;

/** Quiz payload for a combo id — same shape itemPayload returns. */
function payload(id, cardById) {
  const b = build(id, cardById);
  if (!b) return null;
  return {
    itemId: id, mode: "combo", label: "Mix it up",
    hint: "Type the Hindi in roman letters",
    prompt: b.en, sub: "", answerMode: "roman",
    reveal: {
      dev: "", rom: b.rom, phon: "", eng: b.en,
      note: (b.mujhe ? "mujhe works too — same word as mujhko. " : "") +
            "Built fresh from your lessons; combos aren't tracked for review.",
    },
    _expected: b.rom,
  };
}

/** Generate up to n distinct combo ids, seeded so a session is reproducible. */
function generate(cardById, n, seed) {
  let s = (seed || 1) >>> 0;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const nouns = nounPool(cardById);
  if (!nouns.length) return [];
  const adjIds = Object.keys(ADJ);
  const possKeys = Object.keys(POSS);
  // weighted toward full sentences over bare phrases
  const tpls = ["t1", "t2", "t2", "t3", "t3", "t4", "t5", "t5"];

  const out = [];
  const used = new Set();
  for (let tries = 0; tries < n * 30 && out.length < n; tries++) {
    const tpl = pick(tpls);
    const noun = pick(nouns);
    let adjId = "-", possKey = "-", neg = "0";
    if (tpl === "t2" || tpl === "t3" || tpl === "t5") {
      const okAdjs = adjIds.filter((a) => fits(a, noun));
      if (!okAdjs.length) continue;
      adjId = pick(okAdjs);
    }
    if (tpl === "t1" || tpl === "t2") possKey = pick(possKeys);
    if (tpl === "t4" || tpl === "t5") neg = rnd() < 0.35 ? "1" : "0";
    const id = ["g", tpl, noun.id, adjId, possKey, neg].join(":");
    if (used.has(id)) continue;
    if (!build(id, cardById)) continue;
    used.add(id);
    out.push(id);
  }
  return out;
}

module.exports = { generate, payload, isGen, build, ADJ, POSS };
