# Codex Master Prompt - Camp Walden Kitchen App

Paste the prompt below into Codex.

```text
Build the Camp Walden Kitchen App MVP as a separate application in this repository.

Before coding, read and follow these repo files:
- AGENTS.md
- PROJECT_BRIEF.md
- KITCHEN_VISUAL_GUIDE.md
- CODEX_MASTER_PROMPT.md

Boundary requirement:
- The current A/B operations app lives in app_files/.
- Leave app_files/ unchanged.
- Put the new Kitchen App in a new top-level folder named kitchen_app/.
- The Kitchen App should have its own package.json, Next.js app, Prisma schema, seed data, README, and environment example.
- Use the existing A/B app only as visual inspiration for Camp Walden branding and operational layout.

Visual direction:
- Follow KITCHEN_VISUAL_GUIDE.md.
- Build a modern camp operations platform, not a restaurant POS.
- Use a dark forest-green sidebar, clean white/off-white content panels, rounded operational cards, readable tables, and clear print-friendly views.
- Keep the UI desktop-first and mobile-friendly.
- Use vendor tags consistently: Van Eerden light green, GFS light red.
- Public menu and meal production reports must print cleanly.

Tech stack:
- Next.js
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL / Neon-compatible DATABASE_URL

Product purpose:
This is a Camp Walden Kitchen Operations platform. It is not a POS, restaurant sales system, or live inventory system.

Out of scope:
- Live inventory
- Inventory deductions
- POS
- Sales dashboards
- Food-cost dashboards
- Sysco references or integrations
- USA Diving references

Vendors:
- Van Eerden
- GFS

Vendor color tags:
- Van Eerden = light green
- GFS = light red

Roles:
- Main Admin
- Food Service Director
- Kitchen Manager
- Cook
- Viewer

Food Service Director sits directly below Main Admin.

Core workflow:
Menu -> Meal Production Report -> Order Builder -> Vendor-specific purchase sheets

Build these MVP screens:

1. Dashboard
Show today's menu, quick links, upcoming order reminders, prep checklist status, domestic schedule summary, and international schedule summary.

2. Menu Editor
Provide calendar view, spreadsheet view, and day view. Support add item, remove item, replace item, undo recent change, save draft, and publish menu.

3. Public Menu
Printable camper/staff-facing menu. No SKUs. No vendor details.

4. Internal Production Menu
Show menu item, vendor, SKU/product number, pack size, case size, servings per case, suggested quantity, notes, and vendor color tag.

5. Meal Production Reports
Core feature. Editable report that shows what products and quantities are needed for a meal at an expected count.
Example: Spaghetti Dinner, expected count 425, VE#93928 Stanislaus tomato product - 6 cans, ground beef - 8 cases, garlic bread - 18 loaves.
Do not depend on full recipe entry yet. Use editable meal templates and serving assumptions.

6. Product Library
Searchable table and detail view. Fields: vendor, SKU/product number, product name, brand, pack size, case size, unit size, servings per case, notes, active flag. Allow multiple approved products per menu item.

7. Order Builder
Side-by-side layout. Left side: selected menu week and meal reports. Right side: suggested order lines. Allow manual quantity adjustment, vendor filtering, and draft export views for GFS and Van Eerden purchase sheets.

8. Prep Checklists
Breakfast Bar, Salad Bar, and Daily Prep checklist types. Support checkboxes, initials, completion date/time, and notes.

9. Domestic Staff Schedule
Weekly schedule with employee, date, start time, end time, role/assignment, break notes, and total hours.

10. International Staff Schedule
Separate from domestic scheduling. Include an Assignments tab with Hotline, Dishes, Prep, and Mess Hall. Include a Break Schedule tab with Breakfast Break, Break 1, Lunch, Break 2, and Dinner.

Database models to include:
User, MenuWeek, MenuDay, Meal, MealItem, Vendor, VendorProduct, MenuItemProduct, MealTemplate, MealTemplateProduct, MealReport, MealReportLine, OrderPlan, OrderLine, PrepChecklist, PrepItem, DomesticEmployee, DomesticShift, InternationalWorker, InternationalAssignment, InternationalBreakSchedule.

Seed data:
- Spaghetti Dinner
- Chicken Nuggets
- Taco Night
- Breakfast Bar checklist
- Salad Bar checklist
- Sample GFS products
- Sample Van Eerden products, including VE#93928 Stanislaus tomato product
- Sample domestic schedule
- Sample international assignment schedule
- Sample international break schedule

Implementation requirements:
- Make the app runnable from kitchen_app/.
- Add kitchen_app/.env.example.
- Add kitchen_app/README.md with setup, development commands, seed instructions, and completion notes.
- Add realistic empty states.
- Keep UI desktop-first and mobile-friendly.
- Use clean Camp Walden camp-operations styling, not restaurant POS styling.
- Prefer simple, reliable CRUD over complex automation.
- Add basic validation.
- Add demo seed data so the MVP is reviewable immediately.

Validation before finishing:
- Run npm install if needed.
- Run typecheck/build if feasible.
- Report any commands that could not be run.
- Summarize completed features and remaining stubs in kitchen_app/README.md.

Deliverable:
A working Kitchen App MVP in kitchen_app/ with no app_files/ changes.
```
