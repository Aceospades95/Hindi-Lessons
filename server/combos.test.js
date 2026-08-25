"use strict";
/**
 * Sanity checks for the "Mix it up" generator. The bar: a generated sentence is
 * either exactly what the teacher's tables produce, or it is not generated at
 * all — and generated items never touch the spaced-repetition schedule.
 */
process.env.DATA_DIR = process.env.DATA_DIR || require("os").tmpdir() + "/hindi-combo-test-" + process.pid;

const assert = require("assert");
const db = require("./db");
const auth = require("./auth");
const quiz = require("./quiz");
const combos = require("./combos");
const { grade } = require("./grade");

let checks = 0;
const ok = (cond, msg) => { assert(cond, msg); checks++; };

const user = auth.createUser({ email: "combo@test", name: "Combo", password: "combopass1" });

// ---- exact forms, straight from the Aug 16 / Aug 23 tables
const expect = (id, rom) => {
  const p = quiz.itemPayload(id, "combo");
  ok(p && p._expected === rom, id + " → " + (p && p._expected) + " (wanted: " + rom + ")");
};
expect("g:t3:T05-018:T05-008:-:0", "Ghar bahut purana hai.");        // masc thing
expect("g:t3:T04-012:T05-008:-:0", "Gaadi bahut purani hai.");       // fem thing
expect("g:t2:T02-003:T05-009:my:0", "Mera kutta bahut mota hai.");   // masc living
expect("g:t2:T02-004:T05-010:our:0", "Hamari billi bahut patli hai.");
expect("g:t1:T05-018:-:yrF:0", "Aapka ghar");
expect("g:t1:T04-012:-:my:0", "Meri gaadi");
expect("g:t4:T05-024:-:-:0", "Mujhko aaloo chahiye.");
expect("g:t4:T05-024:-:-:1", "Mujhko aaloo nahi chahiye.");
expect("g:t5:T05-027:T05-012:-:1", "Mujhko khatti mirchi nahi chahiye.");  // the khatti move, fem
expect("g:t5:T05-019:T05-011:-:0", "Mujhko meetha tarbuz chahiye.");       // masc fruit

// ---- combinations the lessons don't license must not exist
ok(!quiz.itemPayload("g:t3:T02-003:T05-012:-:0", "combo"), "sour dog rejected (taste is food-only)");
ok(!quiz.itemPayload("g:t3:T05-018:T05-007:-:0", "combo"), "bordha house rejected (bordha is for the living)");
ok(!quiz.itemPayload("g:t2:T05-024:T05-006:my:0", "combo"), "new potato rejected (nayaa is for things)");
ok(!quiz.itemPayload("g:t2:T05-017:T05-009:my:0", "combo"), "bhaiya rejected (respect plural not generated)");
ok(!quiz.itemPayload("g:t3:T02-010:T05-001:-:0", "combo"), "ek rejected (no gender on record)");
ok(!quiz.itemPayload("g:t9:T05-018:-:-:0", "combo"), "unknown template rejected");
ok(!quiz.itemPayload("g:t3:T05-018:T05-008:-:0", "produce"), "combo ids answer only in combo mode");

// ---- a combo-only session fills up, every item round-trips and self-grades
const session = quiz.buildSession(user, { size: 20, modes: ["combo"], seed: 42 });
ok(session.length >= 15, "combo-only session fills (got " + session.length + ")");
for (const it of session) {
  ok(it.mode === "combo" && combos.isGen(it.itemId), it.itemId + " is a combo");
  ok(it.prompt && it._expected, it.itemId + " has prompt and expected");
  const again = quiz.itemPayload(it.itemId, "combo");
  ok(again && again._expected === it._expected, it.itemId + " regenerates the same expected");
  ok(grade(it._expected, it._expected, { mode: "roman" }).verdict === "perfect",
     it.itemId + " self-grades perfect");
}
const distinct = new Set(session.map((i) => i.itemId));
ok(distinct.size === session.length, "no duplicate combos in a session");

// ---- two different seeds give different sessions (the anti-repetition point)
const a = quiz.buildSession(user, { size: 15, modes: ["combo"], seed: 1 }).map((i) => i.itemId).join("|");
const b = quiz.buildSession(user, { size: 15, modes: ["combo"], seed: 2 }).map((i) => i.itemId).join("|");
ok(a !== b, "different seeds → different combo sessions");

// ---- devanagari off (the default): no script items, no Devanagari prompts
const plain = quiz.buildSession(user, { size: 25, modes: ["recognise", "script", "sentence"], seed: 7 });
ok(plain.length > 0, "session builds with devanagari off");
for (const it of plain) {
  ok(it.mode !== "script", "no script items when devanagari is off");
  ok(!/[ऀ-ॿ]/.test(it.prompt), it.itemId + " prompt is roman: " + it.prompt);
}
const devUser = { ...user, settings: JSON.stringify({ devanagari: "on" }) };
const withDev = quiz.buildSession(devUser, { size: 25, modes: ["script"], seed: 7 });
ok(withDev.some((i) => i.mode === "script"), "script drills return when the toggle is on");

// ---- graded and counted, but never scheduled
(async () => {
  const it = session[0];
  const res = await quiz.submit(user, { itemId: it.itemId, mode: "combo", given: it._expected, ms: 900 });
  ok(res.verdict === "perfect", "combo submit grades (got " + res.verdict + ")");
  ok(/not scheduled/.test(res.next), "combo submit reports not-scheduled");
  const srsRows = db.prepare("SELECT COUNT(*) n FROM srs WHERE user_id=? AND item_id LIKE 'g:%'").get(user.id).n;
  ok(srsRows === 0, "combos never enter the srs table");
  const att = db.prepare("SELECT COUNT(*) n FROM attempts WHERE user_id=? AND item_id=?").get(user.id, it.itemId).n;
  ok(att === 1, "combo attempt is logged for history");

  console.log("combos: " + checks + " checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
