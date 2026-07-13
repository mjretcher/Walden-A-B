# Optionals Assignments, Staff Off Periods, and Rosters "Who's Left" — Spec

Three features requested together: a hand-curated Optionals Assignment
report, a dedicated Staff Off Periods report, and an outage-aware "who's
left in class" lens on Rosters. Documented together since they shipped in
one pass, but they're independent features that don't depend on each other.

## 1. Optionals Assignments (`/reports/optionals-assignments`)

**What it is:** A hand-curated, per-period list of which activities are
open as "optionals" (walk-in choice periods) each day, plus who (if
anyone) is running them. Built by Mike or an Area Head — never derived
from live ActivityOffering/Menu data, the same deliberate choice
Registration Assignments made for the same reason: what's actually open
as an optional on a given day is a judgment call, not something the
schedule already encodes.

**Data model:** `OptionalsAssignmentReport` + `OptionalsAssignmentRow`
(new tables). Every row is free-typed — there's no fixed slot template
like Registration Assignments' fixed area sections, since which
activities are optionals-eligible changes week to week. Rows key on
`Period` (camper class periods only — P1–P4 each day, Twilight excluded)
rather than an area name, so the sheet lays out one section per period.

**Editing access:** Exec Admin **and** Area Head (unlike Registration
Assignments, which is Exec Admin only) — Mike specifically said "me or
one of our programming staff," and Area Head is the programming-staff
role in this app.

**Print:** Two pages (A Day, B Day), each a grid of period sections in
the same bordered/doodle-font visual language as Registration
Assignments, per Mike's "look similar to the registration assignment"
request. Each period section shows its activities with an optional
staff name; empty periods print "No optionals scheduled." Slot times
are pulled in from Admin → Period Times for a bit of extra context on
the sheet.

**Assumption flagged:** the "assignment" in the name is treated as
optional per row — a row can be just an activity name with no staff
attached. If Mike wants staff required, that's a small follow-up change.

## 2. Staff Off Periods (`/reports/staff-off-periods`)

**What it is:** A focused lens onto the *existing* `StaffOffPeriod` data
(already captured whenever someone is marked "Off Period" on the Scream
Session board) — this doesn't introduce a new way to mark someone off,
it reuses the exact same `/api/staff-assignments` endpoint Scream
Session already writes to (`{ offPeriod: true }` to set, `DELETE` to
clear). What's new is a screen built specifically to answer "who's off
which period" without scrolling the full staffing grid.

**Two view modes, toggled client-side (no page reload):**
- **By period** — A Day / B Day sections, each period listing who's off
  as removable chips, plus a quick "mark someone off" control for any
  staff member who's currently open (unassigned, not already off) that
  period.
- **By staff** — a staff × period grid. OFF cells are clickable to
  clear; blank (unassigned) cells are clickable to mark off; cells that
  already carry a real Scream Session assignment are shown read-only —
  clearing a live assignment stays a Scream Session action, not
  something this screen's quick-toggle should casually undo.

**Editing access:** Exec Admin only (view is open to Exec Admin, Area
Head, and Counselor) — matches the existing `/api/staff-assignments`
guard, which already 403s anyone else.

**Print:** Both views print regardless of which tab is selected on
screen (a posted sheet is more useful showing both the per-period list
and the per-staff grid than whichever tab happened to be active),
landscape, two content pages plus the staff-grid page.

## 3. Rosters — "Who's Left" (enhancement to `/rosters`)

**What it is:** Cross-references each roster's real registrations
against **actual logged Outages** (trips, infirmary, off-camp, sick,
vacation-away — not a hypothetical, unlike Trip Planner's whole-unit
subtraction) for a selected day, so a roster shows who's actually still
around vs. away on the trip.

**New controls in the filter bar:**
- **Outage day** (date picker, defaults to today/Detroit) — which day's
  outages count against these rosters. Lets Mike preview a known
  upcoming trip day ahead of time, not just today.
- **Hide campers who are out** (off by default) — when on, the printed
  roster drops out-campers entirely for a clean "who's left" list, still
  budgeting row/page-fit math off the *filtered* count. When off (the
  default), out campers stay on the roster but print struck-through with
  a small red "Out" tag, and a red badge on the card header reads
  "N out — <reason/trip title> → M left."

**Deliberately scoped out:** Teaching Assistants aren't cross-referenced
against outages (Mike's ask was specifically about campers); an outage
covering only certain periods (not the whole day) only pulls campers out
of *those* periods' rosters, using the same period-coverage rule Right
Now already uses for its own outage lens.

**Assumption flagged:** default is "annotate, don't hide" so a Rosters
page nobody has touched looks exactly like it always has the moment this
ships; Mike can flip "Hide campers who are out" per-print whenever he
wants the subtracted list for a specific trip day.

**Isolation from Right Now:** the period-coverage helper is a fresh copy
in `lib/outage-coverage.ts`, not a shared import from Right Now's
existing local copy — Right Now is safety-critical and changes there
should stay conservative and isolated from unrelated feature work.

## Not touched

- Trip Planner (hypothetical unit-level planning) — unchanged.
- Right Now — unchanged, including its own local outage-coverage logic.
- Scream Session board / `/api/staff-assignments` — unchanged; both new
  features that touch off-periods reuse it as-is.
