"use strict";
const express = require("express");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const db = require("./db");
const auth = require("./auth");
const quiz = require("./quiz");
const stats = require("./stats");
const srs = require("./srs");
const ai = require("./ai");

const PORT = Number(process.env.PORT || 8080);
const DATA = path.join(__dirname, "..", "data");
const PUBLIC = path.join(__dirname, "..", "public");

const app = express();
app.set("trust proxy", 1);
app.use(compression());
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use(auth.attach);

const nowISO = () => new Date().toISOString();
const dayFor = (tz) => new Date(Date.now() - (Number(tz) || 0) * 60000).toISOString().slice(0, 10);

// ------------------------------------------------------------------ content
const content = JSON.parse(fs.readFileSync(path.join(DATA, "content.json"), "utf8"));

app.get("/api/content", auth.required, (_req, res) => {
  res.set("Cache-Control", "private, max-age=3600");
  res.json(content);
});

// ---------------------------------------------------------------- my lessons
const myLessons = require("./lessons");

app.get("/api/lessons", auth.required, (_req, res) => {
  res.set("Cache-Control", "private, max-age=300");
  res.json({ lessons: myLessons.payload });
});

// --------------------------------------------------------------------- auth
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });

app.get("/api/auth/me", (req, res) => {
  res.json({ user: auth.publicUser(req.user), policy: auth.signupPolicy() });
});

app.post("/api/auth/signup", authLimit, (req, res) => {
  const { email, name, password, invite, startDate } = req.body || {};
  if (!email || !name || !password) return res.status(400).json({ error: "Name, email and password are all required." });
  if (String(password).length < 8) return res.status(400).json({ error: "Use at least 8 characters for the password." });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "That email doesn't look right." });

  const policy = auth.signupPolicy();
  if (!policy.allowed) return res.status(403).json({ error: "Signups are closed on this server." });
  if (policy.inviteRequired && !invite) return res.status(403).json({ error: "An invite code is required." });
  if (auth.byEmail(email)) return res.status(409).json({ error: "That email is already registered." });

  let user;
  try {
    user = auth.createUser({ email, name, password, isAdmin: policy.first, startDate });
  } catch (e) {
    return res.status(500).json({ error: "Could not create the account." });
  }
  if (policy.inviteRequired && !auth.consumeInvite(invite, user.id)) {
    db.prepare("DELETE FROM users WHERE id=?").run(user.id);
    return res.status(403).json({ error: "That invite code isn't valid." });
  }
  const token = auth.startSession(user.id, req.get("user-agent"));
  res.cookie("dh_session", token, auth.cookieOpts(req));
  res.json({ user: auth.publicUser(user) });
});

app.post("/api/auth/login", authLimit, (req, res) => {
  const { email, password } = req.body || {};
  const user = auth.byEmail(email);
  if (!auth.verify(user, String(password || ""))) {
    return res.status(401).json({ error: "Email or password is wrong." });
  }
  const token = auth.startSession(user.id, req.get("user-agent"));
  res.cookie("dh_session", token, auth.cookieOpts(req));
  res.json({ user: auth.publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  if (req.cookies && req.cookies.dh_session) auth.endSession(req.cookies.dh_session);
  res.clearCookie("dh_session", { path: "/" });
  res.json({ ok: true });
});

app.post("/api/auth/settings", auth.required, (req, res) => {
  const { name, dailyGoal, startDate, settings, password } = req.body || {};
  if (name) db.prepare("UPDATE users SET name=? WHERE id=?").run(String(name).slice(0, 80), req.user.id);
  if (dailyGoal) db.prepare("UPDATE users SET daily_goal=? WHERE id=?")
    .run(Math.max(5, Math.min(240, Number(dailyGoal))), req.user.id);
  if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate))
    db.prepare("UPDATE users SET start_date=? WHERE id=?").run(startDate, req.user.id);
  if (settings && typeof settings === "object")
    db.prepare("UPDATE users SET settings=? WHERE id=?").run(JSON.stringify(settings).slice(0, 8000), req.user.id);
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ error: "Password too short." });
    const bcrypt = require("bcryptjs");
    db.prepare("UPDATE users SET pass_hash=? WHERE id=?").run(bcrypt.hashSync(String(password), 11), req.user.id);
  }
  res.json({ user: auth.publicUser(auth.getUser(req.user.id)) });
});

