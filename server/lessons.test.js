"use strict";
/**
 * Sanity checks for the My Lessons content files. Run with the grader suite via
 * `npm test`. These guard the conventions the quiz engine relies on: id shape,
 * id stability across files, and that every drillable item actually builds a
 * quiz payload in the modes it supports.
 */
process.env.DATA_DIR = process.env.DATA_DIR || require("os").tmpdir() + "/hindi-test-" + process.pid;

const assert = require("assert");
const lessons = require("./lessons");
const quiz = require("./quiz");

let checks = 0;
const ok = (cond, msg) => { assert(cond, msg); checks++; };

ok(lessons.lessons.length >= 1, "at least one lesson file loads");

const ids = new Set();
for (const L of lessons.lessons) {
  const where = L._file + ": ";
  ok(/^T\d+$/.test(L.code || ""), where + "code must look like T01");
  ok(L.title, where + "title required");
  ok(Number.isInteger(L.seq), where + "seq required");

  for (const v of L.vocab || []) {
    ok(v.id && v.id.indexOf(L.code + "-") === 0, where + "card id must start with " + L.code + "-");
    ok(v.id[0] !== "s", where + v.id + ": card ids must never start with 's'");
    ok(!ids.has(v.id), where + v.id + " duplicated");
    ids.add(v.id);
    ok(v.en && v.rom, where + v.id + ": en and rom required");
  }
  for (const s of L.sentences || []) {
    ok(s.id && s.id.indexOf("s" + L.code + "-") === 0, where + "sentence id must start with s" + L.code + "-");
    ok(!ids.has(s.id), where + s.id + " duplicated");
    ids.add(s.id);
    ok(s.en && s.rom, where + s.id + ": en and rom required");
    ok(typeof s.confirmed === "boolean", where + s.id + ": confirmed must be true/false");
  }
}

// Every confirmed item must build a quiz payload in the modes it supports.
for (const d of lessons.decks) {
  for (const c of d.cards) {
    ok(quiz.itemPayload(c.id, "produce"), c.id + " should drill in produce mode");
    ok(quiz.itemPayload(c.id, "recognise"), c.id + " should drill in recognise mode");
    if (c.dev) ok(quiz.itemPayload(c.id, "script"), c.id + " has Devanagari, should drill in script mode");
  }
}
for (const s of lessons.sentenceItems) {
  ok(quiz.itemPayload(s.id, "sentence"), s.id + " should drill in sentence mode");
  ok(quiz.itemPayload(s.id, "sentenceHi"), s.id + " should drill in sentenceHi mode");
}

// Challenge (unconfirmed) sentences must stay OUT of the graded pool.
for (const L of lessons.lessons) {
  for (const s of L.sentences || []) {
    if (s.confirmed === false) {
      ok(!quiz.itemPayload(s.id, "sentence"), s.id + " is unconfirmed and must not be drillable");
    }
  }
}

const cardCount = lessons.decks.reduce((n, d) => n + d.cards.length, 0);
console.log(
  "lessons: " + checks + " checks passed — " + lessons.lessons.length + " lessons, " +
  cardCount + " cards, " + lessons.sentenceItems.length + " drillable sentences"
);
