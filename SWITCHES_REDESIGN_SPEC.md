# Switches Wizard — Redesign Specification

**Status:** Ready for implementation  
**Scope:** Complete replacement of the flat-form switch creation flow and pending-review panel  
**Routing:** New wizard lives at `/switches/new` (camper) and `/switches/new-staff` (staff); review panel stays at `/switches` but gets richer cards

---

## 1. Overview & Philosophy

The current switch UI treats the process as a form-filling exercise. The redesigned flow treats it as a **decision-support tool**: the area head should never have to open a second tab, run a mental calculation, or guess whether a switch makes sense. Every piece of information they need to make a good call should surface contextually as they move through the wizard.

**Core principle:** Surface information at the moment of relevance, not before.

---

## 2. URL Structure

```
/switches                          → hub page (pending review + history)
/switches/new                      → camper switch wizard (Step 1)
/switches/new?registrationId=xyz   → camper switch wizard (Step 1 pre-filled)
/switches/new/destination          → Step 2: pick destination offering
/switches/new/confirm              → Step 3: review & submit
/switches/new-staff                → staff switch wizard (same 3-step structure)
```

Wizard state is passed via URL search params so the back button works naturally and pages are shareable/bookmarkable.

---

## 3. Camper Switch Wizard — Step by Step

### Step 1: Find the Camper

**Route:** `/switches/new`

**Purpose:** Replace the unsorted dropdown with a proper search experience.

#### Layout

```
┌─────────────────────────────────────────────────────┐
│  ← Back to Switches                                 │
│                                                     │
│  Step 1 of 3    ●───○───○                           │
│  Find the Camper                                    │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  🔍  Search by name, cabin, or activity...  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Period filter: [All] [1A] [2A] [3A] [4A]          │
│                 [1B] [2B] [3B] [4B]                │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  EMMA DAVIDSON            Cabin 4 · Unit 2  │   │
│  │  2A · Waterfront — Sailing                  │   │
│  │                                    Select → │   │
│  ├─────────────────────────────────────────────┤   │
│  │  EMMA HARRISON            Cabin 7 · Unit 3  │   │
│  │  3A · Arts — Ceramics                       │   │
│  │                                    Select → │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

#### Behavior

- **Search** is client-side filtering across: first name, last name, cabin name/number, current activity name, area name. Debounced 150ms.
- Each result row shows: **Full name** (prominent) · cabin · unit · **period + current activity** (the one being switched from).
- If a camper has multiple active registrations (multiple periods), they appear once per registration as separate rows — selecting a row implicitly selects both the camper AND the specific period/registration.
- **Period filter chips** narrow the list. Defaults to "All." When a specific period is selected, only registrations in that period show.
- Clicking **Select** advances to Step 2, passing `registrationId` and `offeringId` as URL params.

#### Camper Context Card (appears below search after selection, before advancing)

When a result is clicked, before navigating, briefly expand it into a full context card in-place:

```
┌─────────────────────────────────────────────────────┐
│  EMMA DAVIDSON                     ✕               │
│  Cabin 4 · Unit 2 · Muskie · Age 14                │
│                                                     │
│  Full Schedule                                      │
│  1A  Outdoor Ed — Rock Climbing                     │
│  2A  Waterfront — Sailing          ← switching this │
│  3A  Arts — Ceramics                                │
│  4A  Athletics — Soccer                             │
│                                                     │
│  ⚠  Leaves after Week 4                            │
│                                                     │
│  1 prior switch this session                        │
│                                                     │
│  [Continue with this selection →]  [Back to search] │
└─────────────────────────────────────────────────────┘
```

**Fields shown:**
- Name, cabin, unit, swim level, age
- Full period schedule for the current session (all active registrations), with the one being switched highlighted
- Departure date / week enrollment — shown as a human label ("Leaves after Week 4") if their `weekEnrollments` don't extend through the end of session
- Count of prior switch requests this session (links to filtered history)
- Medical flags / designations — shown as a subdued tag list if present (e.g. "Allergy: Tree Nuts")

**Confirm button** navigates to Step 2 with params in URL.

---

### Step 2: Choose the Destination Offering

**Route:** `/switches/new/destination?registrationId=...`

**Purpose:** Replace the flat dropdown with an informative offering browser.

#### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back                                                              │
│                                                                      │
│  Step 2 of 3    ●───●───○                                            │
│  Choose Destination                                                  │
│                                                                      │
│  Moving: EMMA DAVIDSON · 2A · Waterfront — Sailing                  │
│                                                                      │
│  Filter by area: [All] [Waterfront] [Athletics] [Arts] [Outdoor Ed]  │
│  Period: 2A (locked — must match current period)                     │
│                                                                      │
│  ┌────────────────────────────────┐  ┌────────────────────────────┐  │
│  │  WATERFRONT                    │  │  ATHLETICS                 │  │
│  │  Canoeing                      │  │  Tennis                    │  │
│  │  2A                            │  │  2A                        │  │
│  │                                │  │                            │  │
│  │  Enrollment   ████░░  9 / 12   │  │  Enrollment  ████████ 12/12│  │
│  │  Staff        Jake R, Mia C    │  │  Staff       Tom H         │  │
│  │                                │  │                            │  │
│  │  ✅ Emma is eligible           │  │  ⚠ At capacity             │  │
│  │                                │  │  (can override)            │  │
│  │                 [Select →]     │  │             [Select →]     │  │
│  └────────────────────────────────┘  └────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────┐                                  │
│  │  ARTS                         │                                  │
│  │  Pottery                      │                                  │
│  │  2A                           │                                  │
│  │                               │                                  │
│  │  Enrollment   ██░░░░  4 / 10  │                                  │
│  │  Staff        (none assigned) │                                  │
│  │                               │                                  │
│  │  ❌ Not eligible (Unit 2 not  │                                  │
│  │     eligible for this period) │                                  │
│  │                               │                                  │
│  │  [Select anyway →]            │                                  │
│  └────────────────────────────────┘                                 │
└──────────────────────────────────────────────────────────────────────┘
```

