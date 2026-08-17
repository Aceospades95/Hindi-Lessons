/**
 * Fabricates study history for ONE demo account so the dashboard can be
 * eyeballed with realistic data. Never run against real data — it only touches
 * the account whose email you pass, and the shipped image starts empty.
 *
 *   node tools/seed-demo.js demo@local 70
 */
"use strict";
const db = require("../server/db");
const auth = require("../server/auth");
const quiz = require("../server/quiz");
const srs = require("../server/srs");

const email = process.argv[2] || "demo@local";
const days = Number(process.argv[3] || 70);

let u = auth.byEmail(email);
if (!u) u = auth.createUser({ email, name: "Jacob", password: "demopassword", startDate: shift(-days) });

function shift(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

db.prepare("DELETE FROM study_days WHERE user_id=?").run(u.id);
db.prepare("DELETE FROM attempts WHERE user_id=?").run(u.id);
db.prepare("DELETE FROM srs WHERE user_id=?").run(u.id);
db.prepare("DELETE FROM progress WHERE user_id=?").run(u.id);
db.prepare("DELETE FROM milestones WHERE user_id=?").run(u.id);

let totalRev = 0;
for (let i = days; i >= 0; i--) {
  const day = shift(-i);
  const dow = new Date(day + "T00:00:00Z").getUTCDay();
  const skip = (dow === 0 && rnd() < 0.55) || rnd() < 0.12;      // rest days happen
  if (skip) continue;
  const mins = Math.round(14 + rnd() * 34 + (i < 20 ? 8 : 0));
  const reviewed = Math.round(12 + rnd() * 40);
  const acc = 0.55 + Math.min(0.34, (days - i) / days * 0.36) + rnd() * 0.08;
  const correct = Math.min(reviewed, Math.round(reviewed * acc));
  totalRev += reviewed;
  db.prepare(`INSERT INTO study_days (user_id,day,seconds,reviewed,correct,chapters)
              VALUES (?,?,?,?,?,?)`).run(u.id, day, mins * 60, reviewed, correct, rnd() < 0.35 ? 1 : 0);
}

// chapters completed, in plan order
const content = require("../data/content.json");
const flat = [];
content.books.forEach((b) => b.chapters.forEach((c) => { if (c.kind !== "key") flat.push(c.id); }));
flat.slice(0, 34).forEach((id, n) => {
  db.prepare(`INSERT OR REPLACE INTO progress (user_id,chapter_id,seconds,opened_at,completed_at)
              VALUES (?,?,?,?,?)`).run(u.id, id, 600 + Math.round(rnd() * 900),
              new Date().toISOString(), new Date(Date.now() - (34 - n) * 86400000).toISOString());
});

// SRS spread + a few stubborn items
const decks = require("../data/cards.json").decks;
const pool = [];
decks.slice(0, 9).forEach((d) => d.cards.forEach((c) => pool.push(c)));
pool.slice(0, 430).forEach((c, i) => {
  const box = i < 210 ? 5 + Math.floor(rnd() * 4) : i < 340 ? 2 + Math.floor(rnd() * 3) : Math.floor(rnd() * 2);
  const due = shift(box >= 5 ? Math.floor(rnd() * 30) : box >= 2 ? Math.floor(rnd() * 4) - 1 : -1);
  db.prepare(`INSERT OR REPLACE INTO srs (user_id,item_id,mode,box,ease,interval,due,streak,lapses,seen,last_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(u.id, c.id, "recognise", box, 2.5, srs.STEPS[box], due, box, box < 2 ? 3 : 0, box + 2, new Date().toISOString());
});
const stubborn = pool.slice(300, 309);
stubborn.forEach((c) => {
  for (let k = 0; k < 3; k++) {
    db.prepare(`INSERT INTO attempts (user_id,item_id,mode,prompt,expected,given,verdict,score,ms,judged_by,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(u.id, c.id, "produce", c.dev, c.eng, "…", "wrong", 0, 4000, "rules",
           new Date(Date.now() - k * 86400000).toISOString());
  }
});
// a week of verdict mix
for (let i = 0; i < 90; i++) {
  const v = rnd() < 0.58 ? "perfect" : rnd() < 0.62 ? "close" : "wrong";
  const c = pool[Math.floor(rnd() * 300)];
  db.prepare(`INSERT INTO attempts (user_id,item_id,mode,prompt,expected,given,verdict,score,ms,judged_by,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(u.id, c.id, "recognise", c.dev, c.eng, c.eng, v, v === "wrong" ? 0 : 1, 3000, "rules",
         new Date(Date.now() - Math.floor(rnd() * 6) * 86400000).toISOString());
}

console.log(`seeded ${email}: ${days} days, ~${totalRev} reviews, 34 chapters, 430 srs rows`);
