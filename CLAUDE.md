# CLAUDE.md — Skill Sprouts landing site

Static site served from GitHub Pages (`CNAME` → skillsprouts.co). No build step: edit the HTML/CSS/JS and push.

The app repo is a sibling: `../skill_sprouts_project`. Read its root `CLAUDE.md` before changing anything about what the product *is* — this site sells it, and the two drift apart silently.

## What the product is (post-pivot, August 2026)

Three things, and nothing else:

- **Plans** — teaching a child a skill they don't have yet, broken into an ordered ladder of steps, one 3–5 minute activity a day, adapting to how yesterday went.
- **Guides** — short reads on a hard parenting problem.
- **Book summaries** — the parenting canon in about twelve minutes.

Plus a journal.

**Gone, and must not appear in copy:** daily habits / goal tracking, situation kits, challenges, Build with AI, micro-courses, and **streaks**. The app has no streak, no daily completion percentage and nothing that counts down. Copy that promises a streak promises something the parent won't find.

## Files

| File | What it is |
|---|---|
| `index.html` | The marketing page. Hero, empathy note, six plan cards, how-it-works, journal, testimonials, pricing, FAQ. |
| `landing.css` | Styles for `index.html`. |
| `welcome/index.html` | The quiz shell — every screen's markup, including the paywall. |
| `welcome/quiz.js` | The quiz logic, data (`AREAS`, `AGE_BRACKETS`, `OUTCOMES`, `FEATURES`) and the results screen. |
| `welcome/quiz.css` | Quiz styles. |
| `funnel.js` | First-party funnel tracking. Posts to the app's API, not an analytics vendor. |
| `thank_you.html`, `checkout/success.html`, `billing/`, `auth/`, `app/` | Post-purchase and handoff pages. |

## Three things that must stay in lockstep

Breaking any of these fails **silently** — no error, just a worse funnel.

### 1. The six areas

`AREAS` in `welcome/quiz.js` ⇄ `kOnboardingAreas` in `flutter_app/lib/screens/onboarding_shared.dart` ⇄ `VALID_FOCUS_AREAS` in `python_backend/api/routes/web_onboarding_focus.py`.

The ids are `tantrums`, `transitions`, `potty`, `sleep`, `independence`, `school`. The quiz parks the picked id against the visitor's identity; the app reads it back and pre-selects that area. **The app ignores an id it doesn't recognise**, so a mismatch just loses the pick.

`eating` was retired in the pivot — there is no plan for picky eating, and an area that names no plan can't make the funnel's promise. The backend still *accepts* `eating` so a cached older `funnel.js` doesn't 400 on the way in, and `pruneRetiredAreas()` in `quiz.js` drops it from any saved localStorage state so a returning visitor re-picks instead of hitting an undefined area on the results screen.

### 2. The plan labels

Every `AREAS[id].plan` must be a real `plan.label` in `../skill_sprouts_project/courses_repo/plans/`. The results screen fetches `/public/plans/{label}` to show the real ladder; a bad label silently falls back to the hardcoded `steps` array, so the preview stops matching what the app actually starts.

The `jrn_` prefix is historical — plans were "learning journeys" before the pivot, and the label is the join key for every row of user progress.

### 3. The funnel version

`FUNNEL_VERSION` in `funnel.js` must match a key of `FUNNEL_VERSIONS` in `python_backend/api/routes/funnel.py`. Currently **3**.

Bump when steps are added, removed or reordered — **not** for copy or styling, which is exactly what you want to compare within a version. v3 is the pivot funnel: same step sequence as v2, but `q_areas` now names a plan the child will learn rather than a goal area, so v2 and v3 answer sets are not comparable and must not be folded together in a report.

## Copy notes

- The quiz's `FEATURES` list is what the results screen sells. It ships to everyone and is shown in a fixed order — only list things the app actually has.
- The results screen renders the marketing `steps` fallback instantly, then swaps in the real ladder from the API. Keep the fallback honest: it's what a visitor sees on a slow connection.
- The pricing bullets on `index.html` and the paywall bullets in `welcome/index.html` are separate lists. Change both.
