# Switches Wizard — Full Redesign Specification (v2)

**Status:** Ready for implementation  
**Replaces:** Previous flat-form switches page  
**Scope:** Wizard creation flow, hub page, navigation badge, smart UX patterns

---

## 1. Philosophy

The switch workflow is a real-time decision tool, not a form. Every person using it — whether submitting or approving — should have all the information they need on screen, at the moment they need it, without opening a second tab.

Three design principles guide every decision:

1. **Context at point of relevance** — don't dump all data upfront. Show the camper schedule *after* the camper is selected. Show the class roster *when the destination is being evaluated*.
2. **Warnings are not enough** — surface hard facts (who's in the class, who's teaching, is this camper leaving early) so the human can make a judgment, not just react to a flag.
3. **The system should be hard to use wrongly** — clear eligibility signals before submission, cross-area routing explained inline, no silent failures.

---

## 2. URL & Route Structure

```
/switches                          → Hub: pending queue + history + stats
/switches/new                      → Camper switch wizard, Step 1
/switches/new/destination          → Step 2
/switches/new/confirm              → Step 3
/switches/new-staff                → Staff switch wizard, Step 1
/switches/new-staff/destination    → Step 2
/switches/new-staff/confirm        → Step 3
/api/switches/offering-roster      → GET: on-demand roster fetch for a given offeringId
```

All wizard state travels in URL search params (`registrationId`, `offeringId`). Back button works naturally. Pages are bookmarkable. No client state store needed.

---

## 3. Camper Switch Wizard

### Step 1 — Find the Camper

**Route:** `/switches/new`

Replace the dropdown with a live-search experience using the same debounce pattern already in `GlobalSearchTypeahead`.

#### Search behavior

- Input filters client-side across: first name, last name, cabin name/number, current activity name, area name.
- Debounce: 150ms. Min 2 chars before filtering.
- Each result row: **Full name** (bold) · cabin · unit · period label · current activity name.
- Period filter chips above the list (All / 1A / 2A / 3A / 4A / 1B / 2B / 3B / 4B). Default: All.
- If a camper has multiple active registrations, they appear as separate rows — one per registration. Selecting a row implicitly selects that camper + that specific period/registration.
- Empty state: "No registrations match your search."

#### Camper context card

When a row is clicked, it expands in-place into a context card *before* the user is navigated forward. This is a client component — no new data fetch, data is already in the page payload.

**Context card shows:**

| Field | Notes |
|-------|-------|
| Name + cabin + unit + swim level + age | Identity confirmation |
| Full period schedule | All active registrations, current session. Highlight the one being switched in forest green. |
| Departure note | If their `weekEnrollments` don't extend to the final week, show: "Leaves after [Week label]" in amber. |
| Prior switches | "X switch(es) this session" — links to `/switches?camper=id` filtered history. If 0, omit. |
| Medical flags | If `medicalFlags` is non-empty, show as a subdued tag. If `allergies` exist, list them. |
| Pending switch warning | If a `SwitchStatus.PENDING` request already exists for this period, show: "⚠ A pending switch for this period already exists" with a link to it. |

**Buttons:** "Continue with this selection →" (advances to Step 2 with `registrationId` in URL) and "Back to search."

---

### Step 2 — Choose the Destination Offering

**Route:** `/switches/new/destination?registrationId=...`

Replace the dropdown with a card grid. The period is locked to match the current registration — show it as a fixed label, not a selectable input.

#### Page header context strip

A persistent strip at the top of Step 2 (and Step 3) shows:

```
Moving: EMMA DAVIDSON · Cabin 4 · Unit 2 · Period 2A · currently Waterfront — Sailing
```

This prevents the user from losing track of who/what they're working on.

#### Area filter chips

Chips for each area that has offerings in the locked period. Default: All. Clicking an area chip narrows the card grid to that area only.

#### Offering cards

Each card contains:

| Field | Source | Detail |
|-------|--------|--------|
| Area name | `offering.area.name` | Eyebrow, small caps |
| Activity name | `offering.activity.name` | Primary heading |
| Period | Locked — shown as a label, not input | |
| Enrollment bar | `enrollmentCount / rosterLimit` | Visual fill bar. Colors: green < 75%, amber 75–99%, red ≥ 100% |
| Enrollment label | `n / limit`, "Unlimited", or "Approval Required" | Matches existing `CapacityPill` logic |
| Limit type note | Shown only when FLEXIBLE (soft guide), UNLIMITED, or SPECIAL_APPROVAL | "Limit is a guide — override allowed" for FLEXIBLE |
| Staff teaching | `staffAssignments[].staff.firstName lastName` | Comma list; "No staff assigned" if empty, shown in amber |
| Eligibility verdict | Result of `validateRegistration()` run server-side for this camper | See verdict states below |