#### Offering Cards

Each card shows:

| Field | Source | Notes |
|-------|--------|-------|
| Area name | `offering.area.name` | Used as eyebrow |
| Activity name | `offering.activity.name` | Primary heading |
| Period | `offering.period` | Shown as lock — period must match current registration |
| Enrollment bar | `enrollmentCount / rosterLimit` | Visual progress bar. Color: green < 75%, amber 75–99%, red = at/over |
| Enrollment label | `n / limit` or "Unlimited" or "Approval Required" | Matches `CapacityPill` logic |
| Staff | `staffAssignments[].staff.firstName lastName` | Comma-separated; "No staff assigned" if empty |
| Eligibility verdict | Result of running `validateRegistration()` client-side with camper data | Green ✅ / Amber ⚠ / Red ❌ with short reason |
| Limit type | `offering.limitType` | Shown only when SPECIAL_APPROVAL or UNLIMITED |

**Eligibility verdict** is computed for the specific camper being switched (unit check, swim level check, capacity check). This replaces the post-submission warning message. The verdict is always shown on the card — not hidden until selection.

**Card states:**
- **Eligible + space:** Full green ✅. Select button labeled "Select →"
- **Eligible + at capacity:** Amber ⚠ "At capacity (can override)." Select button shown, will flag as override.
- **Eligible + full + no override:** Amber ⚠ "At capacity — requires exec admin approval." Select button still shown but labeled "Submit for review →"
- **Ineligible (hard rule):** Red ❌ with specific reason. Button labeled "Select anyway →" (exec admin only — area heads see disabled button with tooltip "Contact exec admin to override")
- **Same as current:** Grayed out — "Current offering" label, no button.

#### Expandable Roster

Each card has a **"View roster ▾"** toggle. Expanding shows:

```
│  View roster ▴                                              │
│  ─────────────────────────────────────────────────────────  │
│  9 campers enrolled                                         │
│                                                             │
│  Lila Morse          Cabin 3 · Unit 2                       │
│  Jake Park           Cabin 3 · Unit 2                       │
│  Sam Lee             Cabin 5 · Unit 2  ⚠ Leaves Week 4     │
│  …                                                          │
```

Roster is fetched on-demand (separate server action / API route) triggered by expanding the toggle — not pre-loaded for all offerings.

---

### Step 3: Review & Confirm

**Route:** `/switches/new/confirm?registrationId=...&offeringId=...`

**Purpose:** Give the submitter a complete before/after view before committing the request.

#### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                                                         │
│                                                                 │
│  Step 3 of 3    ●───●───●                                       │
│  Review & Submit                                                │
│                                                                 │
│  ┌───────────────────────┐    ┌───────────────────────┐        │
│  │  LEAVING              │    │  JOINING              │        │
│  │  Waterfront           │    │  Waterfront           │        │
│  │  Sailing              │    │  Canoeing             │        │
│  │  Period 2A            │    │  Period 2A            │        │
│  │                       │    │                       │        │
│  │  Enrollment after:    │    │  Enrollment after:    │        │
│  │  11 → 10  ✅          │    │  9 → 10  ✅ (of 12)  │        │
│  │                       │    │                       │        │
│  │  Staff:               │    │  Staff:               │        │
│  │  Jake R, Mia C        │    │  Jake R, Mia C        │        │
│  └───────────────────────┘    └───────────────────────┘        │
│                                                                 │
│  Camper: EMMA DAVIDSON · Cabin 4 · Unit 2 · Muskie             │
│                                                                 │
│  ─────────────────────────────────────────────────────          │
│                                                                 │
│  ⚠  Cross-area switch: destination is in Waterfront.           │
│     This request will route to the Waterfront area head        │
│     for approval.                                              │
│                                                                 │
│  Reason (optional)                                             │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  Camper requested change, parent note on file.       │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
│  [← Back]                      [Submit for review →]           │
│                                                                 │
│  (Exec admin: [Approve immediately →])                          │
└─────────────────────────────────────────────────────────────────┘
```

#### Fields

- **Side-by-side leaving/joining cards** — mirror each other. Show area, activity, period, current enrollment → enrollment after switch, staff list.
- **Camper strip** — name, cabin, unit, swim level.
- **Cross-area callout** — shown if `requestedOffering.areaId !== user.areaId`. Explicitly names the destination area head's area and states the routing. This prevents confusion about why a submitted request isn't in the area head's own queue.
- **Eligibility summary** — if any warnings or hard blocks exist, repeat them here with a clear label (warning vs. block). Don't hide them.
- **Reason field** — optional freetext. Pre-populated with nothing. Stored as `reason` on the switch request.
- **Submit vs. Approve immediately** — area heads see "Submit for review." Exec admins see both options. "Approve immediately" runs the full approval transaction in one step (no pending state created).

#### On Submit

- Server action creates `SwitchRequest` with `status: PENDING`.
- If cross-area: the destination area head will see it in their pending queue on `/switches`.
- Redirect to `/switches` with a success toast: "Switch request created for Emma Davidson."

---

## 4. Pending Review — Redesigned Card

The `/switches` hub page keeps its stat cards and history table, but the **pending review section** gets substantially richer cards.

### Redesigned Pending Card

```
┌──────────────────────────────────────────────────────────────────┐
│  PENDING · CAMPER SWITCH                                         │
│  Requested by Jordan M · 2 hours ago                            │
│                                                                  │
│  EMMA DAVIDSON  Cabin 4 · Unit 2 · Muskie                       │
│                                                                  │
│  ┌──────────────────────────┐    ┌──────────────────────────┐   │
│  │  LEAVING                 │    │  JOINING                 │   │
│  │  Waterfront              │    │  Waterfront              │   │
│  │  Sailing · 2A            │    │  Canoeing · 2A           │   │
│  │                          │    │                          │   │
│  │  Enrollment now: 11      │    │  Enrollment now: 9 / 12  │   │
│  │  → becomes 10 if approved│    │  → becomes 10 if approved│   │
│  │                          │    │                          │   │
│  │  Staff: Jake R, Mia C    │    │  Staff: Jake R, Mia C    │   │
│  └──────────────────────────┘    └──────────────────────────┘   │
│                                                                  │
│  ⚠  Camper leaves after Week 4.                                 │
│                                                                  │
│  Reason: "Camper requested change, parent note on file."        │
│                                                                  │
│  View current roster ▾                [Deny]  [Approve ✓]      │
└──────────────────────────────────────────────────────────────────┘
```

**Key changes from current:**
- Full leaving/joining side-by-side (not just names and arrows)
- Staff listed — the reviewing area head can see who's in the room
- Enrollment impact shown prospectively ("becomes 10 if approved")
- Departure warning surfaced inline — no need to look up the camper separately
- Stated reason visible
- Expandable roster toggle — same on-demand fetch as wizard Step 2
- Cross-area badge if applicable ("Request from Outdoor Ed area")
- Deny button now opens a small inline text field: "Reason for denial (optional)" — stored on the switch record and visible in history

---

## 5. Cross-Area Routing Logic

| Scenario | Who approves |
|----------|-------------|
| Area head switches camper into **own area** | That area head |
| Area head switches camper into **another area** | Destination area head sees it in their queue |
| Exec admin creates any switch | Can approve immediately — no queue |

**Area head visibility filtering:**
- Area heads only see pending switches where `requestedOffering.areaId === user.areaId`
- The `/switches` hub for an area head should also show a secondary section: "Outbound requests" — switches originating from their area (where they were the requester) into another area, with their current pending/approved/denied status. This gives them visibility without action required.

---

## 6. Staff Switch Wizard

Follows identical 3-step structure. Key differences:

**Step 1:** Search across staff assignments (not camper registrations). Show: staff name · current assignment · period.

**Step 2:** All offerings are eligible destinations (not filtered by eligibility rules). Staff target shown on cards ("Staffed: 1 of target 2"). Period is locked to current assignment period.

**Step 3:** Same side-by-side review. No eligibility warnings (staff assignments don't have the same unit/swim restrictions). Cross-area callout still applies.

---

## 7. Data Requirements

### Step 1 — Camper search
Fetch all active registrations for the session with:
```ts
include: {
  camper: { include: { cabin: true, weekEnrollments: true, sessionDesignations: true, allergies: true } },
  offering: { include: { activity: true, area: true } }
}
```
Load once on page render; filter client-side.

Also fetch: all registrations for the selected camper (their full schedule), and their prior switch count.

### Step 2 — Offerings browser
Fetch offerings for the matching period:
```ts
where: { sessionId, period: registrationPeriod, active: true, visibleForCamperRegistration: true }
include: {
  activity: true,
  area: true,
  staffAssignments: { include: { staff: true } },
  _count: { select: { registrations: { where: { status: { in: activeRegistration }, registrationRole: CAMPER } } } }
}
```
Run `validateRegistration()` for the target camper against each offering to generate eligibility verdicts.

### Step 2 — Roster (on-demand)
Separate API route: `GET /api/switches/offering-roster?offeringId=...`
Returns campers with cabin, unit, week enrollment (for departure flags).

### Step 3 — Confirm
No additional data fetch needed — params carry all needed IDs. Re-validate server-side on submit.

---

## 8. File Structure

```
src/app/switches/
  page.tsx                          ← Hub (pending review + history) — update
  new/
    page.tsx                        ← Step 1: camper search
    destination/
      page.tsx                      ← Step 2: offering browser
    confirm/
      page.tsx                      ← Step 3: review & submit
  new-staff/
    page.tsx                        ← Step 1: staff search
    destination/
      page.tsx                      ← Step 2: offering browser
    confirm/
      page.tsx                      ← Step 3: review & submit
  actions.ts                        ← Update: add getRosterForOffering, update createCamperSwitch

