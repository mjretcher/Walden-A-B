# Staff Housing: Locations & Rooms

## Problem

`/bunk-management/staff-housing` currently groups staff by a free-text
`Staff.housingLabel` string with no structure. Staff House actually has ~13
separate rooms, each with its own bed count and its own occupants, and none
of that is representable today.

## Data model

Two new tables, additive only -- `Staff.housingLabel` is untouched and kept
in sync as a derived display string so every other screen that reads it
(search, scream session board, registration-assignments report, staff
quick-edit, CampMinder import matching) keeps working with zero changes.

```prisma
model HousingLocation {
  id        String   @id @default(cuid())
  name      String   @unique
  sortOrder Int      @default(0)
  rooms     HousingRoom[]
  staff     Staff[]        // staff assigned directly to the location (no room)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model HousingRoom {
  id         String   @id @default(cuid())
  locationId String
  name       String         // "Room 1", "Attic", etc.
  bedCount   Int?
  sortOrder  Int      @default(0)
  location   HousingLocation @relation(fields: [locationId], references: [id], onDelete: Cascade)
  staff      Staff[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([locationId, name])
}
```

`Staff` gains `housingLocationId` / `housingRoomId` (both optional, both
`onDelete: SetNull` so a delete can never hard-fail or corrupt data --
the delete actions additionally *require* a location/room be empty before
allowing the delete at all, so SetNull is a defense-in-depth backstop, not
the primary safety mechanism).

Rooms are optional per location (per Mike: some locations like Off Camp or
Karen's Condo stay flat; Staff House gets rooms). A location with zero rooms
takes staff directly; a location with 1+ rooms takes staff on a specific
room (or "no room yet" within that location, so admins can move someone into
Staff House before assigning the exact room).

## Sync behavior

Every assignment made from the new Staff Housing page updates, in one
transaction:
- `housingLocationId` / `housingRoomId`
- `housingLabel` := `location.name` (flat) or `"{location.name} — {room.name}"` (room)

Bed capacity is **soft-enforced**: saving an assignment that pushes a room
over its `bedCount` still succeeds, but the action returns a warning string
the UI surfaces inline, and the room's `CapacityPill` turns red everywhere
it's shown. This matches "warn, don't block" -- housing overflow is a real
situational thing (a last-minute hire, a swap) and shouldn't be a hard wall.

## Backward compatibility with legacy free-text edits

Two other places still let someone type `housingLabel` directly:
`updateStaffProfile` (staff profile page) and `updateStaffCabin` (staff
quick-edit popover + staff list "Custom housing" input). Both now clear
`housingLocationId`/`housingRoomId` when the free-text label changes, so a
manual text edit elsewhere can't leave a stale/incorrect room link behind.
`updateStaffProfile` only clears the FKs if the label actually changed (it
saves the whole profile form on every submit, not just housing).

## Legacy migration

Existing `housingLabel` values (e.g. "Off Camp", "Karen's Condo" typed in
before this feature existed) aren't retroactively linked. A banner appears
on the Staff Housing page when staff have a `housingLabel` but no
`housingLocationId`, with a one-click "Import as locations" action that
creates a flat `HousingLocation` per distinct legacy label and links those
staff to it (never touches Staff House-style room granularity -- that has to
be set up by hand since the old data has no room information).

Default locations (Staff House, Nurse Cabin, Health Center, Out of Cabin,
Office, Leadership House -- the old hardcoded suggestion list) are
seeded once via idempotent `createMany({ skipDuplicates: true })` on page
load so Mike doesn't have to retype them.

## UI (`/bunk-management/staff-housing`)

- "+ New location" form at the top.
- One card per location: editable name (click to rename), delete (only
  enabled when the location has no rooms and no direct staff), "+ Add room"
  mini-form (name + bed count).
  - If it has rooms: each room is its own row with editable name/bed count,
    a `CapacityPill` (count/bedCount), delete (only when empty), and its
    staff listed underneath.
  - If it has no rooms: staff listed directly under the location.
- "Unassigned" card at the end for staff with no location at all.
- Each staff row keeps today's single-dropdown feel: one `<select>` listing
  every valid location/room combo plus "-- None --", instant-save on
  change (no separate submit button), matching the `AutoSubmitForm`
  instant-interaction pattern used elsewhere in Bunk Management.
