# Hindi Lessons — Jacob's Hindi study system

One repo, two tracks, one app:

- **My Lessons** — the real curriculum. Every Preply class gets transcribed from notebook
  photos into `content/lessons/*.json`, and the app turns it into flashcards, typed drills,
  and sentence translations. This is the daily material. When the teacher and the course
  disagree, the teacher wins.
- **The Delhi Hindi course** — the reference library. A full six-month self-built course
  (146 chapters, 942 cards, 925 sentences) lives in the app's Read tab for deep dives when
  the teacher introduces a topic. The printable PDFs and Anki decks are in `materials/`,
  and the original single-file course site is in `course-site/`.

The app itself: multi-user accounts, spaced repetition, a forgiving typed-answer grader,
Devanagari live-transliteration, streaks, heatmap, milestones — self-hosted in one
container with one SQLite file.

---

## The loop: after every class

1. Photo the notebook pages and drop them in the **Hindi Learning** Claude project
   ("new lesson").
2. Claude transcribes them, updates the study-guide artifact, and produces the next
   `content/lessons/NN-topic.json` (stable ids, one spelling per word, unconfirmed
   sentences flagged `"confirmed": false`).
3. Add that file to this repo — GitHub → **Add file → Upload files** works from any
   device, or commit locally.
4. Push to `main`. The Action runs the test suite (including lesson-file validation),
   builds the image, and publishes `ghcr.io/aceospades95/hindi-lessons:latest`.
5. Update the container on Unraid. The new lesson appears in **My Lessons**, its words
   join the drills, and its open questions join the "Bring to your teacher" list.

Lesson-file rules (enforced by `server/lessons.test.js`):

- card ids `T05-001…`, sentence ids `sT05-01…` — **never renumber existing ids**, or
  review history detaches
- one canonical romanization per word (alternates go in `note`)
- sentences the teacher hasn't confirmed carry `"confirmed": false` — they render as
  challenges and stay out of graded drills

---

## What's in the app

**My Lessons** — lesson-by-lesson: the day's pattern, grammar grids, every word and
sentence from class, watch-outs, and an aggregated "Bring to your teacher" list. Each
lesson has a *Drill this lesson* button; Practice also has a "My Lessons" scope so the
whole tutor track can be drilled with spaced repetition.

**Read** — all 146 chapters of the five course books, full-text searchable across
Devanagari, romanization and English.

**Practice** — five drill types: Read it (Hindi → meaning), Say it (English → roman),
Write it (English → Devanagari, typed in roman and transliterated live), Translate, and
Into Hindi. Due reviews come first; new material unlocks by course week (tutor material
is never locked).

**Progress** — current and longest streak (one missed day per week is forgiven), a
26-week heatmap, minutes against a daily goal, accuracy trend, strongest/shakiest words,
and milestones.

**Accounts** — local email + password, bcrypt hashed. First account is admin. Signups
can be open, closed, or invite-gated.

## Grading: the forgiving part

Typed answers get three verdicts: **perfect**, **close** (accepted, with a note), and
**wrong** — and close counts as correct. Silently forgiven: spaces, punctuation, case,
articles, any of a gloss's alternatives, romanization wobble (`kitab`/`kitaab`,
`hoon`/`hoo(n)`), and typos scaled by word length. Coached but accepted: flattening a
retroflex capital. Still wrong: a different word, a dropped aspiration, a flipped
negation. Every non-perfect answer shows a character diff, and there's an
**"I was right — count it"** override.

Optionally, set `AI_BASE_URL` + `AI_MODEL` (any OpenAI-compatible endpoint — Ollama,
LM Studio, vLLM…) and sentence answers the rules rejected get a second look from your
own model, judged on meaning. It can only upgrade a verdict; if the endpoint is down,
rules stand. See `.env.example`.

---

## Running it on Unraid

1. **This repo builds the image automatically.** Every push to `main` runs
   `.github/workflows/docker-publish.yml`: tests, then build + push to
   `ghcr.io/aceospades95/hindi-lessons:latest` using the built-in `GITHUB_TOKEN`.

   If the repo is private, the package is too — run `docker login ghcr.io` once on
   Unraid with a PAT that has `read:packages`.

2. **Add the container.** Drop `unraid-template.xml` into
   `/boot/config/plugins/dockerMan/templates-user/`, then Docker tab → Add Container →
   pick **hindi-lessons**. Or by hand:

   | Field | Value |
   |---|---|
   | Repository | `ghcr.io/aceospades95/hindi-lessons:latest` |
   | Port | container `8080` → host `8377` |
   | Path | container `/data` → host `/mnt/user/appdata/hindi-lessons` (rw) |
   | Variable | `TZ` = `America/Chicago` |
   | Variable | `OPEN_SIGNUP` = `true` → flip to `false` after signup |

3. Open `http://<tower-ip>:8377`, create the first account (becomes admin), add it to
   your phone's home screen, and put it behind the reverse proxy whenever ready — the
   session cookie turns `Secure` automatically behind HTTPS. Don't expose it raw to the
   internet: no 2FA, no email verification.

Local dev: `npm install && npm start` → http://localhost:8080 · `npm test` runs the
grader suite + lesson validation. Or `docker compose up -d --build`.

**Backups:** everything is `/data/hindi.db` (+WAL). Copy that folder, done.

---

## Layout

```
server/            express app · db · auth · grade.js (the forgiving grader) · quiz · srs · stats
  lessons.js       loads content/lessons/*.json into decks + drills + the My Lessons API
  lessons.test.js  validates every lesson file (ids, schema, drillability)
public/            the SPA (index.html, app.js, app.css, translit.js)
data/              course content: content.json · cards.json · sentences.json
content/lessons/   ★ the tutor track — one JSON per real class, grows every week
materials/         printable PDFs + Anki deck from the course build
course-site/       the original 240-page single-file course site (standalone)
Dockerfile · docker-compose.yml · unraid-template.xml · .github/workflows/
```

MIT licensed. Built for one learner and his Delhi partner; help yourself.
