"use strict";
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "var");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "hindi.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  pass_hash     TEXT NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  start_date    TEXT NOT NULL,             -- day 1 of their 26-week plan
  daily_goal    INTEGER NOT NULL DEFAULT 20,   -- minutes
  settings      TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- free-text answers typed into chapter exercise lines
CREATE TABLE IF NOT EXISTS answers (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  value     TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- tracker / milestone checkboxes
CREATE TABLE IF NOT EXISTS checks (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key      TEXT NOT NULL,
  on_      INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- per-chapter reading progress
CREATE TABLE IF NOT EXISTS progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id   TEXT NOT NULL,
  seconds      INTEGER NOT NULL DEFAULT 0,
  opened_at    TEXT,
  completed_at TEXT,
  PRIMARY KEY (user_id, chapter_id)
);

-- one row per user per day: the spine of the momentum tracker
CREATE TABLE IF NOT EXISTS study_days (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day       TEXT NOT NULL,              -- YYYY-MM-DD in the user's local zone
  seconds   INTEGER NOT NULL DEFAULT 0,
  reviewed  INTEGER NOT NULL DEFAULT 0, -- quiz items answered
  correct   INTEGER NOT NULL DEFAULT 0,
  chapters  INTEGER NOT NULL DEFAULT 0, -- chapters completed that day
  PRIMARY KEY (user_id, day)
);

-- every quiz answer, kept for the review screen and accuracy trends
CREATE TABLE IF NOT EXISTS attempts (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL,
  mode       TEXT NOT NULL,             -- recognise | produce | script | listen | sentence
  prompt     TEXT NOT NULL,
  expected   TEXT NOT NULL,
  given      TEXT NOT NULL,
  verdict    TEXT NOT NULL,             -- perfect | close | wrong
  score      REAL NOT NULL,
  ms         INTEGER NOT NULL DEFAULT 0,
  judged_by  TEXT NOT NULL DEFAULT 'rules',  -- rules | ai | override
  note       TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_user_time ON attempts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attempts_item ON attempts(user_id, item_id);

-- spaced repetition state, one row per (user, item, mode)
CREATE TABLE IF NOT EXISTS srs (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id   TEXT NOT NULL,
  mode      TEXT NOT NULL,
  box       INTEGER NOT NULL DEFAULT 0,
  ease      REAL NOT NULL DEFAULT 2.5,
  interval  INTEGER NOT NULL DEFAULT 0,  -- days
  due       TEXT NOT NULL,               -- YYYY-MM-DD
  streak    INTEGER NOT NULL DEFAULT 0,
  lapses    INTEGER NOT NULL DEFAULT 0,
  seen      INTEGER NOT NULL DEFAULT 0,
  last_at   TEXT,
  PRIMARY KEY (user_id, item_id, mode)
);
CREATE INDEX IF NOT EXISTS idx_srs_due ON srs(user_id, due);

-- unlocked milestones (badges tied to real course moments)
CREATE TABLE IF NOT EXISTS milestones (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code     TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  PRIMARY KEY (user_id, code)
);

-- signup invite codes (when OPEN_SIGNUP is off)
CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  used_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at    TEXT
);

CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`);

module.exports = db;
module.exports.DATA_DIR = DATA_DIR;