src/app/api/switches/
  offering-roster/
    route.ts                        ← On-demand roster fetch
```

---

## 9. UX Details & Edge Cases

| Scenario | Handling |
|----------|----------|
| Camper has no active registrations | Not shown in search results; "No active registrations found" message |
| All offerings for the period are full | Show all cards in amber/red state; user can still select with override |
| No offerings exist for the period | Step 2 shows empty state: "No active offerings for period 2A" |
| Same offering selected as current | Grayed out card, no button — "Current offering" label |
| Exec admin creates switch | "Approve immediately" bypasses pending queue entirely |
| Area head tries to approve own cross-area switch | Not in their queue — only visible in "Outbound requests" section |
| Camper already has a switch pending for same period | Warning on camper context card: "1 pending switch for this period already exists" with link |
| Deny with reason | Inline text field; reason stored in `validationNotes` field on the switch record |

---

## 10. Implementation Notes

- Wizard state (registrationId, offeringId) lives entirely in URL params — no client state store needed. This makes the back button work and avoids stale state bugs.
- Client-side camper filtering on Step 1 requires pre-loading all registrations. For large sessions this is fine (typically <500 registrations). If performance becomes a concern, add a debounced server-side search route.
- `validateRegistration()` is already in `src/lib/eligibility.ts` — call it for each offering in Step 2 server-side during page render to generate verdicts. Pass camper data from the URL-carried registrationId.
- The existing `actions.ts` `createCamperSwitch` function is mostly reusable — just update it to accept the new params and handle the "approve immediately" path for exec admins.
- For the pending review cards, the existing `decideSwitch` action is fully reusable — the richer card is a UI change only.
- Roster fetch should be protected: area heads can only fetch rosters for offerings in their area (or exec admin gets all).