#### Eligibility verdict states on cards

| State | Indicator | Button |
|-------|-----------|--------|
| Eligible + space available | ✅ "Emma is eligible" (green) | "Select →" |
| Eligible + at capacity, limit is FLEXIBLE | ⚠ "At capacity — limit is a guide" (amber) | "Select →" (flags as override on submit) |
| Eligible + at capacity, FIXED limit | ⚠ "At capacity — override required" (amber) | "Select →" (area heads can still proceed; noted in validation) |
| Eligible + at capacity, no override allowed | 🔴 "At capacity — exec admin only" | Disabled for area heads; tooltip "Contact exec admin" |
| Ineligible — unit mismatch | 🔴 "Unit N not eligible for this period" (red) | Area head: disabled. Exec admin: "Select anyway →" |
| Ineligible — swim level | 🔴 "Swim level [X] not eligible" (red) | Area head: disabled. Exec admin: "Select anyway →" |
| Pre-assigned activity | 🔴 "Pre-assigned — approval required" (red) | Area head: disabled. Exec admin: "Select anyway →" |
| Currently enrolled | Gray "Current offering" label | No button — grayed card |

#### Expandable roster

Each card has a **"View roster ▾"** toggle (collapsed by default). Expanding fetches `/api/switches/offering-roster?offeringId=...` and shows:

```
9 campers enrolled

Lila Morse        Cabin 3 · Unit 2
Jake Park         Cabin 3 · Unit 2
Sam Lee           Cabin 5 · Unit 2    ⚠ Leaves Week 4
...
```

Roster shows: name · cabin · unit · departure note if applicable. Sorted by last name. Fetch is protected — area heads can only fetch rosters for offerings in their own area; exec admin gets all.

#### "Would also fit" — alternative suggestions

If the selected destination is at or over capacity, a section appears below the card grid:

```
Also available in [same area or activity]:
  ┌─────────────────────────────┐
  │  Waterfront — Kayaking · 2A │
  │  ████░░░░  6 / 12  ✅      │
  └─────────────────────────────┘
```

Logic: find offerings with the same `activity.name` or same `area.id` in the same period that have open spots and no eligibility blocks for this camper. Show up to 3.

---

### Step 3 — Review & Confirm

**Route:** `/switches/new/confirm?registrationId=...&offeringId=...`

#### Side-by-side impact cards

```
┌──────────────────────────┐    ┌──────────────────────────┐
│  LEAVING                 │    │  JOINING                 │
│  Waterfront              │    │  Waterfront              │
│  Sailing · 2A            │    │  Canoeing · 2A           │
│                          │    │                          │
│  Enrollment: 11 → 10     │    │  Enrollment: 9 → 10      │
│  (of 12 max)             │    │  (of 12 max)             │
│                          │    │                          │
│  Staff: Jake R, Mia C    │    │  Staff: Jake R, Mia C    │
└──────────────────────────┘    └──────────────────────────┘
```

Both cards show prospective enrollment — what it becomes *if* approved, not current count.

#### Camper strip

```
EMMA DAVIDSON  ·  Cabin 4  ·  Unit 2  ·  Muskie  ·  Leaves after Week 4
```

Departure note shown inline here if applicable — another reminder at the decision point.

#### Callouts (shown only when applicable)

**Cross-area callout** — if `requestedOffering.areaId !== user.areaId`:

```
┌─────────────────────────────────────────────────────────────┐
│  ↗  Cross-area switch                                       │
│  This request goes to the Waterfront area head for          │
│  approval. You'll see its status in "My outbound requests." │
└─────────────────────────────────────────────────────────────┘
```

**Eligibility warning (non-blocking)** — if there are warnings but no hard blocks:

```
⚠  Class is at capacity. Limit type is FLEXIBLE — this is a
   guideline, not a hard cap. Approval noted.
```

**Eligibility block (blocking for area heads)** — hard blocks show in red with the specific reason. "Submit" button disabled for area heads; exec admin sees it enabled.

#### Reason field

Optional. Placeholder: "Why is this switch being requested? (optional — visible in history and to the approver)." Stored as `reason` on the `SwitchRequest`.

#### Deny reason field (on the review card, Step 3 variant)

When a reviewer is denying, a small inline field appears: "Reason for denial (optional)" — stored in `validationNotes` and displayed in history.

