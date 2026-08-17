"use strict";
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("./db");

const DAY = 86400000;
const SESSION_DAYS = 90;
const OPEN_SIGNUP = String(process.env.OPEN_SIGNUP || "true").toLowerCase() !== "false";
const INVITE_REQUIRED = String(process.env.INVITE_REQUIRED || "false").toLowerCase() === "true";

const nowISO = () => new Date().toISOString();
const today = (tzOffsetMin = 0) =>
  new Date(Date.now() - tzOffsetMin * 60000).toISOString().slice(0, 10);

function userCount() {
  return db.prepare("SELECT COUNT(*) n FROM users").get().n;
}

function createUser({ email, name, password, isAdmin = false, startDate }) {
  const hash = bcrypt.hashSync(password, 11);
  const info = db.prepare(
    `INSERT INTO users (email, name, pass_hash, is_admin, created_at, start_date)
     VALUES (?,?,?,?,?,?)`
  ).run(email.toLowerCase().trim(), name.trim(), hash, isAdmin ? 1 : 0, nowISO(),
        startDate || today());
  return getUser(info.lastInsertRowid);
}

function getUser(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function byEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(String(email || "").toLowerCase().trim());
}

function verify(user, password) {
  return !!user && bcrypt.compareSync(password, user.pass_hash);
}

function startSession(userId, userAgent) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)"
  ).run(token, userId, nowISO(), new Date(Date.now() + SESSION_DAYS * DAY).toISOString(),
        String(userAgent || "").slice(0, 200));
  return token;
}

function endSession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function sessionUser(token) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`
  ).get(token, nowISO());
  return row || null;
}

/** Express middleware: attaches req.user (or null). */
function attach(req, _res, next) {
  req.user = sessionUser(req.cookies && req.cookies.dh_session);
  next();
}

/** Express middleware: 401 unless logged in. */
function required(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "not signed in" });
  next();
}

function adminOnly(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ error: "admins only" });
  next();
}

function cookieOpts(req) {
  return {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_DAYS * DAY,
    path: "/",
    // Only mark Secure when the request actually arrived over TLS, otherwise the
    // cookie silently vanishes on a plain-HTTP LAN setup (the common Unraid case).
    secure: req.secure || req.get("x-forwarded-proto") === "https",
  };
}

function publicUser(u) {
  if (!u) return null;
  let settings = {};
  try { settings = JSON.parse(u.settings || "{}"); } catch { /* ignore */ }
  return {
    id: u.id, email: u.email, name: u.name, isAdmin: !!u.is_admin,
    startDate: u.start_date, dailyGoal: u.daily_goal, settings,
    createdAt: u.created_at,
  };
}

/** Is signup allowed right now, and does it need an invite code? */
function signupPolicy() {
  const first = userCount() === 0;
  return {
    first,
    allowed: first || OPEN_SIGNUP || INVITE_REQUIRED,
    inviteRequired: !first && INVITE_REQUIRED,
    openSignup: OPEN_SIGNUP,
  };
}

function consumeInvite(code, userId) {
  const row = db.prepare("SELECT * FROM invites WHERE code = ? AND used_by IS NULL").get(code);
  if (!row) return false;
  db.prepare("UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?").run(userId, nowISO(), code);
  return true;
}

module.exports = {
  createUser, getUser, byEmail, verify, startSession, endSession, sessionUser,
  attach, required, adminOnly, cookieOpts, publicUser, userCount, signupPolicy,
  consumeInvite, today, nowISO, OPEN_SIGNUP, INVITE_REQUIRED,
};