// ----------------------------------------------------------------- progress
app.get("/api/progress", auth.required, (req, res) => {
  const answers = {}, checks = {};
  db.prepare("SELECT key, value FROM answers WHERE user_id=?").all(req.user.id)
    .forEach((r) => { answers[r.key] = r.value; });
  db.prepare("SELECT key, on_ FROM checks WHERE user_id=?").all(req.user.id)
    .forEach((r) => { checks[r.key] = !!r.on_; });
  const chapters = {};
  db.prepare("SELECT chapter_id, seconds, completed_at FROM progress WHERE user_id=?").all(req.user.id)
    .forEach((r) => { chapters[r.chapter_id] = { seconds: r.seconds, done: !!r.completed_at }; });
  res.json({ answers, checks, chapters });
});

app.post("/api/progress/answer", auth.required, (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: "key required" });
  db.prepare(`INSERT INTO answers (user_id,key,value,updated_at) VALUES (?,?,?,?)
    ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(req.user.id, String(key).slice(0, 200), String(value || "").slice(0, 2000), nowISO());
  res.json({ ok: true });
});

app.post("/api/progress/check", auth.required, (req, res) => {
  const { key, on } = req.body || {};
  if (!key) return res.status(400).json({ error: "key required" });
  db.prepare(`INSERT INTO checks (user_id,key,on_) VALUES (?,?,?)
    ON CONFLICT(user_id,key) DO UPDATE SET on_=excluded.on_`)
    .run(req.user.id, String(key).slice(0, 200), on ? 1 : 0);
  res.json({ ok: true });
});

app.post("/api/progress/chapter", auth.required, (req, res) => {
  const { chapterId, done, tzOffset } = req.body || {};
  if (!chapterId) return res.status(400).json({ error: "chapterId required" });
  const day = dayFor(tzOffset);
  const prev = db.prepare("SELECT completed_at FROM progress WHERE user_id=? AND chapter_id=?")
                 .get(req.user.id, chapterId);
  db.prepare(`INSERT INTO progress (user_id,chapter_id,opened_at,completed_at) VALUES (?,?,?,?)
    ON CONFLICT(user_id,chapter_id) DO UPDATE SET completed_at=excluded.completed_at`)
    .run(req.user.id, chapterId, nowISO(), done ? nowISO() : null);
  if (done && !(prev && prev.completed_at)) quiz.bumpDay(req.user.id, day, { chapters: 1 });
  res.json({ ok: true });
});

/** Heartbeat: the client posts ~every 30s while the tab is visible and active. */
app.post("/api/progress/tick", auth.required, (req, res) => {
  const { seconds, chapterId, tzOffset } = req.body || {};
  const s = Math.max(0, Math.min(120, Number(seconds) || 0));   // clamp: no fake marathons
  if (!s) return res.json({ ok: true });
  const day = dayFor(tzOffset);
  quiz.bumpDay(req.user.id, day, { seconds: s });
  if (chapterId) {
    db.prepare(`INSERT INTO progress (user_id,chapter_id,seconds,opened_at) VALUES (?,?,?,?)
      ON CONFLICT(user_id,chapter_id) DO UPDATE SET seconds = seconds + excluded.seconds`)
      .run(req.user.id, chapterId, s, nowISO());
  }
  res.json({ ok: true });
});

// --------------------------------------------------------------------- quiz
app.get("/api/quiz/decks", auth.required, (_req, res) => {
  res.json({ decks: quiz.deckList(), totals: quiz.totals, modes:
    Object.entries(quiz.MODES).map(([k, v]) => ({ key: k, label: v.label, hint: v.hint })) });
});

app.post("/api/quiz/session", auth.required, (req, res) => {
  const { size, modes, decks, onlyDue, tzOffset } = req.body || {};
  const week = stats.dashboard(req.user, tzOffset).plan.week;
  const items = quiz.buildSession(req.user, {
    size: Math.max(5, Math.min(60, Number(size) || 15)),
    modes, decks, onlyDue: !!onlyDue, week,
  }).map(({ _expected, ...safe }) => safe);      // never ship the answer to the client
  res.json({ items });
});

app.post("/api/quiz/answer", auth.required, async (req, res) => {
  const { itemId, mode, given, ms, tzOffset } = req.body || {};
  if (!itemId || !mode) return res.status(400).json({ error: "itemId and mode required" });
  try {
    const out = await quiz.submit(req.user, { itemId, mode, given, ms, tzOffset });
    if (out.error) return res.status(400).json(out);
    const last = db.prepare("SELECT id FROM attempts WHERE user_id=? ORDER BY id DESC LIMIT 1").get(req.user.id);
    res.json({ ...out, attemptId: last ? last.id : null });
  } catch (e) {
    res.status(500).json({ error: "grading failed" });
  }
});

app.post("/api/quiz/override", auth.required, (req, res) => {
  res.json(quiz.override(req.user, Number(req.body && req.body.attemptId)));
});

app.get("/api/quiz/history", auth.required, (req, res) => {
  const rows = db.prepare(
    `SELECT id, item_id, mode, prompt, expected, given, verdict, note, judged_by, created_at
     FROM attempts WHERE user_id=? ORDER BY id DESC LIMIT 100`).all(req.user.id);
  res.json({ attempts: rows });
});

// -------------------------------------------------------------------- stats
app.get("/api/stats", auth.required, (req, res) => {
  res.json(stats.dashboard(req.user, Number(req.query.tz) || 0));
});

app.get("/api/stats/export", auth.required, (req, res) => {
  const out = {
    exportedAt: nowISO(), user: auth.publicUser(req.user),
    days: db.prepare("SELECT * FROM study_days WHERE user_id=? ORDER BY day").all(req.user.id),
    progress: db.prepare("SELECT * FROM progress WHERE user_id=?").all(req.user.id),
    answers: db.prepare("SELECT key, value FROM answers WHERE user_id=?").all(req.user.id),
    checks: db.prepare("SELECT key, on_ FROM checks WHERE user_id=?").all(req.user.id),
    srs: db.prepare("SELECT * FROM srs WHERE user_id=?").all(req.user.id),
    attempts: db.prepare("SELECT * FROM attempts WHERE user_id=? ORDER BY id").all(req.user.id),
    milestones: db.prepare("SELECT * FROM milestones WHERE user_id=?").all(req.user.id),
  };
  res.set("Content-Disposition", `attachment; filename="delhi-hindi-${req.user.id}-${dayFor(0)}.json"`);
  res.json(out);
});

// -------------------------------------------------------------------- admin
app.get("/api/admin/users", auth.required, auth.adminOnly, (_req, res) => {
  res.json({
    users: db.prepare(`SELECT u.id,u.email,u.name,u.is_admin,u.created_at,u.start_date,
        (SELECT COALESCE(SUM(seconds),0) FROM study_days d WHERE d.user_id=u.id) sec,
        (SELECT COUNT(*) FROM attempts a WHERE a.user_id=u.id) attempts
      FROM users u ORDER BY u.id`).all(),
    invites: db.prepare("SELECT * FROM invites ORDER BY created_at DESC LIMIT 50").all(),
    policy: auth.signupPolicy(),
  });
});

app.post("/api/admin/invite", auth.required, auth.adminOnly, (req, res) => {
  const code = crypto.randomBytes(5).toString("hex");
  db.prepare("INSERT INTO invites (code, created_by, created_at) VALUES (?,?,?)")
    .run(code, req.user.id, nowISO());
  res.json({ code });
});

app.get("/api/admin/ai", auth.required, auth.adminOnly, async (_req, res) => {
  res.json(await ai.health());
});

// ------------------------------------------------------------------- static
app.get("/api/health", (_req, res) => res.json({ ok: true, users: auth.userCount(), ai: ai.enabled() }));
app.use(express.static(PUBLIC, { maxAge: "1h", index: "index.html" }));
app.get(/.*/, (_req, res) => res.sendFile(path.join(PUBLIC, "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Delhi Hindi listening on :${PORT}`);
  console.log(`  data dir : ${db.DATA_DIR}`);
  console.log(`  users    : ${auth.userCount()}`);
  console.log(`  AI grader: ${ai.enabled() ? ai.MODEL + " @ " + ai.BASE : "off (rules-only grading)"}`);
  console.log(`  signup   : ${JSON.stringify(auth.signupPolicy())}`);
});