#### Actions

| Role | Actions shown |
|------|--------------|
| Area Head — own area | "Submit for review →" |
| Area Head — cross-area | "Submit for review →" (routes to destination area head) |
| Exec Admin | "Submit for review →" and "Approve immediately →" |

"Approve immediately" runs the full approval transaction in a single server action — no PENDING state created. Useful when speed matters.

#### On submit

- Server action creates `SwitchRequest` with `status: PENDING` (or approves if exec admin chose immediate).
- Redirect to `/switches` with success toast: "Switch request created for Emma Davidson — pending Waterfront area head review."
- Toast includes a link back to the request in the pending queue.

---

## 4. Hub Page (`/switches`) — Full Redesign

### Stat cards (updated)

| Card | Current | Change |
|------|---------|--------|
| Pending switches | ✅ keep | Add: "X awaiting your area" for area heads |
| Approved | ✅ keep | — |
| Denied | ✅ keep | — |
| Available offerings | rename | "Switch destinations available" |
| NEW: My outbound requests | — | Count of switches submitted by this user pending in another area |

### Pending Review section (redesigned cards)

**Current:** Name + arrow text + approve/deny buttons.

**Redesigned card:**

```
┌──────────────────────────────────────────────────────────────────┐
│  PENDING · CAMPER SWITCH              Requested by Jordan M      │
│  2 hours ago                          [From: Outdoor Ed area]    │
│                                                                  │
│  EMMA DAVIDSON  ·  Cabin 4  ·  Unit 2  ·  Muskie               │
│  ⚠ Leaves after Week 4                                          │
│                                                                  │
│  ┌──────────────────────────┐    ┌──────────────────────────┐   │
│  │  LEAVING                 │    │  JOINING                 │   │
│  │  Waterfront — Sailing    │    │  Waterfront — Canoeing   │   │
│  │  Period 2A               │    │  Period 2A               │   │
│  │                          │    │                          │   │
│  │  Enrollment: 11 → 10     │    │  Enrollment: 9 → 10      │   │
│  │  Staff: Jake R, Mia C    │    │  Staff: Jake R, Mia C    │   │
│  └──────────────────────────┘    └──────────────────────────┘   │
│                                                                  │
│  Reason: "Camper requested change — parent note on file."       │
│                                                                  │
│  View destination roster ▾        [Deny ↓]     [Approve ✓]    │
└──────────────────────────────────────────────────────────────────┘
```

**Deny flow:** Clicking "Deny ↓" expands an inline text field: "Reason for denial (optional)." Then "Confirm denial." The reason is stored in `validationNotes` and shown in history.

### Outbound requests section (new)

Below the pending queue, area heads see their own submitted requests that are pending in other areas:

```
My outbound requests (2)

EMMA DAVIDSON · 2A · Waterfront — Canoeing
Submitted 2 hours ago · Awaiting Waterfront area head review

JAKE PARK · 3B · Athletics — Basketball
Submitted yesterday · APPROVED ✓
```

Exec admins see all cross-area pending requests.

### History table (updated)

Add columns:
- **Requested by** (already stored as `requestedBy`)
- **Decided by** (from `decidedByUserId` → user name)
- **Deny reason** — show inline in the Validation column if the status is DENIED and `validationNotes` has content

Add filters above the table:
- **Type:** All · Camper · Staff
- **Status:** All · Pending · Approved · Denied
- **Period:** All · [period chips]
- **Area:** (exec admin only) All · [area name list]

These are URL params so filtered views are bookmarkable.

---

## 5. Navigation Badge

The "Switches" nav item in `AppShell` currently has no indicator when there are pending items requiring attention.

**Change:** Pass a `pendingSwitchCount` prop to `AppShell` (or a new async wrapper component). The Switches nav item renders a small amber dot/pill when `count > 0`.

Because `AppShell` is a client component (uses `usePathname`), the pending count needs to be fetched server-side in a layout or page and passed down as a prop. The simplest approach: fetch it in the root layout and pass it into `AppShell`.

The badge is **scoped to the user's area**: area heads only see a badge when they have pending switches in their area awaiting *their* approval — not all pending switches globally. Exec admins see the global count.

**Visual:** A small amber filled circle (8px, `bg-amber-400`) positioned top-right of the Repeat2 icon in the nav item. At the icon level, not the label level — consistent with common mobile nav patterns.

---

## 6. Staff Switch Wizard

Follows the same 3-step structure. Key differences from the camper wizard:

