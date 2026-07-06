# Bunk Management — Full Feature Specification

**Status:** All open decisions resolved (Section 14) — ready for implementation. Section 12 is a separately parked/deferred idea and is not a prerequisite.
**Scope:** A new top-level section covering camper cabin assignment (inherited ~95%+ from the CampMinder import), staff and CA-in-cabin assignment, cabin/unit/bed administration, and print reporting that matches the existing paper "[Boys/Girls] Unit N Q# YYYY" sheets exactly.
**Supersedes:** `/admin/import/q1-cabins` and `/admin/import/q2-cabins` (hand-coded, one-off import scripts rebuilt from scratch every quarter) and folds `/admin/staff/cabins` into itself for cabin-based staff housing. See Section 11.
**Explicitly rejected:** a parallel-run / diff-export mode. Bunk Management replaces the spreadsheet outright once it ships; no dual-tracking tooling will be built.

Every claim below about the current codebase was verified directly against `app_files/prisma/schema.prisma` and the relevant route files, not assumed — file paths are cited throughout so anything here can be checked against the actual repo.

---

## 1. Why this document is grounded in existing code first

Before this section was written, the following were read in full: `prisma/schema.prisma`, `app/admin/cabins/{page,client,actions}.tsx`, `app/admin/staff/cabins/page.tsx`, `app/admin/import/q1-cabins/actions.ts`, `app/admin/import/q2-cabins/actions.ts`, `data/q1-assignments.json`, `data/q2-assignments.json`, `lib/real-data-import.ts`, `lib/auth.ts`, and every route the existing `revalidateCabinConsumers()` helper touches. Two things turned up that materially change this spec from what a first pass (based on the mockups alone) would have assumed:

1. **CAs are Campers, not Staff.** `Camper.counselorAssistant` is the correct, current, intentional model for a Counselor Assistant — confirmed by a code comment in `q2-cabins/actions.ts`: *"CAs used to be routed through the staff pipeline (matching Q1's own precedent) until this was corrected — registration eligibility runs entirely on `Camper.counselorAssistant`."* Q1's import script actually created stray `Staff` rows for CAs, which was a bug; Q2's script fixed it, and `lib/ca-staff-exclusion.ts` plus `deleteStaleCaStaffRecords()` exist specifically to find and clean up the leftover bad data from that bug. **Bunk Management must follow the Q2 pattern, not the Q1 pattern.**
2. **There is no field anywhere, in either the schema or the two import scripts, that persists the "(UP)" / "(UH)" designation.** Both scripts parse a `roles: string[]` array (values seen in the data: `CA`, `UP`, `UH`) out of the source sheet purely to *display* it during the diff-preview step. Neither `applyQ1Diff` nor `applyQ2Diff` ever writes it to the database — it's discarded the moment the import is applied. This needs a real field (Section 4.2).

---

## 2. Goals / non-goals

**Goals**
- One reusable, session-agnostic way to bring in a CampMinder cabin report each quarter (Q1/Q2/Q3, boys and girls), replacing the pattern of writing a new `qN-cabins` folder from scratch every time.
- A staff (and, secondarily, CA) assignment board that's the main day-to-day surface — drag a person onto a cabin, done, no spreadsheet, no retyping.
- Real-time, exec-admin-only editing of cabin bed counts and which unit a cabin belongs to.
- A print/export view that matches the existing "Q1 Boys Cabins"-style sheets closely enough that nobody has to be retrained to read it.
- Becomes the single source of truth for cabin data everywhere else in the app, with zero changes required to the pages that already read `Camper.cabinId` / `Staff.cabinId` / `Cabin` (see Section 11 — this is mostly already true today).

**Non-goals (explicitly, per direct instruction)**
- No parallel-run mode, no CSV diff-export for spreadsheet comparison.
- No self-service staff preference submission UI — preferences are a ranked survey collected on paper and entered by an admin (Section 7.3).
- No change to how CAs are modeled (they stay Campers) and no reversal of the Q1→Q2 CA fix.
- Not rebuilding `/admin/staff/cabins`' "custom staff housing" concept (Nurse Cabin, Staff House, etc.) — that's out of scope for cabin/bunk assignment and is called out in Section 11 as something to leave alone or fold in later, not now.

