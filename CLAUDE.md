# CLAUDE.md — standing working agreement

> Provenance: the Cowork-built CLAUDE.md was not inside Hindi-Lessons.zip, so this
> file was reconstructed at import time (2026-08-17) from the owner's written
> workflow instructions and the conventions enforced by `server/lessons.test.js`.
> If the Cowork original turns up, replace this file with it.

## What this repo is

Jacob's self-hosted Hindi study system: an Express + SQLite app (`server/`,
`public/`) serving two tracks — the **My Lessons** tutor track in
`content/lessons/*.json` (one file per real Preply class) and the prebuilt
**Delhi Hindi course** library in `data/`. Every push to `main` runs
`.github/workflows/docker-publish.yml`: `npm test`, then build + publish of
`ghcr.io/aceospades95/hindi-lessons:latest`, which the Unraid box pulls.

## The "new lesson" workflow

Triggered when the owner says **"new lesson"** and attaches notebook photos.

1. **Wait for all pages.** Photos may arrive split across several messages —
   don't start until the owner confirms that's all of them.
2. **Transcribe faithfully.** Where the teacher's version disagrees with the
   course/reference material, the teacher wins.
3. **Write the next lesson file** — `content/lessons/NN-topic.json`: next
   two-digit filename prefix, `"code": "TNN"` to match, next integer `seq`.
   Files load sorted by filename. Follow the structure of the existing files
   (01–04 are the models): `pattern`, `grids`, `vocab`, `sentences`,
   `watch_out`, `ask_next_time`.
4. **Fresh ids only** — card ids `TNN-001…`, sentence ids `sTNN-01…`.
5. **One canonical romanization per word**; variants the teacher also used go
   in `note`.
6. **Flag the unconfirmed.** Sentences the teacher hasn't confirmed get
   `"confirmed": false` — they render as challenges and stay out of graded
   drills. Open questions go in `ask_next_time`. Uncertain readings of the
   handwriting get flagged to the owner in chat, never silently guessed.
7. **`npm test`** — the grader suite and lesson validation must pass.
8. **Commit and push to `main`**, then confirm the Action goes green so the
   new image actually reaches GHCR.

## Id stability — the rule that protects review history

Spaced-repetition state lives in SQLite keyed `(user_id, item_id, mode)`
(`server/srs.js`, `server/db.js`). Ids are the only link between a learner's
review history and the content:

- **Never renumber, reuse, or delete existing ids in `content/lessons/`.**
  Appending new material with fresh ids is the only safe change.
- The same applies to the course ids in `data/cards.json` and
  `data/sentences.json`.
- Fixing a typo in `en` / `rom` / `dev` / `note` on an existing id is fine —
  the id keeps the history attached.

`server/lessons.test.js` enforces: id shape, id prefix matches the lesson
`code`, global uniqueness, `en` + `rom` present, boolean `confirmed`, every
confirmed item drillable in its modes, and unconfirmed sentences kept out of
the graded pool.

## Commands

- `npm install` · `npm test` · `npm start` → http://localhost:8080
- Docker: `docker compose up -d --build` → host port 8377