### Step 1 differences
- Search across `StaffAssignment` records (not `Registration` records)
- Result row shows: staff name · primary area · current assignment · period
- Context card shows: full period assignment schedule, `employmentEnd` date as "Leaves [date]" if set, no swim/unit fields

### Step 2 differences
- All active offerings are eligible destinations — no unit/swim eligibility rules
- Cards show `staffTarget` vs. current staff count: "Staffed: 1 of target 2" instead of enrollment bar
- No eligibility verdict needed; staff don't have the same restriction model
- No "Would also fit" suggestion section

### Step 3 differences
- Side-by-side impact shows staffing counts, not enrollment counts: "Leaving: was 2/target 2 → becomes 1/target 2 ⚠"
- No unit/swim eligibility callouts
- Cross-area callout still applies if applicable

---

## 7. Deep-Link Entry Points

The wizard should be reachable from multiple places in the app, not only from the Switches nav item. These entry points pre-fill Step 1:

| Source | Deep link | Pre-fill |
|--------|-----------|----------|
| Rosters page — camper row | `/switches/new?registrationId=xyz` | Skips search, opens context card immediately |
| Area Dashboard — camper in class | `/switches/new?registrationId=xyz` | Same |
| Global search camper result | "Start switch" action link | Opens Step 1 with camper name pre-filled in search |
| History table — re-switch | `/switches/new?camperId=abc` | Populates search with that camper's name |

The `registrationId` pre-fill should detect the param on page load and auto-expand the context card for that registration — no click needed.

---

## 8. Keyboard & Accessibility

| Interaction | Behavior |
|-------------|----------|
| Step 1 search input | Autofocused on page load |
| Arrow keys in search results | Move focus through the result list |
| Enter on a result row | Selects it, expands context card |
| Enter on "Continue" | Advances to Step 2 |
| Escape in expanded context card | Collapses back to search |
| Tab through offering cards | Cards are focusable; Select button reachable by keyboard |
| Enter on offering card Select | Advances to Step 3 |
| Expand roster toggle | Space/Enter toggles; result list announced to screen readers |

---

## 9. Mobile Considerations

The wizard is primarily used on desktop by area heads at their computers, but needs to be functional on tablet/mobile (e.g., an area head walking the grounds).

- Step 1: Full-width search + stacked result rows work naturally on mobile.
- Step 2: Card grid collapses from 2-column to 1-column on narrow screens. Enrollment bar and eligibility verdict still visible.
- Step 3: Side-by-side impact cards stack vertically on mobile. Same information, different layout.
- Hub page: History table scrolls horizontally (already handled by existing `overflow-x-auto` pattern).

---

## 10. Edge Cases & Handling

| Scenario | Handling |
|----------|----------|
| Camper has no active registrations | Not shown in search results. If pre-filled via URL, show: "This camper has no active registrations to switch." |
| All offerings for the period are full | Show all cards in amber/red state with appropriate eligibility verdict. User can still select with override path. |
| No offerings exist for the period | Step 2 empty state: "No active offerings available for period 2A." Back button shown. |
| Same offering selected as current | Card is grayed with "Current offering" label, no button. |
| Exec admin immediate-approves | Creates no PENDING record. Registration is updated in one transaction. Success toast: "Switch approved and applied immediately." |
| Area head submits cross-area switch | Destination area head sees it in their pending queue. Submitter sees it in "My outbound requests." |
| Area head tries to view pending switch from another area | Not shown in their pending queue at all — they only see switches into their area. |
| Camper already has a switch pending for same period | Warning in camper context card (Step 1) and in Step 3 callout. Submit is not blocked — human judgment applies. |
| Staff member has no current assignment | Not shown in Step 1 search results. |
| Deny with reason | Stored in `validationNotes`; shown in history table Validation column with "Denied: [reason]" prefix. |
| Switch is approved but destination class since became inactive | Server action re-validates on submission. If offering is no longer active, returns error with explanation. |
| Back button from Step 3 to Step 2 | URL params preserved; Step 2 re-renders with previously selected card highlighted (via `offeringId` param match). |
| Back button from Step 2 to Step 1 | URL params preserved; camper context card auto-expands for the `registrationId` in the URL. |

---

## 11. Schema — No Changes Required

All features are achievable with the existing `SwitchRequest` schema. Mapping:

| Feature | Field |
|---------|-------|
| Deny reason | `validationNotes` (currently used for auto-validation; repurpose to also hold manual deny reason, prefixed "Denied: ") |
| Requested by | `requestedBy` (already stored) |
| Decided by | `decidedByUserId` → join to User |
| Cross-area routing | Computed from `requestedOffering.areaId` vs. approving user's `areaId` — no schema change |

