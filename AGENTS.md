# Camp Walden Kitchen App - Agent Instructions

## Product identity

This repo is for the Camp Walden kitchen operations app. Build a modern camp operations platform for AB Walden food service.

Do not build generic restaurant software.
Do not build a POS.
Do not build live inventory.
Do not reference USA Diving.
Do not reference Sysco.

## Required vendors

Only these vendors are in scope:

- Van Eerden
- GFS

Vendor color rules:

- Van Eerden: light green
- GFS: light red

The same food/menu item may have multiple approved vendor products with different SKUs, pack sizes, case quantities, and serving assumptions.

## Core workflow

The app should support this practical kitchen workflow:

Menu -> Meal Production Report -> Order Builder -> Vendor-specific purchase sheets

Live inventory is intentionally out of scope because Camp Walden moves too quickly to maintain accurate real-time inventory.

## Primary roles

- Main Admin
- Food Service Director
- Kitchen Manager
- Cook
- Staff Viewer

Food Service Director sits directly below the main admin account.

## MVP modules

1. Dashboard
2. Menu Editor
3. Public Menu View
4. Internal Production Menu
5. Meal Production Reports
6. Product Library
7. Order Builder
8. Prep Checklists
9. Domestic Staff Schedule
10. International Staff Schedule

## Menu requirements

The menu editor must support:

- Calendar view
- Spreadsheet view
- Day view
- Item-level add, edit, remove, and replace
- Undo for recent selections/changes
- Draft and published states
- Public print menu similar to the existing camp menu spreadsheet
- Internal production menu with vendor SKUs, product numbers, suggested quantities, pack/case details, and vendor color coding

## Meal production reports

Meal production reports are more important than count sheets.

Example: for spaghetti dinner, the report should say what products and quantities are needed, such as:

- VE#93928 Stanislaus tomato product - 6 cans
- Ground beef - quantity based on serving assumptions
- Garlic bread - quantity based on meal count

Start with manual/editable templates. Recipe-driven scaling can be added later when recipes are uploaded.

## Scheduling requirements

Domestic and international scheduling must remain separate.

Domestic staff scheduling is traditional weekly/hourly scheduling.

International staff scheduling includes both:

- Station assignments, such as dishes, hotline, prep, and mess hall
- Break schedules, such as breakfast break, break 1, lunch, break 2, and dinner

## Prep requirements

Prep checklists should support breakfast bar, salad bar, and daily prep lists. Items should be checkable and allow initials/completion tracking.

## Technical direction

Preferred stack unless the existing repo already uses something different:

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui-style components
- Neon Postgres
- Drizzle ORM
- Auth.js or existing auth if already implemented

Before making large rewrites, inspect the existing app structure under app_files and preserve working functionality when practical.

## Quality bar

- Keep UI clean, operational, and desktop-first while remaining mobile-friendly.
- Use Camp Walden branding and a modern camp operations feel.
- Add seed/demo data where useful.
- Update README or implementation notes with completed work and remaining stubs.
- Avoid speculative features that are not in the approved scope.
