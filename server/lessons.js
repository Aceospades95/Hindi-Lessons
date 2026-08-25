"use strict";
/**
 * My Lessons — Jacob's real Preply classes as first-class study material.
 *
 * Source of truth: content/lessons/*.json, one file per lesson, transcribed
 * from notebook photos in the "Hindi Learning" Claude project. This module
 * loads them at boot and exposes three views of the same data:
 *
 *   decks         — quiz decks in the exact shape data/cards.json uses,
 *                   so the practice engine treats tutor vocab like any deck
 *   sentenceItems — sentence items in the data/sentences.json shape
 *                   (+ deck + confirmed), for the translate drills
 *   payload       — everything the "My Lessons" view renders
 *
 * Conventions the rest of the app relies on:
 *   - card ids look like  T03-001  (deck code + number, never starting "s")
 *   - sentence ids look like  sT03-01  (an "s" + the deck code)
 *   - ids are STABLE. New material is appended with fresh ids; existing ids
 *     are never renumbered, or review history would detach from its items.
 *   - week is always 1: tutor material is never locked behind the course plan.
 *   - sentences with  "confirmed": false  are challenge items — shown in the
 *     lesson view and the Ask-next-time list, but kept out of graded drills
 *     until the teacher confirms them.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "content", "lessons");

function loadRaw() {
  let files = [];
  try {
    files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  } catch (e) {
    return [];                                   // no lessons yet — that's fine
  }
  return files
    .map((f) => {
      const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      j._file = f;
      return j;
    })
    .sort((a, b) => (a.seq || 0) - (b.seq || 0));
}

const lessons = loadRaw();

const decks = lessons.map((L) => ({
  code: L.code,
  group: "My Lessons",
  title: L.title,
  week: 1,
  kind: "word",
  source: "Preply lesson" + (L.date ? " · " + L.date : ""),
  cards: (L.vocab || []).map((v) => ({
    id: v.id,
    dev: v.dev || "",
    fs: "",
    rom: v.rom,
    phon: v.phon || "",
    eng: v.en,
    note: v.note || "",
    gender: v.gender || "",     // combos.js pairs adjectives by these two
    tags: v.tags || [],
  })),
}));

const sentenceItems = [];
lessons.forEach((L) => {
  (L.sentences || []).forEach((s) => {
    if (s.confirmed === false) return;
    sentenceItems.push({
      id: s.id,
      dev: s.dev || "",
      rom: s.rom,
      phon: s.phon || "",
      eng: s.en,
      src: L.code,
      week: 1,
      deck: L.code,
      note: s.note || "",
    });
  });
});

const payload = lessons.map((L) => ({
  code: L.code,
  seq: L.seq,
  date: L.date || null,
  title: L.title,
  topic: L.topic || "",
  pattern: L.pattern || null,
  grids: L.grids || [],
  vocab: L.vocab || [],
  sentences: L.sentences || [],
  watch_out: L.watch_out || [],
  ask_next_time: L.ask_next_time || [],
  counts: {
    words: (L.vocab || []).length,
    sentences: (L.sentences || []).filter((s) => s.confirmed !== false).length,
    challenges: (L.sentences || []).filter((s) => s.confirmed === false).length,
  },
}));

module.exports = { lessons, decks, sentenceItems, payload };