---

## 3. Data model changes

### 3.1 `Cabin` — add bed capacity

```prisma
model Cabin {
  ...
  beds      Int      @default(0)   // NEW — physical bed count, edited in real time by exec admins
  ...
}
```

No cascade logic needed beyond what already exists in `updateCabin()` (`app/admin/cabins/actions.ts`) — `beds` is just one more field on the same update form. `Cabin.unit` and `Cabin.gender` stay exactly as they are; Bunk Management's cabin editor should call into the *same* `updateCabin` / `createCabin` actions rather than duplicating that cascade logic (unit change → `Camper.unit` cascade, name change → `CamperWeekEnrollment.cabinName` snapshot update — both already correct, don't reimplement them).

### 3.2 New model — `CabinStaffAssignment` (staff-to-cabin, scoped per session)

**Why this is new and not just a bigger `Staff.cabinId`:** `Staff` has no `sessionId` field at all — staff rows persist across the whole summer, unlike `Camper` rows which are recreated per session (confirmed by the Q2 import's entire "copy forward from another session" logic). `Staff.cabinId` today is a single scalar. If Bunk Management writes a counselor's Q2 cabin into that same field, the Q1 assignment is gone — there's no way to reprint "Boys Unit 1 Q1 2026" correctly once Q2 starts. A session-scoped join table is required for the print/report system to keep working across quarters, and it's also the natural place to enforce "never double-booked" as a real database constraint instead of just a UI convention.

```prisma
enum CabinStaffRole {
  COUNSELOR
  UNIT_PROGRAMMER
  UNIT_HEAD
}

model CabinStaffAssignment {
  id              String         @id @default(cuid())
  staffId         String
  cabinId         String
  sessionId       String
  role            CabinStaffRole @default(COUNSELOR)
  createdByUserId String?

  staff     Staff    @relation(fields: [staffId], references: [id], onDelete: Cascade)
  cabin     Cabin    @relation(fields: [cabinId], references: [id], onDelete: Cascade)
  session   Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  createdBy User?    @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([staffId, sessionId])   // hard DB-level guarantee: one cabin per staff member per session
  @@index([cabinId, sessionId])
}
```

The `@@unique([staffId, sessionId])` constraint is what makes "counselors will never be double-booked" (your words) a fact the database enforces, not just something the drag-and-drop UI happens to prevent. Dragging a staff member already assigned elsewhere this session should be rejected server-side even if some future client bypasses the UI.

`CabinStaffRole` covers exactly the three tags actually seen in the source data (plain counselor, `UP`, `UH`) — displayed as a plain label next to the name, per your last message, nothing more elaborate.

### 3.3 New model — `StaffUnitPreference` (the ranked survey)

No existing field covers this at all (confirmed — zero hits for "preference" anywhere in the schema or codebase).

```prisma
model StaffUnitPreference {
  id      String @id @default(cuid())
  staffId String
  unit    Unit
  rank    Int    // 1 = first choice

  staff Staff @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@unique([staffId, unit])
  @@index([staffId, rank])
}
```

Entered by an exec admin transcribing the paper survey (Section 7.3) — not a staff-facing form.

### 3.4 CA representation — no schema change

`Camper.counselorAssistant` already does the job. Bunk Management's cabin view reads campers where `counselorAssistant: true` within a cabin and renders them on the "(CA)" line, the same flag registration eligibility already reads. **Do not** create `Staff` rows for CAs under any circumstances — that's the exact bug Q2 fixed.

**Confirmed hybrid behavior:** CAs live in a middle ground — assignable to a cabin (`Camper.cabinId` set) only for the quarters where that CA is actually bunking with a unit, not every quarter. Because `Camper` rows are already per-session, this needs no new flag: a CA's record for a given session simply has `cabinId` set when they're bunking that quarter and left `null` when they aren't. They also do **not** get a `StaffUnitPreference` row — preference ranking is a `Staff`-only concept and CAs are never `Staff`, so the board should never surface a preference prompt or ranking control for a CA.

### 3.5 `User` — Side Head visibility

**Definition, since it's easy to lose track of amid all the other roles:** "Side Head" means the two people at the very top of the camp-side hierarchy you described — the **Girls Side Head** and the **Boys Side Head** — each overseeing their entire gender side of camp, above the Unit Heads (who oversee Unit Programmers, who are tagged per-cabin via `CabinStaffRole`). Side Heads aren't tied to any one unit or cabin ("live out of cabin") and need to see the full roster for their whole gender side — same as the paper "Q1 Boys Cabins" sheet in full — not a single unit's slice of it.

No existing mechanism fits this. `AREA_HEAD` is scoped by `User.areaId → Area`, and `Area` means an activity department (Waterfront, Sports, etc.) — a different axis entirely from "which camp side." Confirmed approach:

```prisma
model User {
  ...
  bunkManagementView Gender?   // NEW — null = no access; MALE = full boys-side read access; FEMALE = full girls-side read access
  ...
}
```

Set manually by an exec admin on the two Side Head accounts. Confirmed: Side Heads get **zero** `CabinStaffAssignment` rows — this field is a pure read permission, not a cabin tie, matching "live out of cabin." No new `UserRole` or `CabinStaffRole` value is needed for Side Head; it's entirely this one nullable field.

---

## 4. Access control

| Who | Access |
|---|---|
| `EXECUTIVE_ADMIN` | Full read/write on everything in Bunk Management: assignment board, cabin/unit/bed admin, import, print. |
| User with `bunkManagementView` set (Side Heads) | Read-only. Full camp for their gender — every unit, not scoped to one — matching what the "Q1 Boys Cabins" sheet already shows in full. No edit access anywhere in the section. |
| `AREA_HEAD` (department heads — Waterfront, Sports, etc.) | No access, per your explicit instruction ("no area heads etc"). |
| `COUNSELOR` | No access. |

Every Bunk Management server action and page starts with `requireUser([UserRole.EXECUTIVE_ADMIN])`, same pattern as `/admin/cabins` today. Read-only routes additionally accept a request from a user whose `bunkManagementView` matches the requested gender.

---

## 5. Routes

```
/bunk-management                                  → Hub: pick session (quarter) + gender, links to the three tools below
/bunk-management/board?sessionId=&gender=          → Staff/CA assignment board (Section 7)
/bunk-management/cabins?sessionId=&gender=         → Cabin/unit/bed admin (Section 8) — thin wrapper around existing /admin/cabins actions
/bunk-management/staff-housing                     → Non-cabin staff housing (Section 8.1) — carried over from /admin/staff/cabins, kept separate from the board/reports
/bunk-management/import?sessionId=&gender=         → Generalized CampMinder import (Section 9)
/bunk-management/print?sessionId=&gender=          → Print/export view (Section 10) — this is what Side Heads see
/api/bunk-management/assign                        → POST { staffId, cabinId, sessionId, role } — server-enforced no-double-booking via the unique constraint
/api/bunk-management/unassign                      → POST { staffId, sessionId }
```

`sessionId` and `gender` are independent query params — a `Session` row (e.g. "Q1 2026") is never gender-specific in the current schema (confirmed: no `gender` field on `Session`); boys and girls are two different `Cabin.gender` values within the same session, matching how the two source files (`Q1_Boys_Cabins`, presumably a `Q1_Girls_Cabins`) are actually organized today.

---

## 6. Existing infrastructure this reuses (not rebuilds)

- `updateCabin` / `createCabin` (`app/admin/cabins/actions.ts`) — Bunk Management's cabin editor calls these directly, extended only with the new `beds` field. Their existing cascades (rename → `CamperWeekEnrollment.cabinName`, unit change → `Camper.unit`) are correct today and stay untouched.
- `revalidateCabinConsumers()` — the same 12-path revalidation list already covers everywhere cabin data surfaces app-wide. Bunk Management's own mutations should revalidate the same list, plus the new `/bunk-management/*` routes.
- `CamperSessionDesignation` / `CamperWeekEnrollment` — the "1st Sess" / "7 Weeks" / "2 Weeks" column in the paper doc is already backed by existing structures (session designations and week-block enrollments). Bunk Management reads and displays these; it does not need a new model for that column.
- `lib/ca-staff-exclusion.ts` — already exists to filter stray CA-as-staff records out of Scream Session; Bunk Management doesn't need to re-solve this, just needs to never reintroduce the bug it guards against.

---

## 7. Staff assignment board

Route: `/bunk-management/board`

### 7.1 Layout
- Left rail: unassigned staff pool, one pill per `Staff` row with no `CabinStaffAssignment` for the selected session. Each pill shows name and role badge (counselor / CA badge is **not** used here — CAs never appear in this pool, since they're Campers, not Staff. See 7.4).
- Main area: grouped by `Unit` (fixed 4: `UNIT1`–`UNIT4`, confirmed — Section 14), each unit showing however many cabins currently belong to it (already variable today via `Cabin.unit`, nothing new needed there). Cabin group sizes are not fixed at 2 — Unit 2 in your Q1 file has three cabins (B7, B8, B9), Unit 4 has two, and the board must render however many exist rather than assuming a fixed count.
- Each cabin card: cabin name, bed count (`X/Y beds`, computed from `Cabin.beds` vs. actual assigned headcount — see 7.5), an expandable camper roster (collapsed by default, click to expand — campers matter for personality-fit staffing, per your note, but shouldn't dominate the screen when assigning), staff slots, and a CA line.

### 7.2 Assignment mechanics
- Drag a pill from the pool onto an empty staff slot on a cabin card → creates a `CabinStaffAssignment` row via `/api/bunk-management/assign`.
- Once assigned, that staff member's pill leaves the pool entirely — there is only ever one instance of them on the board for a given session, which is what makes double-booking structurally impossible in the UI, backed by the `@@unique([staffId, sessionId])` constraint server-side as the real guarantee.
- Removing an assignment (× on the pill) deletes the `CabinStaffAssignment` row and returns the pill to the pool.
- `CabinStaffRole` (`UNIT_PROGRAMMER` / `UNIT_HEAD`) is set via a small inline control on the assigned pill (not a separate screen) — shown as a plain text label under the name, same visual weight as the CA line, per your last message ("simply need to be visible next to the name — same as CA").

### 7.3 Preference display
- `StaffUnitPreference` rows are entered ahead of time by an admin (transcribed from the paper survey — no staff-facing submission form, per your answer).
- When a pill is dropped onto a cabin, look up that staff member's rank for the cabin's `Unit` and show "1st choice" / "2nd choice" / etc. next to their name (1st choice in a visually distinct — but not loud — treatment; the rest in muted text). No score/percentage, just the plain rank.

### 7.4 Campers and CAs on the board
- The camper roster shown per cabin (on expand) comes from `Camper` rows where `cabinId` matches and `active: true` for the selected session — plain names, used for personality-matching context while placing staff, not editable here (camper-cabin moves happen through the small unassigned-camper flow in 7.6, or the reconciliation screen when it's built).
- Campers with `counselorAssistant: true` in that cabin are shown on their own "(CA)" line directly under the roster, visually matching how they sit in the paper doc's top block — **as Campers, never as Staff pool pills.**

### 7.5 Bed count vs. assigned headcount
Headcount for a cabin = (active campers with this `cabinId`) + (`CabinStaffAssignment` rows for this cabin+session) + (campers with this `cabinId` and `counselorAssistant: true`, already counted in the first term — don't double-count). This exactly reproduces the arithmetic behind the paper doc's `(6+3+2=11)`-style header, computed instead of hand-typed — which matters, because the same cabin's headcount was found to disagree between the "Master List" and "Unit 1" tabs in your actual Q1 file (11 vs. 12 for G2). **Confirmed: exceeding `Cabin.beds` is a warning, not a hard block** — the assignment still goes through, with a visible over-capacity indicator on the cabin card and in the print view, rather than refusing the drop.

### 7.6 Unassigned campers
A small banner above the board (not a full second pool UI) lists campers with no `cabinId` for the selected session/gender — this is expected to be a handful, not a workflow to build out heavily right now. Clicking it is a jumping-off point to move them manually; no auto-placement logic.

---

## 8. Cabin / unit / bed admin

Route: `/bunk-management/cabins`

Thin, real-time editing screen, grouped by unit:
- Bed count: plain number input, saves on change (no separate confirm step, matching how the rest of the app behaves).
- Unit: select dropdown, calls the existing `updateCabin` action — its unit-change cascade (→ `Camper.unit`) already does the right thing and needs no modification.
- Add cabin (per unit) / delete cabin: thin wrappers around `createCabin` and a new (currently nonexistent) delete action — deleting a cabin with active campers/staff assigned should be blocked with a clear message rather than silently orphaning those rows.
- This screen does **not** add the ability to create a 5th unit — `Unit` stays the fixed 4-value enum it is today (confirmed, Section 14).

### 8.1 Non-cabin staff housing (lightweight, kept separate from the board)

Confirmed: `/admin/staff/cabins`' other job — tracking staff who live in **non-cabin** housing (Nurse Cabin, Staff House, Health Center, Office, etc., via the existing `Staff.housingLabel` free-text field) — moves into Bunk Management too, since it's good to have one place with a plan for every staff member. But it stays a small, secondary screen: it does **not** feed the headcount math (Section 7.5), does **not** appear on the staff assignment board or in the print/export reports (Section 10), and is not session-scoped — `Staff.housingLabel` stays exactly the global field it is today. Practically, this is the existing `/admin/staff/cabins` UI carried over close to as-is under `/bunk-management/staff-housing`, not a rebuild.

---

## 9. CampMinder import (kept intentionally brief — not being mocked up yet, per your request)

Recommendation: generalize the existing `q1-cabins` / `q2-cabins` pattern (fuzzy name matching, duplicate-conflict detection, create-from-prior-session profile copying — all of which already work well) into one reusable, session-agnostic import screen inside Bunk Management, rather than a new hand-coded `q3-cabins` folder every quarter. The **only** behavioral change from the current (Q2, corrected) version: none — the CA-as-Camper logic is already right and should be carried forward unchanged. This will get its own full design pass later; this section only reserves the route and states the direction.

---

## 10. Print / export view

Route: `/bunk-management/print` — this is also what Side Head accounts land on, read-only.

- Visually matches the existing "[Boys/Girls] Unit N Q# YYYY" sheets: cabins in pairs side by side, plain layout, no color, portrait — a deliberate choice to not modernize the printed artifact even though the editing screen is fully modern, since the people reading the printout are the ones you said need the least disruption.
- Per-cabin block: staff (plain names) and CAs (name + "(CA)") at top, camper bulk list below with grade + session-designation columns, headcount computed per Section 7.5 rather than hand-maintained — this is the fix for the Master-List-vs-Unit-tab inconsistency found in your actual file.
- Footer: `*late arrival` legend (if any `CamperSessionDesignation` marks late arrival) and a generated timestamp, replacing the hand-typed "Updated: 6/21/26 11:33am" line.

---

## 11. Impact on the rest of the app

Every one of the 12 paths in the existing `revalidateCabinConsumers()` list was checked directly against its source file.

| Route | Current cabin usage | Change needed |
|---|---|---|
| `/dashboard` | none found | none |
| `/registration` | displays/filters by `Camper.cabin.name` (`app/registration/page.tsx`) | none — reads the same relation |
| `/scream-session` | cabin list for staff housing context; `caNameSet` + `lib/ca-staff-exclusion.ts` filters stray CA-staff rows | none for cabin data; if `CabinStaffAssignment` fully replaces `Staff.cabinId` for bunk purposes, the exclusion helper doesn't need to change since it's guarding against a different (already-fixed) bug |
| `/rosters` | `Camper.cabin.name` column and sort key (`app/rosters/page.tsx`) | none |
| `/cards` | cabin filter, `weekEnrollments.cabin` (`app/cards/page.tsx`) | none |
| `/admin/campers` | cabin display | none |
| `/admin/staff` | no direct cabin usage found | none |
| `/admin/staff/cabins` | staff-to-cabin move UI, plus non-cabin "custom housing" labels (Nurse Cabin, Staff House, etc.) via `Staff.cabinId` / `Staff.housingLabel` | **superseded.** Real cabin/bunk assignment moves fully to the new board (`CabinStaffAssignment`); non-cabin housing tracking moves to `/bunk-management/staff-housing` (Section 8.1) as a small secondary screen, kept out of the headcount math, board, and print reports |
| `/admin/cabins` | cabin metadata edit | reused directly, not replaced (Section 6) |
| `/switches` | no cabin usage found | none |
| `/area-dashboard` | no cabin usage found | none |
| `/outages` | cabin-scoped outages via `Camper.cabin` / `Outage.cabinId` (`app/outages/page.tsx`) | none |
| `/admin/import/q1-cabins`, `/admin/import/q2-cabins` | one-off hand-coded import scripts | **superseded** — retire after Bunk Management's generalized import (Section 9) ships; don't hand-build a `q3-cabins` folder |

The short version: because `Cabin`, `Camper.cabinId`, and `Camper.counselorAssistant` already are the real data model everywhere else in the app, almost nothing outside Bunk Management itself needs to change. The two genuine gaps are `Staff.cabinId` not being session-scoped (Section 3.2) and the UP/UH tag having nowhere to live (also 3.2) — both are new additions, not changes to existing consumers.

---

## 12. Cross-system rule: Unit Programmers and Scream Session — DEFERRED

**Status: parked, not part of this build.** This was raised as a partial thought, not a firm requirement yet — do not build any of the mechanism below until it's revisited. Recorded here only so the idea isn't lost.

The rough shape of it, for whenever this comes back: a staff member holding `CabinStaffRole.UNIT_PROGRAMMER` for a session would always be scheduled as "programming" for their unit during period 1 of both days (`Period.P1A` / `Period.P1B`) in Scream Session, via a `StaffAssignment` row kept in sync with the `CabinStaffAssignment` tag. The open questions from the earlier pass still stand whenever this is picked back up: which `Area`/`Activity`/`ActivityOffering` actually represents unit programming, whether the sync should be automatic vs. a validation flag, and how to handle a P1A/P1B conflict. None of this affects Sections 1–11 or the rollout plan below — it's a later, separate addition on top of `CabinStaffAssignment`, not a prerequisite for it.

## 13. Rollout plan

No parallel run, per direct instruction.

1. Migration: add `Cabin.beds`, `CabinStaffAssignment`, `StaffUnitPreference`, `User.bunkManagementView`.
2. Backfill `Cabin.beds` from the actual physical count for every existing cabin (manual, one-time — there's no reliable source to derive this from automatically).
3. Build the cabin/unit/bed admin screen (Section 8) — lowest risk, extends existing, working code.
4. Build the staff assignment board (Section 7).
5. Transcribe the paper preference survey into `StaffUnitPreference`.
6. Generalize the import (Section 9) and cut Q3's import through it instead of hand-coding `q3-cabins`.
7. Build the print view (Section 10); grant Side Head accounts `bunkManagementView`.
8. Retire `/admin/import/q1-cabins`, `/admin/import/q2-cabins`, and narrow or fold `/admin/staff/cabins`.

---

## 14. Open decisions — confirm before implementation starts

These are flagged rather than decided, because each one is a real fork with a different implementation cost, not a detail I felt comfortable assuming.

- ~~**A. `Unit` enum.**~~ **RESOLVED** — confirmed exactly 4 units, always. `Unit` stays the fixed `UNIT1`–`UNIT4` enum; no dynamic/creatable-unit model needed anywhere in Bunk Management. Cabins keep moving freely *between* the 4, which the current enum already supports without any change.
- ~~**B. `/admin/staff/cabins`.**~~ **RESOLVED** — folds into Bunk Management (`/bunk-management/staff-housing`, Section 8.1), kept as a small secondary screen, deliberately not woven into the board, headcount math, or print reports.
- ~~**C. Side Head permission mechanism.**~~ **RESOLVED** — `User.bunkManagementView: Gender?` confirmed (Section 3.5).
- ~~**D. `CabinStaffRole` values.**~~ **RESOLVED** — `COUNSELOR` / `UNIT_PROGRAMMER` / `UNIT_HEAD`; Side Heads get zero `CabinStaffAssignment` rows, pure read permission only (Section 3.5).
- ~~**E. Bed count enforcement.**~~ **RESOLVED** — warning only, never a hard block (Section 7.5).
- **F. `StaffUnitPreference` entry.** Confirmed as admin-transcribed from a paper survey, not staff self-service — flagging once more since it affects whether any UI is needed for staff at all (answer: no).
