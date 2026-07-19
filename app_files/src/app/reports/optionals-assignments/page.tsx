import { Period, UserRole } from "@prisma/client";
import { staffRoleSuffix } from "@/lib/bunk-staff-tags";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { Field, PageHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";
import { getSlotTimes, periodSlot } from "@/lib/period-times";
import { buildOptionalsAvailability, OPTIONALS_A_PERIODS, OPTIONALS_B_PERIODS, optionalsAssignmentRowKey, type OptionalsAvailabilityEntry } from "@/lib/optionals-assignments";
import { OptionalsAssignmentEditorSections, type OptionalsPeriodSection, type OptionalsRowData } from "./editor-sections";
import { saveOptionalsAssignments } from "./actions";

type SearchParams = { reportId?: string };
type StaffOption = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  position: string | null;
  position2: string | null;
  statusCertification: string | null;
  housingLabel: string | null;
  cabin: { name: string } | null;
  primaryArea: { name: string } | null;
  skills: { name: string }[];
  certifications: { name: string }[];
};
type SavedRow = { period: Period; label: string; staffId: string | null; customStaffName: string | null; sortOrder: number };

export default async function OptionalsAssignmentsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};
  const [session, reports, staff, slotTimes] = await Promise.all([
    prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } }),
    prisma.optionalsAssignmentReport.findMany({ orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.staff.findMany({
      where: { active: true, screamEligible: true },
      include: {
        cabin: { select: { name: true } },
        primaryArea: { select: { name: true } },
        certifications: { select: { name: true } },
        skills: { select: { name: true } }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    getSlotTimes()
  ]);

  const selectedReportId = params.reportId ?? reports[0]?.id;
  const report = selectedReportId
    ? await prisma.optionalsAssignmentReport.findUnique({
        where: { id: selectedReportId },
        include: { rows: { orderBy: [{ period: "asc" }, { sortOrder: "asc" }] } }
      })
    : null;
  const rows: SavedRow[] = report?.rows ?? [];
  const selectedStaffIds = new Set(rows.map((row) => row.staffId).filter((id): id is string => Boolean(id)));
  const staffOptions: StaffOption[] = staff.filter((member) => member.active || selectedStaffIds.has(member.id));
  const label = report?.label ?? (session ? `${session.name} Optionals` : "Optionals");
  const dateValue = report?.reportDate ? toDateInputValue(report.reportDate) : "";

  // "Available activities" pulled in purely to power the datalist
  // autocomplete on each row -- picking one just fills in the text, it
  // never links the row to the underlying Activity/ActivityOffering
  // record. This keeps the report free-typed (so Mike can list anything,
  // including things not in the system) while still making the common
  // case -- picking a real activity -- fast.
  const activities = session
    ? await prisma.activity.findMany({
        where: { active: true, area: { active: true } },
        select: { name: true },
        orderBy: { name: "asc" }
      })
    : [];
  const activityNames = Array.from(new Set(activities.map((activity) => activity.name))).sort((a, b) => a.localeCompare(b));

  // Who's free to help run the optionals that are actually scheduled --
  // staff marked off, or staff whose Scream Session assignment this period
  // is to a class that isn't one of the ones going. Computed off the last
  // SAVED rows (not any in-progress unsaved edits in the browser), so it
  // updates the moment you hit "Save report."
  const availabilityByPeriod = session ? await buildOptionalsAvailability(session.id, rows) : new Map<Period, OptionalsAvailabilityEntry[]>();
  // Server → Client props have to be plain serializable data, not a Map.
  const availabilityByPeriodPlain: Record<string, OptionalsAvailabilityEntry[]> = Object.fromEntries(availabilityByPeriod);

  const aSections = buildSections(OPTIONALS_A_PERIODS, rows);
  const bSections = buildSections(OPTIONALS_B_PERIODS, rows);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Optionals Assignments"
        eyebrow="Reports"
        description="Hand-pick which activities are open as optionals each period, and who's running them. Once saved, each period also shows who's free to help — off, in a class that isn't running, or just unassigned. Printing produces an A-day sheet and a B-day sheet."
        backHref="/reports"
        backLabel="Back to Reports"
      >
        <PrintButton label="Print A & B sheets" />
      </PageHeader>

      <section className="no-print mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
        <form action="/reports/optionals-assignments" className="grid gap-3 lg:grid-cols-[1fr_auto]" method="get">
          <Field label="Saved report">
            <select className={inputClass} defaultValue={report?.id ?? ""} name="reportId">
              <option value="">New report</option>
              {reports.map((savedReport) => (
                <option key={savedReport.id} value={savedReport.id}>
                  {savedReport.label} {savedReport.reportDate ? `- ${toDateInputValue(savedReport.reportDate)}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <button className={`${secondaryButtonClass} self-end`} type="submit">Open</button>
        </form>
      </section>

      <form action={saveOptionalsAssignments} className="optionals-assignment-workspace">
        <input name="reportId" type="hidden" value={report?.id ?? ""} />
        <input name="sessionId" type="hidden" value={session?.id ?? ""} />

        <section className="no-print rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <Field label="Report name">
              <input className={inputClass} name="label" defaultValue={label} />
            </Field>
            <Field label="Date">
              <input className={inputClass} name="reportDate" type="date" defaultValue={dateValue} />
            </Field>
            <div className="flex items-end">
              <button className={buttonClass} type="submit">Save report</button>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Type any activity name (a datalist suggests existing camp activities, but you can enter anything). Staff assignment is optional — leave blank if nobody&rsquo;s attached yet.
          </p>
        </section>

        <OptionalsAssignmentEditorSections
          sections={[...aSections, ...bSections]}
          activityNames={activityNames}
          staffOptions={staffOptions}
          availabilityByPeriod={availabilityByPeriodPlain}
        />

        <PrintSheet day="A" label={label} sections={aSections} staffOptions={staffOptions} slotTimes={slotTimes} />
        <PrintSheet day="B" label={label} sections={bSections} staffOptions={staffOptions} slotTimes={slotTimes} />
      </form>
      <OptionalsAssignmentPrintStyles />
    </AppShell>
  );
}

function PrintSheet({
  day,
  label,
  sections,
  staffOptions,
  slotTimes
}: {
  day: "A" | "B";
  label: string;
  sections: OptionalsPeriodSection[];
  staffOptions: StaffOption[];
  slotTimes: Awaited<ReturnType<typeof getSlotTimes>>;
}) {
  return (
    <section className="optionals-assignments-paper print-only" aria-label={`Printable ${day} day optionals sheet`}>
      <header className="optionals-assignments__header">
        <h2>Optionals — {day} Day</h2>
        <span className="optionals-assignments__subtitle">{label}</span>
      </header>
      <div className="optionals-assignments__layout">
        {sections.map((section) => (
          <PrintSection
            key={section.period}
            section={section}
            staffOptions={staffOptions}
            timeLabel={slotTimes[periodSlot(section.period as Period)]?.label}
          />
        ))}
      </div>
    </section>
  );
}

function PrintSection({
  section,
  staffOptions,
  timeLabel
}: {
  section: OptionalsPeriodSection;
  staffOptions: StaffOption[];
  timeLabel: string | undefined;
}) {
  const visibleRows = section.rows.filter((row) => row.label || row.staffId || row.customStaffName);
  return (
    <section className={`optionals-assignments__section optionals-assignments__section--${section.period.toLowerCase()}`}>
      <h3>
        Period {section.periodLabel}
        {timeLabel ? <span className="optionals-assignments__time"> · {timeLabel}</span> : null}
      </h3>
      <div className="optionals-assignments__rows">
        {visibleRows.length === 0 ? (
          <div className="optionals-assignments__row optionals-assignments__row--empty">No optionals scheduled</div>
        ) : (
          visibleRows.map((row) => {
            const assignedStaff = staffOptions.find((staff) => staff.id === row.staffId);
            // Leadership tag (UH/UP/BSH/GSH) on real staff records only.
            const staffName = row.customStaffName || (assignedStaff ? `${assignedStaff.firstName} ${assignedStaff.lastName}${staffRoleSuffix(assignedStaff)}` : "");
            return (
              <div className="optionals-assignments__row" key={row.key}>
                <span className="optionals-assignments__activity">{row.label || "(unnamed)"}</span>
                {staffName ? <span className="optionals-assignments__print-name"> — {staffName}</span> : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function buildSections(periods: Period[], rows: SavedRow[]): OptionalsPeriodSection[] {
  return periods.map((period) => {
    const periodRows = rows
      .filter((row) => row.period === period)
      .map((row, index) => ({
        key: optionalsAssignmentRowKey(period, index),
        period,
        label: row.label,
        staffId: row.staffId ?? "",
        customStaffName: row.customStaffName ?? "",
        sortOrder: row.sortOrder
      }));
    const editableRows: OptionalsRowData[] = periodRows.length
      ? periodRows
      : [
          {
            key: optionalsAssignmentRowKey(period, 0),
            period,
            label: "",
            staffId: "",
            customStaffName: "",
            sortOrder: 0
          }
        ];
    return { period, periodLabel: PERIOD_LABEL[period], rows: editableRows };
  });
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function OptionalsAssignmentPrintStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          @page optionalsAssignmentsSheet { size: letter portrait; margin: 0.2in; }

          .optionals-assignments-paper {
            --ink: #111;
            background: #fffdf8;
            border: 3px solid var(--ink);
            color: var(--ink);
            font-family: "Comic Sans MS", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif;
            margin: 0 auto 0.3in;
            page-break-after: always;
            padding: 0;
            width: 7.8in;
          }

          .optionals-assignments-paper:last-child { page-break-after: auto; }

          .optionals-assignments__header {
            align-items: baseline;
            border-bottom: 3px solid var(--ink);
            display: flex;
            gap: 0.15in;
            padding: 0.14in 0.2in 0.1in;
          }

          .optionals-assignments__header h2 {
            font-size: 0.32in;
            font-weight: 900;
            letter-spacing: 0.006em;
            line-height: 1;
            margin: 0;
            text-transform: uppercase;
            white-space: nowrap;
          }

          .optionals-assignments__subtitle {
            font-size: 0.13in;
            font-weight: 700;
            opacity: 0.75;
          }

          .optionals-assignments-paper .optionals-assignments__layout {
            display: grid !important;
            gap: 0;
            grid-template-columns: 1fr 1fr !important;
          }

          .optionals-assignments-paper .optionals-assignments__section {
            border-bottom: 3px solid var(--ink) !important;
            border-right: 3px solid var(--ink) !important;
            min-height: 1.6in;
            padding: 0.12in 0.16in;
          }

          .optionals-assignments-paper .optionals-assignments__section:nth-child(2n) { border-right: 0 !important; }
          .optionals-assignments-paper .optionals-assignments__section:nth-last-child(-n+2) { border-bottom: 0 !important; }

          .optionals-assignments__section h3 {
            display: block;
            font-size: 0.19in;
            font-weight: 900;
            line-height: 1.15;
            margin: 0 0 0.09in;
            text-decoration-line: underline;
            text-decoration-style: wavy;
            text-decoration-thickness: 1.3px;
            text-transform: uppercase;
            text-underline-offset: 0.04in;
          }

          .optionals-assignments__time {
            font-size: 0.12in;
            font-weight: 600;
            text-decoration: none;
            text-transform: none;
          }

          .optionals-assignments__rows { display: grid; gap: 0.05in; }

          .optionals-assignments__row {
            font-size: 0.12in;
            line-height: 1.25;
          }

          .optionals-assignments__row--empty {
            font-size: 0.1in;
            font-style: italic;
            font-weight: 600;
            opacity: 0.55;
            text-transform: none;
          }

          .optionals-assignments__activity {
            font-weight: 900;
            text-transform: uppercase;
          }

          .optionals-assignments__print-name {
            font-size: 0.11in;
            font-weight: 700;
          }

          @media screen {
            .print-only.optionals-assignments-paper { display: none; }
          }

          @media print {
            .optionals-assignment-workspace { display: block !important; page: optionalsAssignmentsSheet; }
            .print-only.optionals-assignments-paper { display: block !important; }
            body, main { background: white !important; margin: 0 !important; padding: 0 !important; }
          }
        `
      }}
    />
  );
}