The only potential schema addition is a `denialReason` field if you want to keep auto-validation notes and human denial reasons cleanly separated. Optional — can start with prefix convention.

---

## 12. Data Requirements Per Step

### Hub page + pending cards
```ts
prisma.switchRequest.findMany({
  where: { sessionId, requestedOffering: { areaId: user.areaId } }, // scoped for area head
  include: {
    camper: { include: { cabin: true, weekEnrollments: true } },
    staff: true,
    currentOffering: { include: { activity: true, area: true, staffAssignments: { include: { staff: true } } } },
    requestedOffering: { include: { activity: true, area: true, staffAssignments: { include: { staff: true } },
      _count: { select: { registrations: { where: { status: { in: activeRegistration }, registrationRole: CAMPER } } } }
    } },
    decidedBy: { select: { name: true } }
  }
})
```

### Step 1 — Camper search
```ts
prisma.registration.findMany({
  where: { sessionId, status: { in: activeRegistration } },
  include: {
    camper: {
      include: {
        cabin: true,
        weekEnrollments: true,
        sessionDesignations: true,
        allergies: { include: { allergyLabel: true } },
        switchRequests: { where: { sessionId, status: SwitchStatus.PENDING } }
      }
    },
    offering: { include: { activity: true, area: true } }
  }
})
```

Also fetch all registrations for the session to populate each camper's full schedule in the context card (or fetch per-camper on demand when expanded).

### Step 2 — Offerings browser
```ts
prisma.activityOffering.findMany({
  where: { sessionId, period: lockedPeriod, active: true, visibleForCamperRegistration: true },
  include: {
    activity: true,
    area: true,
    staffAssignments: { include: { staff: { select: { firstName: true, lastName: true } } } },
    _count: { select: { registrations: { where: { status: { in: activeRegistration }, registrationRole: CAMPER } } } }
  }
})
```

Run `validateRegistration()` server-side for each offering with the target camper's data to pre-compute eligibility verdicts.

### Roster on-demand
```ts
// GET /api/switches/offering-roster?offeringId=...
prisma.registration.findMany({
  where: { offeringId, status: { in: activeRegistration }, registrationRole: CAMPER },
  include: { camper: { include: { cabin: true, weekEnrollments: true } } },
  orderBy: [{ camper: { lastName: 'asc' } }]
})
```

---

## 13. File Structure

```
src/
  app/
    layout.tsx                       ← Fetch pending switch count here, pass to AppShell
    switches/
      page.tsx                       ← Hub: redesigned pending cards + outbound + history
      new/
        page.tsx                     ← Step 1: camper search (server component + client search)
        destination/
          page.tsx                   ← Step 2: offerings browser
        confirm/
          page.tsx                   ← Step 3: review & submit
      new-staff/
        page.tsx                     ← Step 1: staff search
        destination/
          page.tsx                   ← Step 2: staff offerings browser
        confirm/
          page.tsx                   ← Step 3: staff review & submit
      actions.ts                     ← Update existing + add immediateApproveSwitch action
    api/
      switches/
        offering-roster/
          route.ts                   ← Protected GET: roster for an offering

  components/
    switches/
      camper-search.tsx              ← Client component: search input + result list + context card
      offering-card.tsx              ← Client component: offering card with expandable roster
      switch-impact-panel.tsx        ← Shared: side-by-side leaving/joining cards (used in Step 3 and hub)
      pending-switch-card.tsx        ← Redesigned pending review card with inline deny reason
      outbound-requests.tsx          ← Section for submitter's cross-area pending requests
    app-shell.tsx                    ← Add pendingSwitchCount prop + nav badge rendering
```

---

## 14. Implementation Order (suggested)

1. **Hub page card redesign** — highest impact, standalone, no new routes needed. Redesign `pending-switch-card` with the side-by-side impact layout and inline deny reason.
2. **Navigation badge** — small change to AppShell, requires pending count fetched in layout.
3. **Step 1: Camper search** — new route, client-side search component, context card.
4. **Step 2: Offerings browser** — new route, offering cards with eligibility verdicts, roster on-demand API.
5. **Step 3: Confirm** — new route, impact panel, cross-area callout, submit/approve-immediately actions.
6. **Deep-link entry points** — add "Start switch" links in Rosters, Area Dashboard, Global Search.
7. **Staff switch wizard** — same structure, simpler eligibility logic.
8. **History table filters** — URL-param filtering on hub page.
