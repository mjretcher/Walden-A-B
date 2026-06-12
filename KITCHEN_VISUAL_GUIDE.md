# Camp Walden Kitchen App Visual Guide

## Design goal

The Kitchen App should look like a modern camp operations platform: calm, practical, clear, and fast to use during a busy kitchen day.

It should not look like a restaurant POS, retail inventory system, or generic SaaS dashboard.

## Visual reference from planning

The approved direction from the planning mockup is:

- Dark forest-green left sidebar
- Clean white and off-white content panels
- Rounded cards
- Clear section headers
- Table-heavy operational layouts
- Large readable labels
- Minimal visual clutter
- Practical desktop-first screens
- Mobile-friendly responsive behavior

## Overall layout

Use a persistent app shell:

- Left sidebar navigation on desktop
- Collapsible/top navigation on mobile
- Main content area with page title, page description, and primary actions
- Dashboard cards and tables inside white panels
- Print-friendly views for menus and reports

Recommended navigation groups:

Dashboard
- Today's Snapshot

Menus
- Menu Editor
- Public Menu
- Internal Production Menu
- Meal Production Reports

Ordering
- Product Library
- Order Builder

Prep
- Prep Checklists

Scheduling
- Domestic Schedule
- International Schedule

Admin
- Users
- Settings

## Color direction

Primary brand color:
- Deep forest green

Background:
- Soft off-white / very light green-gray

Cards:
- White

Text:
- Slate / near black for readability

Accent colors:
- Lake blue sparingly for links and secondary actions
- Amber for attention/warnings
- Red only for problems or GFS vendor tag
- Green for success and Van Eerden vendor tag

Vendor tags:
- Van Eerden: light green tag/background
- GFS: light red tag/background

Do not overuse color. Most screens should feel calm and operational.

## Typography and density

The kitchen staff may use this quickly while working, so favor:

- Large readable table text
- Strong headings
- Clear buttons
- High contrast
- Consistent spacing
- Fewer decorative elements

Use compact tables where needed, but avoid tiny text.

## Screen-specific guidance

### Dashboard

Purpose: quick operations snapshot, not analytics.

Show:
- Today's breakfast, lunch, dinner, snack
- Prep status
- Domestic schedule summary
- International assignment summary
- Order reminders
- Quick links

Avoid:
- Sales metrics
- Food-cost charts
- Inventory value summaries

### Menu Editor

This is a flagship screen.

Provide three views:
- Calendar view for planning weeks
- Spreadsheet view for fast bulk editing
- Day view for detailed meal/item editing

Actions should be obvious:
- Add item
- Replace item
- Remove item
- Undo
- Save draft
- Publish
- Print

### Public Menu

This should resemble the existing camp menu spreadsheet style:
- Week/day layout
- Breakfast, lunch, dinner, snack columns
- Clean printable view
- No vendor SKUs
- No product numbers
- No internal notes

### Internal Production Menu

Same menu structure, but with operational details:
- Vendor tag
- SKU/product number
- Pack size
- Servings per case
- Suggested quantity
- Notes

Use vendor colors lightly:
- Van Eerden light green
- GFS light red

### Meal Production Reports

This is one of the most important screens.

It should answer:
"What do we need to pull/prepare for this meal at this count?"

Use a clear report format:
- Meal name
- Date
- Meal period
- Expected count
- Product lines
- Vendor
- SKU
- Quantity needed
- Pack/case details
- Production notes

Example:
Spaghetti Dinner, expected count 425:
- VE#93928 Stanislaus tomato product - 6 cans
- Ground beef - 8 cases
- Garlic bread - 18 loaves

### Product Library

Make this searchable and table-forward.

Important fields:
- Vendor
- SKU/product number
- Product name
- Brand
- Pack size
- Case size
- Unit size
- Servings per case
- Notes
- Preferred/alternate status

### Order Builder

Use a side-by-side layout:

Left side:
- Selected week/menu
- Meal reports

Right side:
- Suggested order lines
- Vendor filter
- Quantity adjustments
- Draft export buttons for GFS and Van Eerden

### Prep Checklists

Use simple checklist UI:
- Checkbox
- Item
- Quantity or container note
- Initials
- Completion time
- Notes

Support Breakfast Bar, Salad Bar, and Daily Prep.

### Domestic Schedule

Use a weekly schedule table.

Fields:
- Employee
- Date
- Start time
- End time
- Role/assignment
- Break notes
- Total hours

### International Schedule

Keep separate from domestic scheduling.

Use tabs:
- Assignments
- Break Schedule

Assignments include:
- Hotline
- Dishes
- Prep
- Mess Hall

Break schedule includes:
- Breakfast Break
- Break 1
- Lunch
- Break 2
- Dinner

## Interaction standards

Prefer direct editing and clear confirmation states.

Use:
- Inline table editing where practical
- Modal or side panel for detailed edits
- Toasts for save/publish confirmation
- Undo for menu edits
- Empty states with clear next action

## Print standards

Public menu and meal production reports must print cleanly.

Print views should hide:
- Sidebar
- Navigation
- Buttons
- Filters

Print views should keep:
- Camp Walden title
- Week/date
- Meal names
- Production details when internal

## Accessibility and reliability

- Use semantic buttons and labels
- Keep contrast strong
- Avoid color-only meaning; vendor names should appear next to color tags
- Make tables readable on laptops
- Ensure forms validate required fields

## What to avoid

Avoid:
- Restaurant POS design
- Cash register / sales language
- Inventory valuation dashboards
- Heavy animation
- Tiny dense text everywhere
- Overly decorative icons
- Generic corporate SaaS look
