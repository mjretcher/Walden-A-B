# Registration Day — Event Access + Mess Hall Registration Flow

## Problem

Final Q3 (Session 2) camper registration happens live in the mess hall with 25–30
staff, each on their own device (mostly phones). The existing `/registration`
screen requires a `User` login, and minting 30 throwaway accounts under one
Exec's supervision is unmanageable and pollutes the user table. The admin
registration screen is also too dense for one-day guest use on phones.

## Solution overview

A **Registration Day event** system, Kahoot-style:

1. Exec Admin opens **Admin → Registration Day**, creates an event (name +
   registration window, default inferred from the active session). The system
   generates a short join code (6 chars, unambiguous alphabet) and a QR that
   encodes `/join?code=XXXXXX`.
2. Staff scan the QR (or type the code) at the public **`/join`** page, type
   their **name**, and receive a signed guest cookie. No `User` row is created —
   a `RegistrationEventGuest` row records who they are.
3. Guests land on **`/event-registration`**: a mobile-first flow —
   search camper → A/B card with the camper's current schedule → tap an empty
   period → pick an offering (live seat counts, eligibility hints) → confirm.
   Filled slots can be removed. Window is hard-locked to the event's window.
4. Exec watches a **live dashboard** on the admin page: joined guests, a recent
   registrations feed, and per-offering fill bars. Closing the event instantly
   invalidates every guest session.

## Decisions (from Mike)

- Guests **can override** capacity/eligibility, but must type the approving
  **Area Head's name** (server-enforced, same as today's override paper trail).
- **Typed name at join** is sufficient attribution — no per-area codes.
- Guests **can remove** registrations (no area scoping for guests).
- **Full camp** is searchable for every guest.
- Mobile-first (phones dominate).
- The existing `/registration` admin screen stays untouched; the guest flow is
  a separate route.

## Schema

```prisma
model RegistrationEvent {
  id                 String             @id @default(cuid())
  sessionId          String
  name               String
  code               String             @unique   // normalized uppercase
  registrationWindow RegistrationWindow
  active             Boolean            @default(true)
  createdByUserId    String?
  closedAt           DateTime?
  // relations: session, createdBy (User), guests
}

model RegistrationEventGuest {
  id         String   @id @default(cuid())
  eventId    String
  name       String
  joinedAt   DateTime @default(now())
  lastSeenAt DateTime @default(now())
  userAgent  String?
  // relations: event (cascade), registrations
}

// Registration gains:
eventGuestId String?   // attribution for guest-made registrations
```

`approvedByUserId` is already nullable — guest registrations leave it null and
set `eventGuestId` + `counselorApproval` (guest's name, or the Area Head's name
on overrides, matching existing behavior).

Only **one event is active at a time** — creating a new one closes any prior
active event.

## Auth model (`src/lib/event-auth.ts`)

- Guest cookie `walden_event_guest`: HMAC-signed payload
  `{ guestId, eventId, expiresAt }` using the existing `SESSION_SECRET`.
  Expires at the same daily 11:55 PM ET cutoff as user sessions.
- `getCurrentEventGuest()` verifies the cookie, loads the guest **and checks the
  event is still active** — closing the event is the kill switch. Bumps
  `lastSeenAt` (throttled to ~30s) so the dashboard shows who's live.
- Deliberately separate from the user cookie: a guest session grants access to
  exactly the event-registration surface, nothing else. `requireUser()` paths
  never see it.

## API

- `POST /api/event/join` — public, rate-limited by IP. Validates code against
  the active event, creates the guest, sets the cookie. Audit-logged.
- `POST /api/event/leave` — clears the guest cookie.
- `GET /api/event/offerings` — fresh per-offering counts for the event window
  (guest or user). Guests poll this + call after each save.
- `GET /api/event/live` — Exec-only dashboard payload: guests w/ last-seen,
  recent registrations feed, offering fills.
- **`/api/registration` (extended, not duplicated)** — POST/DELETE now resolve
  an actor: real `User` first, else event guest. Guest rules:
  - `registrationWindow` is **forced** to the event's window (body value ignored)
  - `canOverride = true`, but `overrideApprovedBy` (Area Head name) is required —
    existing server check enforces this
  - Area-Head area-scoping checks don't apply (guests aren't Area Heads)
  - `approvedByUserId = null`, `eventGuestId = guest.id`,
    `counselorApproval` defaults to the guest's name
  - DELETE allowed with no area restriction
  All validation (eligibility, swim/unit rules, CA/TA rules, two-period
  pairing, waitlists) and the `FOR UPDATE` capacity locking are **unchanged and
  shared** — no parallel registration path.
- `/api/campers/[id]/schedule` — accepts guest sessions (read-only schedule).

## Pages

- `/join` (public): code + name form; QR prefills the code. Redirects to
  `/event-registration` if a valid guest session already exists.
- `/event-registration` (guest-only): mobile-first client flow described above.
  Sticky header with guest name + window chip + leave. Search (client-side over
  a light camper list), camper card with A Day / B Day sections × periods 1–4,
  bottom-sheet offering picker with seat pills, waitlist and override flows,
  optimistic count updates + periodic refresh.
- `/admin/registration-day` (Exec-only, in Admin nav): create/close event,
  big code display + server-rendered QR SVG + join URL, live dashboard
  (5s poll) with guest list, registration feed, fill bars.

## Non-goals

- No changes to `/registration`, Right Now, or any report.
- No offline support; the mess hall has wifi.
- No per-guest camper scoping.
