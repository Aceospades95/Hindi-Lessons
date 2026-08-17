/** Grader test suite — run with `npm test`. Every case is a real learner near-miss. */
"use strict";
const { grade } = require("./grade");

let pass = 0, fail = 0;
function t(desc, given, expected, mode, want) {
  const r = grade(given, expected, { mode });
  const ok = r.verdict === want;
  if (ok) pass++;
  else { fail++; console.log(`  FAIL  ${desc}\n        "${given}" vs "${expected}" [${mode}] -> ${r.verdict}, wanted ${want}`); }
}

console.log("\nAccepted as PERFECT (harmless differences)");
t("extra trailing space", "kitaab ", "kitaab", "roman", "perfect");
t("double internal space", "main  Theek  hoon", "main Theek hoon", "roman", "perfect");
t("missing full stop", "main Theek hoon", "main Theek hoon.", "roman", "perfect");
t("missing danda", "मैं ठीक हूँ", "मैं ठीक हूँ।", "dev", "perfect");
t("case on plain letters", "Namaste", "namaste", "roman", "perfect");
t("english article dropped", "book", "a book", "en", "perfect");
t("english article added", "the book", "book", "en", "perfect");
t("infinitive to- dropped", "do", "to do", "en", "perfect");
t("gender tag ignored", "book", "book (f)", "en", "perfect");
t("one of several glosses", "hat", "cap, hat", "en", "perfect");
t("slash alternative", "yes", "yes / no (polite)", "en", "perfect");
t("parenthetical ignored", "father-in-law", "father-in-law (m)", "en", "perfect");
t("hyphen vs space", "father in law", "father-in-law", "en", "perfect");
t("em-dash gloss", "change", "chhuTTaa (m) — change, small notes", "en", "perfect");

console.log("Accepted as CLOSE (counted correct, with a note)");
t("retroflex flattened", "theek", "Theek", "roman", "close");
t("retroflex flattened 2", "beta", "beTaa", "roman", "close");
t("vowel length short", "kitab", "kitaab", "roman", "close");
t("vowel length long", "namastee", "namaste", "roman", "close");
t("ee vs i", "dilli", "dillee", "roman", "close");
t("gemination dropped", "dilee", "dillee", "roman", "close");
t("z vs j (nukta)", "jaroor", "zaroor", "roman", "close");
t("v vs w", "wahaan", "vahaan", "roman", "close");
t("single typo", "namste", "namaste", "roman", "close");
t("typo in english", "brothr", "brother", "en", "close");
t("nasal spelling", "main Thik hun", "main Theek hoon", "roman", "close");
t("dev nukta missing", "जरूर", "ज़रूर", "dev", "close");
t("dev anusvar vs candrabindu", "हां", "हाँ", "dev", "close");
t("sentence, one word off", "main dillee mein rehta hoon", "main dillee mein rehtaa hoon", "roman", "close");
t("english reworded", "I live in Delhi city", "I live in Delhi", "en", "close");

console.log("Rejected as WRONG (genuinely different)");
t("different word", "kursee", "kitaab", "roman", "wrong");
t("aspiration matters", "kal", "khal", "roman", "wrong");
t("dental vs retroflex letter", "daal", "Daal", "roman", "close");  // case-only -> coached, not punished
t("wrong meaning", "chair", "book", "en", "wrong");
t("empty", "", "kitaab", "roman", "wrong");
t("unrelated sentence", "voh ghar gayaa", "main khaanaa khaataa hoon", "roman", "wrong");
t("wrong devanagari", "कुर्सी", "किताब", "dev", "wrong");

console.log("\nCoaching notes fire where they should");
const rn = grade("theek", "Theek", { mode: "roman" });
if (/retroflex/i.test(rn.note || "")) { pass++; console.log("  ok    retroflex note present"); }
else { fail++; console.log("  FAIL  expected a retroflex note, got:", rn.note); }

const d = grade("kitab", "kitaab", { mode: "roman" });
if (d.diff && d.diff.some((s) => s.op !== "same")) { pass++; console.log("  ok    diff spans returned"); }
else { fail++; console.log("  FAIL  expected diff spans"); }

const ai = grade("I go to the market every day on foot", "I walk to the bazaar daily", { mode: "en" });
if (ai.needsAI) { pass++; console.log("  ok    long mismatch flagged for AI adjudication"); }
else { fail++; console.log("  FAIL  expected needsAI on long freeform mismatch"); }

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
