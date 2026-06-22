# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MathMotion is a Korean middle-school math learning site that teaches concepts through
webtoon-style stories + interactive "Motion" (animation/interaction), avoiding rote
memorization. Mascot is 부등이 (a cute alligator, drawn by an inline `gatorSVG()`).

**No build system, no framework, no package.json.** Every page is hand-written
HTML/CSS/JS with zero bundling. Deployed to GitHub Pages (account `surida`):
https://surida.github.io/MathMotion/ — auto-deploys on `git push origin main`.

## Commands

```bash
# Local dev server (needed for admin magic-link auth / Supabase; file:// works for most else)
python3 -m http.server 8000
#   http://localhost:8000/                    student hub (entry gate)
#   http://localhost:8000/lessons/<id>.html   a lesson
#   http://localhost:8000/admin.html          teacher dashboard

# Deploy = push to main (GitHub Pages rebuilds automatically)
git push origin main

# Verify a deploy is live
curl -s -o /dev/null -w "%{http_code}" https://surida.github.io/MathMotion/lessons/<id>.html
```

There is **no test suite**. Verify changes with these two techniques instead:

```bash
# 1. JS syntax check (lesson inline scripts and js/*.js)
node -e 'new Function(require("fs").readFileSync("js/tracker.js","utf8")); console.log("OK")'
#    for a lesson's inline <script>, extract it then new Function() it.

# 2. Headless render + screenshot, then Read the PNG to verify visuals
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --disable-gpu --hide-scrollbars --screenshot=/tmp/x.png --window-size=900,4200 \
  --virtual-time-budget=3000 "file://$PWD/lessons/<id>.html"
# crop tall shots with: sips -c <h> <w> --cropOffset <y> 0 /tmp/x.png --out /tmp/c.png
```

Math in interactive labs should also be sanity-checked by simulating the logic in
`node -e '...'` before relying on the rendered output.

## Lesson architecture

Each lesson is **one self-contained `lessons/<id>.html`** (inline CSS + JS, only external
deps are Google Fonts and — for tracking — Supabase). They all share a skeleton; copy an
existing lesson (e.g. `quadratic-function.html`) as the template. Shared conventions:

- **CSS design tokens** in `:root` (`--paper`, `--ink`, `--gator`, `--blue`, fonts
  `--display`=Jua, `--hand`=Gaegu, `--body`=Gowun Dodum). `[hidden]{display:none!important}`.
- **`gatorSVG()`** — identical mascot function in every lesson.
- **Structure**: `header` (hero) → Act 1/2 webtoon (`.strip.two` of `.cut.panel` with
  `.scene`/`.bubble`/`.cap`) → Act 3 interactive lab (`.board`) → optional 생활 속 ("왜 배우나")
  section → 마무리 quiz.
- **Scroll reveal**: elements get class `.reveal`; an `IntersectionObserver` adds `.in`.
- **Quiz markup (load-bearing — tracking depends on it)**:
  ```html
  <div class="qopts" data-right="정답 피드백" data-wrong="오개념 설명(=misconception)">
    <button class="qopt" data-correct="true">정답 보기</button>
    <button class="qopt" data-correct="false">오답 보기</button>
  </div>
  ```
- **SVG graphs**: always quote every attribute (`r="6"` not `r=6`). Fixed coordinate scales
  (don't auto-fit per state) so the *change* between states is visible. Clip out-of-range
  points rather than letting them flatten against the viewbox edge.

### The hub (`index.html`)

Data-driven from two objects in its inline script:
- `LESSONS` — concept pool: `{id: {emoji, title, desc, href}}`.
- `CURRICULUM` — `grade → publisher → [{n, name, lessons:[ids]}]`. **The same lesson id is
  reused across publishers** (e.g. a lesson appears under both 동아 and 천재). Landing screen
  picks grade+publisher (stored in `localStorage` `mm-grade`/`mm-pub`) → renders menu.

**To add a lesson**: create `lessons/<id>.html`, add an entry to `LESSONS`, add the id to
the relevant `CURRICULUM` unit(s) for every publisher that should show it, and include the
four tracking `<script>` tags before `</body>` (see below).

## Quiz-tracking system (Supabase)

Records which problems each student answered, how they got it wrong, and how many tries to
correct. Static site + Supabase (Postgres + Auth + RLS + auto REST API), **no custom server**.
Design doc: `docs/plans/2026-06-18-quiz-tracking-design.md`.

- **`supabase/schema.sql`** — run once in the Supabase SQL Editor. Tables `classes` /
  `students` / `attempts`; RLS so a teacher sees only their own class; SECURITY DEFINER RPCs
  `create_class` (teacher), `join_class` / `record_attempt` (anonymous students). Students
  never touch tables directly — only these two RPCs.
- **`js/supabase-config.js`** — Project URL + **anon public key** (safe to commit; RLS is
  the security boundary). Never put the DB password or `service_role` key here.
- **`js/student.js`** (`window.MMStudent`) — shared entry/identity module used by BOTH the
  hub and lessons. Hard entry gate: student enters class code + name → `join_class` →
  cached in `localStorage` `mm-student`. Re-entry shows a "○○ 맞아요?" confirm (shared-device
  safety). Defines the entry UI in ONE place.
- **`js/tracker.js`** — on each lesson: blocks until joined (deep-link enforcement), then
  records every quiz answer via `record_attempt` (best-effort; failures never break the
  quiz). `lesson_id` = filename, `question_id` = order of `.qopts`, `misconception` =
  `data-wrong`. One attempt per option (clicked option disables; correct locks the box).
- **`admin.html`** — teacher dashboard, standalone page with its own magic-link login.
  **Intentionally not linked from student pages and does not load student.js/tracker.js**,
  so students can't reach it. Shows student×question matrix, per-attempt drilldown, and
  misconception aggregates.

Lessons must include, before `</body>`:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="../js/supabase-config.js"></script>
<script src="../js/student.js"></script>
<script src="../js/tracker.js"></script>
```
(The hub uses the same first three with `js/` paths instead of `../js/`.)

Supabase setup gotchas: after running the SQL, set Auth → URL Configuration → Site URL +
Redirect URLs to the deployed `.../admin.html` or magic-link login won't return.

## Conventions

- **Copyright**: `교과서/` (textbook PDFs) and all `*.pdf` are gitignored — never commit them.
- **Workflow**: build → user tests in browser (Cmd+Shift+R hard-refresh) → commit only after
  approval. Korean `feat:`/`docs:` commit subjects.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Lesson copy is Korean; keep the playful 부등이 voice and the "원리로 이해" (understand the
  principle, don't memorize) framing.
