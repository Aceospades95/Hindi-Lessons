"use strict";
/** Everything the momentum dashboard needs, in one query bundle. */
const db = require("./db");
const srs = require("./srs");

const DAYMS = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const shift = (day, n) => { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

/** Milestones tied to real course moments, not arbitrary point totals. */
const MILESTONES = [
  { code: "first_day",   name: "First session",        blurb: "You showed up. That was the hard part.",        test: (s) => s.totalDays >= 1 },
  { code: "week_one",    name: "Seven days in",         blurb: "A week of Hindi is a habit forming.",           test: (s) => s.totalDays >= 7 },
  { code: "streak_7",    name: "7-day streak",          blurb: "One week without missing your goal.",           test: (s) => s.longest >= 7 },
  { code: "streak_30",   name: "30-day streak",         blurb: "A month straight. This is who you are now.",    test: (s) => s.longest >= 30 },
  { code: "script_done", name: "Reads Devanagari",      blurb: "Finished the whole script course.",             test: (s) => s.chaptersDone.has("book1-s09") },
  { code: "cards_100",   name: "100 cards known",       blurb: "A hundred words are yours.",                    test: (s) => s.srs.strong >= 100 },
  { code: "cards_400",   name: "400 cards known",       blurb: "Enough vocabulary to hold a real conversation.",test: (s) => s.srs.strong >= 400 },
  { code: "ergative",    name: "Survived the ergative", blurb: "Unit 14. The mountain everyone warns you about.", test: (s) => s.chaptersDone.has("book2-u14") },
  { code: "inlaws",      name: "Dinner-ready",          blurb: "Lesson 14 done — you can hold your own at the table.", test: (s) => s.chaptersDone.has("book4-L14") },
  { code: "half_way",    name: "Halfway",               blurb: "13 weeks of the plan behind you.",              test: (s) => s.chaptersDone.size >= 40 },
  { code: "reviews_500", name: "500 reviews",           blurb: "Five hundred answers typed out.",               test: (s) => s.totalReviews >= 500 },
  { code: "reviews_2000",name: "2,000 reviews",         blurb: "Serious mileage.",                              test: (s) => s.totalReviews >= 2000 },
  { code: "all_books",   name: "Read it all",           blurb: "Every chapter of all five books.",              test: (s) => s.chaptersDone.size >= 116 },
];

function dayRows(userId, fromDay) {
  return db.prepare("SELECT * FROM study_days WHERE user_id=? AND day>=? ORDER BY day").all(userId, fromDay);
}

/**
 * Streak with a humane rule: your goal-met days form the streak, and ONE missed
 * day per rolling week is forgiven rather than resetting you to zero. Burnout is
 * the real enemy of a six-month plan.
 */
function streaks(days, goalMin, today) {
  const met = new Map();
  days.forEach((d) => met.set(d.day, d.seconds >= goalMin * 60 || d.reviewed >= 30));

  let current = 0, grace = 1, cursor = today;
  if (!met.get(cursor)) cursor = shift(today, -1);       // today isn't over yet
  for (let i = 0; i < 400; i++) {
    if (met.get(cursor)) { current++; grace = 1; }
    else if (grace > 0 && current > 0) { grace--; }
    else break;
    cursor = shift(cursor, -1);
  }

  const all = Array.from(met.keys()).sort();
  let longest = 0, run = 0, prev = null, g = 1;
  for (const d of all) {
    if (!met.get(d)) continue;
    if (prev) {
      const gap = Math.round((new Date(d) - new Date(prev)) / DAYMS);
      if (gap === 1) run++;
      else if (gap === 2 && g > 0) { run++; g--; }
      else { run = 1; g = 1; }
    } else run = 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest };
}

function dashboard(user, tzOffset = 0) {
  const today = iso(new Date(Date.now() - tzOffset * 60000));
  const start = user.start_date || today;
  const goal = user.daily_goal || 20;

  const heatFrom = shift(today, -181);
  const days = dayRows(user.id, heatFrom);
  const byDay = new Map(days.map((d) => [d.day, d]));

  const todayRow = byDay.get(today) || { seconds: 0, reviewed: 0, correct: 0, chapters: 0 };
  const totals = db.prepare(
    "SELECT COUNT(*) n, COALESCE(SUM(seconds),0) sec, COALESCE(SUM(reviewed),0) rev, COALESCE(SUM(correct),0) cor FROM study_days WHERE user_id=?"
  ).get(user.id);

  const done = db.prepare("SELECT chapter_id FROM progress WHERE user_id=? AND completed_at IS NOT NULL").all(user.id);
  const chaptersDone = new Set(done.map((r) => r.chapter_id));

  const s = srs.stats(user.id, today);
  const st = streaks(days, goal, today);

  // last 30 days series for the charts
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const d = shift(today, -i);
    const r = byDay.get(d) || { seconds: 0, reviewed: 0, correct: 0 };
    series.push({ day: d, minutes: Math.round(r.seconds / 60), reviewed: r.reviewed, correct: r.correct });
  }

  // 26-week heatmap grid
  const heat = [];
  for (let i = 181; i >= 0; i--) {
    const d = shift(today, -i);
    const r = byDay.get(d);
    heat.push({ day: d, minutes: r ? Math.round(r.seconds / 60) : 0, reviewed: r ? r.reviewed : 0 });
  }

  const weeksIn = Math.floor((new Date(today) - new Date(start)) / (7 * DAYMS)) + 1;
  const planWeek = Math.min(26, Math.max(1, weeksIn));

  const ctx = {
    totalDays: totals.n, totalReviews: totals.rev, longest: st.longest,
    chaptersDone, srs: s,
  };
  const earnedRows = db.prepare("SELECT code, earned_at FROM milestones WHERE user_id=?").all(user.id);
  const earned = new Map(earnedRows.map((r) => [r.code, r.earned_at]));
  const fresh = [];
  for (const m of MILESTONES) {
    if (!earned.has(m.code) && m.test(ctx)) {
      db.prepare("INSERT OR IGNORE INTO milestones (user_id, code, earned_at) VALUES (?,?,?)")
        .run(user.id, m.code, new Date().toISOString());
      earned.set(m.code, new Date().toISOString());
      fresh.push(m.code);
    }
  }

  const recent = db.prepare(
    `SELECT verdict, COUNT(*) n FROM attempts WHERE user_id=? AND created_at > ? GROUP BY verdict`
  ).all(user.id, new Date(Date.now() - 7 * DAYMS).toISOString());
  const mix = { perfect: 0, close: 0, wrong: 0 };
  recent.forEach((r) => { mix[r.verdict] = r.n; });

  const weakest = db.prepare(`
    SELECT item_id, mode, prompt, expected, COUNT(*) tries,
           SUM(CASE WHEN verdict='wrong' THEN 1 ELSE 0 END) misses
    FROM attempts WHERE user_id=?
    GROUP BY item_id, mode HAVING misses >= 2
    ORDER BY misses DESC, tries DESC LIMIT 12`).all(user.id);

  return {
    today: {
      day: today, minutes: Math.round(todayRow.seconds / 60), goal,
      reviewed: todayRow.reviewed, correct: todayRow.correct,
      pct: Math.min(100, Math.round((todayRow.seconds / 60 / goal) * 100)),
      goalMet: todayRow.seconds >= goal * 60 || todayRow.reviewed >= 30,
    },
    streak: st,
    totals: {
      days: totals.n, hours: +(totals.sec / 3600).toFixed(1),
      reviews: totals.rev, accuracy: totals.rev ? Math.round((totals.cor / totals.rev) * 100) : null,
      chapters: chaptersDone.size,
    },
    srs: s,
    series, heat, mix, weakest,
    plan: { startDate: start, week: planWeek, weeksIn },
    milestones: MILESTONES.map((m) => ({
      code: m.code, name: m.name, blurb: m.blurb,
      earnedAt: earned.get(m.code) || null, isNew: fresh.includes(m.code),
    })),
  };
}

module.exports = { dashboard, MILESTONES, streaks };
