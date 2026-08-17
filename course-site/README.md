# Delhi Hindi — the digital half

Three pieces, each doing the job it's actually good at:

| Piece | What it's for | Where |
|---|---|---|
| **Anki decks** (`Delhi_Hindi_Anki_Decks.apkg`) | All 942 flashcards, spaced repetition automated, on your phone | Anki desktop + AnkiDroid/AnkiMobile |
| **Study site** (`index.html`) | Reading, reference, search — all five books, 146 chapters | Your Unraid server, or just double-click the file |
| **Print pack** (`Print_Pack_Write_On_These.pdf`) | The ~178 pages that need a pencil | Your printer, one binder |

The five original book PDFs still exist and are still the nicest thing to read cover-to-cover. Nothing here replaces them; this is the day-to-day rig.

---

## 1. Anki decks

Double-click `Delhi_Hindi_Anki_Decks.apkg` with Anki installed, or **File → Import**. You'll get one parent deck, `Delhi Hindi`, with six subgroups:

```
Delhi Hindi
├── 01 Script            D01 Vowels & Matras (27) · D02 Consonants (40)
├── 02 Numbers           D03 Numbers 0-100 (101)
├── 03 Phrases           D04 Survival Phrases (61)
├── 04 Vocabulary        D05–D11, D16 — family, food, home, body, clothing, city, time, weather (386)
├── 05 Verbs & Adjectives D12 Core Verbs (120) · D13 Adjectives (80)
└── 06 Glue & Flavor     D14 Little Words (60) · D15 Delhi Slang (37) · D17 Love & Affection (31)
```

**Cards show Devanagari on the front** — read it aloud before flipping, same rule as the paper cards. The back gives romanization, phonetics, meaning, and any usage note.

**Every card is tagged** `deck_D05`, `week04`, `Vocabulary` — so the Master Plan's schedule maps straight onto Anki. To start only what week 4 activates: search `tag:week04`, or just study the subdeck.

**Suggested settings** (Deck options on the parent deck): new cards/day **10**, maximum reviews/day **120**. That matches the Master Plan's daily 10-minute card block. Anki's scheduler replaces the five Leitner boxes described in Book 0 — same idea, better arithmetic.

**Want reverse cards** (English → Hindi, i.e. production practice)? Worth adding around month 3, not before. Tools → Manage Note Types → *Delhi Hindi* → Cards → Options → Add Card Type, then set the front to `{{English}}` and the back to `{{Devanagari}}`. Do it for one deck first and see how it feels.

Re-importing an updated `.apkg` later **updates** existing cards instead of duplicating them — your review history survives.

---

## 2. Study site

`index.html` is completely self-contained: no server required, no internet, no dependencies, no tracking. 1.7 MB, one file.

**Quickest start:** double-click it. Works in any browser, including offline on a plane.

**On Unraid**, so it's on your phone and tablet too:

*Option A — docker compose (easiest):*
```bash
mkdir -p /mnt/user/appdata/hindi
# copy index.html and docker-compose.yml into that folder
cd /mnt/user/appdata/hindi && docker compose up -d
```
Then open `http://<tower-ip>:842`.

*Option B — Unraid UI:* Docker tab → Add Container → Repository `nginx:alpine`, add a Port (container `80` → host `842`), add a Path (container `/usr/share/nginx/html`, host `/mnt/user/appdata/hindi`, read-only). Apply.

*Option C — you already run a web server.* Drop `index.html` into any served folder. It's a static file; nothing else needed.

**Add it to your phone's home screen** (Safari/Chrome → Share → Add to Home Screen) and it opens like an app.

### What the site does

- **Search everything** — press `/` from anywhere. Matches Devanagari, romanization *and* English, so `चाय`, `chaay` and `tea` all find the same places. Results show which chapter and a highlighted snippet.
- **Hide answers** — blurs every answer key so you can work exercises honestly; hover or tap a key to peek at just that one.
- **क A+** — cycles the Devanagari size up (and wraps back around). Useful when you're squinting at a conjunct.
- **Dark mode** — follows your system setting on first load, then remembers your choice.
- **Type into exercises** — the answer lines are real input fields and your answers are saved on that device.
- **Progress checkboxes** — the trackers and milestone lists in Book 0 and Book 1 Ch. 13 tick and stay ticked.
- **Keyboard** — `←` `→` move between chapters, `/` focuses search, `Esc` clears it.
- **Print** — `Ctrl/Cmd+P` on any chapter prints just that chapter, cleanly, without the sidebar.

Saved state (answers, ticks, theme, last chapter) lives in that browser's local storage, per device. It is not synced between your laptop and phone — if you want them in sync, use the same browser profile or just treat the phone as read-only. Clearing site data clears your answers, so don't use the print pack's trackers *and* the site's and expect them to match; pick one.

---

## 3. Print pack

`Print_Pack_Write_On_These.pdf` — 178 pages, in this order:

1. **Trackers** (26-week grid, deck ledger, test log, can-do list, hit list)
2. **Handwriting sheets** — Devanagari trace-and-copy, all letters, matras, and whole words
3. **Pronunciation self-tests** — the 20-sentence Gauntlet, troubleshooting table, monthly milestones
4. **Grammar exercises** — all 96 exercises from Book 2's 24 units
5. **Practice exercises** — comprehension, drills and translations from all 24 lessons
6. **The six monthly tests**
7. **Answer keys** — everything above, in three tight columns at the back

Print double-sided, drop it in one binder. If you want to trim further, sections 4–5 are the bulk (~120 pages) and you could print them a month at a time; section 7 is optional since every key is on the site behind the **Hide answers** toggle.

---

## If you want audio later

You skipped this for now, and the course works without it. If you change your mind, the highest-value version isn't text-to-speech — it's ~150 short recordings from your partner (the Gauntlet sentences, the minimal-pair sets, one line per dialogue). Authentic Delhi accent, about 30 minutes of their time, and Anki plays audio on cards natively. Ask me for the recording script when you're ready.
