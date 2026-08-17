"use strict";
/**
 * Spaced repetition: SM-2 simplified, tuned so a six-month course actually
 * finishes. Intervals in days.
 *
 * Grades map from the grader's verdicts:
 *   perfect -> 3   close -> 2   wrong -> 0
 * A "close" answer still advances, just more slowly — matching the promise that
 * near-misses are not punished.
 */
const db = require("./db");

const STEPS = [0, 1, 2, 4, 8, 16, 32, 64, 120];  // box -> interval in days

function addDays(day, n) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function getState(userId, itemId, mode) {
  return db.prepare("SELECT * FROM srs WHERE user_id=? AND item_id=? AND mode=?")
           .get(userId, itemId, mode);
}

/** Apply a review result and return the new state. */
function review(userId, itemId, mode, verdict, today) {
  const prev = getState(userId, itemId, mode) || {
    box: 0, ease: 2.5, interval: 0, streak: 0, lapses: 0, seen: 0,
  };
  let { box, ease, streak, lapses, seen } = prev;
  seen += 1;

  if (verdict === "wrong") {
    box = Math.max(0, box - 2);
    ease = Math.max(1.3, ease - 0.2);
    streak = 0;
    lapses += 1;
  } else if (verdict === "close") {
    box = Math.min(STEPS.length - 1, box + 1);
    ease = Math.max(1.3, ease - 0.05);
    streak += 1;
  } else {
    box = Math.min(STEPS.length - 1, box + 1);
    ease = Math.min(3.2, ease + 0.08);
    streak += 1;
  }

  const baseDays = STEPS[box];
  const interval = box <= 2 ? baseDays : Math.max(1, Math.round(baseDays * (ease / 2.5)));
  const due = addDays(today, interval);

  db.prepare(`
    INSERT INTO srs (user_id, item_id, mode, box, ease, interval, due, streak, lapses, seen, last_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id, item_id, mode) DO UPDATE SET
      box=excluded.box, ease=excluded.ease, interval=excluded.interval, due=excluded.due,
      streak=excluded.streak, lapses=excluded.lapses, seen=excluded.seen, last_at=excluded.last_at
  `).run(userId, itemId, mode, box, ease, interval, due, streak, lapses, seen, new Date().toISOString());

  return { box, ease, interval, due, streak, lapses, seen };
}

function dueCount(userId, today) {
  return db.prepare("SELECT COUNT(*) n FROM srs WHERE user_id=? AND due<=?").get(userId, today).n;
}

function dueItems(userId, today, limit) {
  return db.prepare(
    "SELECT item_id, mode, box, due FROM srs WHERE user_id=? AND due<=? ORDER BY due ASC, box ASC LIMIT ?"
  ).all(userId, today, limit);
}

function seenSet(userId) {
  const rows = db.prepare("SELECT item_id, mode FROM srs WHERE user_id=?").all(userId);
  return new Set(rows.map((r) => r.item_id + "|" + r.mode));
}

/** Cards whose box is high enough to call "known". */
function stats(userId, today) {
  const r = db.prepare(`
    SELECT COUNT(*) total,
           SUM(CASE WHEN box >= 5 THEN 1 ELSE 0 END) strong,
           SUM(CASE WHEN box BETWEEN 2 AND 4 THEN 1 ELSE 0 END) learning,
           SUM(CASE WHEN box <= 1 THEN 1 ELSE 0 END) shaky,
           SUM(CASE WHEN due <= ? THEN 1 ELSE 0 END) due
    FROM srs WHERE user_id = ?`).get(today, userId);
  return {
    total: r.total || 0, strong: r.strong || 0, learning: r.learning || 0,
    shaky: r.shaky || 0, due: r.due || 0,
  };
}

module.exports = { review, dueCount, dueItems, seenSet, stats, getState, addDays, STEPS };
