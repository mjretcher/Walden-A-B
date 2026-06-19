import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { Field, PageHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  REGISTRATION_ASSIGNMENT_BLANK_ROWS,
  REGISTRATION_ASSIGNMENT_EXTRA_SECTION,
  REGISTRATION_ASSIGNMENT_LEGACY_EXTRA_SECTION,
  REGISTRATION_ASSIGNMENT_SECTIONS,
  registrationAssignmentRowKey
} from "@/lib/registration-assignments";
import { RegistrationAssignmentEditorSections } from "./editor-sections";
import { saveRegistrationAssignments } from "./actions";

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
type SavedRow = { section: string; label: string; staffId: string | null; sortOrder: number; isCustom: boolean };
type AssignmentRowData = { key: string; label: string; staffId: string; sortOrder: number; isCustom: boolean };
type AssignmentSectionData = { name: string; className: string; rows: AssignmentRowData[] };

const ADDITIONAL_STAFF_LABEL = "Additional Staff";

export default async function RegistrationAssignmentsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const params = searchParams ? await searchParams : {};
  const [session, reports, staff] = await Promise.all([
    prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } }),
    prisma.registrationAssignmentReport.findMany({ orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.staff.findMany({
      include: {
        cabin: { select: { name: true } },
        primaryArea: { select: { name: true } },
        certifications: { select: { name: true } },
        skills: { select: { name: true } }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    })
  ]);
  const selectedReportId = params.reportId ?? reports[0]?.id;
  const report = selectedReportId
    ? await prisma.registrationAssignmentReport.findUnique({
        where: { id: selectedReportId },
        include: { rows: { orderBy: [{ section: "asc" }, { sortOrder: "asc" }] } }
      })
    : null;
  const rows = report?.rows ?? [];
  const customRows = rows.filter((row) => row.isCustom);
  const selectedStaff = new Set(rows.map((row) => row.staffId).filter((id): id is string => Boolean(id)));
  const staffOptions: StaffOption[] = staff.filter((member) => member.active || selectedStaff.has(member.id));
  const label = report?.registrationLabel ?? session?.name ?? "Registration Assignments";
  const dateValue = report?.registrationDate ? toDateInputValue(report.registrationDate) : "";
  const sections = buildSections(rows);
  const additionalRows = buildAdditionalRows(customRows);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Registration Assignments"
        eyebrow="Reports"
        description="Enter registration table assignments and any extra registration staff. Printing uses the classic one-page sheet."
      >
        <a className={`${secondaryButtonClass} no-print`} href="/reports">Reports</a>
        <PrintButton label="Print classic sheet" />
      </PageHeader>

      <section className="no-print mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
        <form action="/reports/registration-assignments" className="grid gap-3 lg:grid-cols-[1fr_auto]" method="get">
          <Field label="Saved report">
            <select className={inputClass} defaultValue={report?.id ?? ""} name="reportId">
              <option value="">New report</option>
              {reports.map((savedReport) => (
                <option key={savedReport.id} value={savedReport.id}>
                  {savedReport.registrationLabel} {savedReport.registrationDate ? `- ${toDateInputValue(savedReport.registrationDate)}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <button className={`${secondaryButtonClass} self-end`} type="submit">Open</button>
        </form>
      </section>

      <form action={saveRegistrationAssignments} className="registration-assignment-workspace">
        <input name="reportId" type="hidden" value={report?.id ?? ""} />
        <input name="sessionId" type="hidden" value={session?.id ?? ""} />

        <section className="no-print rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <Field label="Registration session/name">
              <input className={inputClass} name="registrationLabel" defaultValue={label} />
            </Field>
            <Field label="Date">
              <input className={inputClass} name="registrationDate" type="date" defaultValue={dateValue} />
            </Field>
            <div className="flex items-end">
              <button className={buttonClass} type="submit">Save report</button>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            All activity and assignment labels are editable. Use Add row at the bottom of any section. Staff dropdowns show cabin details, and likely lifeguards are marked with *.
          </p>
        </section>

        <RegistrationAssignmentEditorSections
          sections={sections}
          additionalRows={additionalRows}
          additionalSectionName={REGISTRATION_ASSIGNMENT_EXTRA_SECTION}
          staffOptions={staffOptions}
        />

        <section className="registration-assignments-paper print-only" aria-label="Printable registration assignments sheet">
          <header className="registration-assignments__header">
            <h2>Registration Assignments</h2>
          </header>
          <p className="registration-assignments__instructions">
            These people will work at the tables in the dining room during registration. All other staff are to remain with their campers throughout the day.
          </p>
          <PrintLayout sections={sections} additionalRows={additionalRows} staffOptions={staffOptions} />
        </section>
      </form>
      <RegistrationAssignmentPrintStyles />
    </AppShell>
  );
}

function PrintLayout({
  sections,
  additionalRows,
  staffOptions
}: {
  sections: AssignmentSectionData[];
  additionalRows: AssignmentRowData[];
  staffOptions: StaffOption[];
}) {
  const sectionByName = new Map(sections.map((section) => [section.name, section]));
  const left = ["Athletics", "Riding", "Media"].map((name) => sectionByName.get(name)).filter((section): section is AssignmentSectionData => Boolean(section));
  const middle = ["Waterfront", "Performing Arts"].map((name) => sectionByName.get(name)).filter((section): section is AssignmentSectionData => Boolean(section));
  const right = ["Arts & Crafts", "Outdoor Life", "Checkout"].map((name) => sectionByName.get(name)).filter((section): section is AssignmentSectionData => Boolean(section));
  right.push({ name: ADDITIONAL_STAFF_LABEL, className: "registration-assignments__section--additional", rows: additionalRows });

  return (
    <div className="registration-assignments__layout">
      <PrintColumn sections={left} staffOptions={staffOptions} />
      <PrintColumn sections={middle} staffOptions={staffOptions} />
      <PrintColumn sections={right} staffOptions={staffOptions} isLast />
    </div>
  );
}

function PrintColumn({ sections, staffOptions, isLast = false }: { sections: AssignmentSectionData[]; staffOptions: StaffOption[]; isLast?: boolean }) {
  return (
    <div className={`registration-assignments__column${isLast ? " registration-assignments__column--last" : ""}`}>
      {sections.map((section, index) => (
        <PrintSection key={section.name} className={section.className} name={section.name} rows={section.rows} staffOptions={staffOptions} isLast={index === sections.length - 1} />
      ))}
    </div>
  );
}

function PrintSection({
  className,
  name,
  rows,
  staffOptions,
  isLast = false
}: {
  className: string;
  name: string;
  rows: AssignmentRowData[];
  staffOptions: StaffOption[];
  isLast?: boolean;
}) {
  const visibleRows = rows.filter((row) => row.label || row.staffId);
  const flexGrow = Math.max(1, Math.min(visibleRows.length + 2, 14));

  return (
    <section className={`registration-assignments__section ${className}${isLast ? " registration-assignments__section--last" : ""}`} style={{ flexGrow, flexBasis: 0 }}>
      <h3>{name}</h3>
      <div className="registration-assignments__rows">
        {visibleRows.map((row) => {
          const assignedStaff = staffOptions.find((staff) => staff.id === row.staffId);
          const staffName = assignedStaff ? `${assignedStaff.firstName} ${assignedStaff.lastName}` : "";
          return (
            <div className="registration-assignments__row" key={row.key}>
              {row.label ? <span className="registration-assignments__slot-label">{row.label}:</span> : null}
              {staffName ? <span className="registration-assignments__print-name"> {staffName}</span> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function buildSections(rows: SavedRow[]): AssignmentSectionData[] {
  const rowLookup = new Map(rows.filter((row) => !row.isCustom).map((row) => [`${row.section}:${row.sortOrder}`, row]));
  const customRows = rows.filter((row) => row.isCustom);

  return REGISTRATION_ASSIGNMENT_SECTIONS.map((section) => {
    const savedCustomRows = customRows.filter((row) => row.section === section.name);
    const fixedRows = section.slots.map((slot, index) => ({
      key: registrationAssignmentRowKey(section.name, index),
      label: rowLookup.get(`${section.name}:${index}`)?.label ?? slot,
      staffId: rowLookup.get(`${section.name}:${index}`)?.staffId ?? "",
      sortOrder: index,
      isCustom: false
    }));
    const custom = [
      ...savedCustomRows.map((row, index) => ({
        key: registrationAssignmentRowKey(section.name, section.slots.length + index, true),
        label: row.label,
        staffId: row.staffId ?? "",
        sortOrder: section.slots.length + index,
        isCustom: true
      })),
      ...Array.from({ length: section.slots.length ? 0 : REGISTRATION_ASSIGNMENT_BLANK_ROWS }, (_, index) => ({
        key: registrationAssignmentRowKey(section.name, section.slots.length + savedCustomRows.length + index, true),
        label: "",
        staffId: "",
        sortOrder: section.slots.length + savedCustomRows.length + index,
        isCustom: true
      }))
    ];
    return { name: section.name, className: section.className, rows: [...fixedRows, ...custom] };
  });
}

function buildAdditionalRows(customRows: SavedRow[]): AssignmentRowData[] {
  const savedAdditional = customRows.filter((row) => row.section === REGISTRATION_ASSIGNMENT_EXTRA_SECTION || row.section === REGISTRATION_ASSIGNMENT_LEGACY_EXTRA_SECTION);
  return [
    ...savedAdditional.map((row, index) => ({
      key: registrationAssignmentRowKey(REGISTRATION_ASSIGNMENT_EXTRA_SECTION, index, true),
      label: row.label,
      staffId: row.staffId ?? "",
      sortOrder: index,
      isCustom: true
    })),
    ...Array.from({ length: REGISTRATION_ASSIGNMENT_BLANK_ROWS }, (_, index) => ({
      key: registrationAssignmentRowKey(REGISTRATION_ASSIGNMENT_EXTRA_SECTION, savedAdditional.length + index, true),
      label: "",
      staffId: "",
      sortOrder: savedAdditional.length + index,
      isCustom: true
    }))
  ];
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function RegistrationAssignmentPrintStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          @page registrationAssignmentsClassic { size: letter portrait; margin: 0.14in; }

          .registration-assignments-paper {
            --ink: #111;
            background: #fffdf8;
            border: 3px solid var(--ink);
            color: var(--ink);
            display: grid;
            font-family: "Comic Sans MS", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif;
            grid-template-rows: auto auto 1fr;
            height: 10.72in;
            margin: 0 auto;
            overflow: hidden;
            padding: 0;
            width: 8.22in;
          }

          .registration-assignments__header {
            border-bottom: 3px solid var(--ink);
            padding: 0.12in 0.22in 0.1in;
          }

          .registration-assignments__header h2 {
            font-size: 0.38in;
            font-weight: 900;
            letter-spacing: 0.01em;
            line-height: 1;
            margin: 0;
            text-transform: uppercase;
          }

          .registration-assignments__instructions {
            border-bottom: 3px solid var(--ink);
            font-size: 0.13in;
            font-weight: 900;
            line-height: 1.18;
            margin: 0;
            padding: 0.075in 0.18in;
            text-align: left;
            text-transform: uppercase;
          }

          .registration-assignments__layout {
            display: grid;
            grid-template-columns: 38% 34% 28%;
            min-height: 0;
          }

          .registration-assignments__column {
            border-right: 3px solid var(--ink);
            display: flex;
            flex-direction: column;
            min-height: 0;
          }

          .registration-assignments__column--last { border-right: 0; }

          .registration-assignments__section {
            border-bottom: 3px solid var(--ink);
            min-height: 0;
            overflow: hidden;
            padding: 0.075in 0.085in;
          }

          .registration-assignments__section--last { border-bottom: 0; }

          .registration-assignments__section h3 {
            display: inline-block;
            font-size: 0.17in;
            font-weight: 900;
            line-height: 1;
            margin: 0 0 0.055in;
            text-decoration-line: underline;
            text-decoration-style: wavy;
            text-decoration-thickness: 1.3px;
            text-transform: uppercase;
            text-underline-offset: 0.04in;
          }

          .registration-assignments__section--additional h3 {
            font-size: 0.125in;
            max-width: none;
            text-decoration: none;
          }

          .registration-assignments__rows {
            display: grid;
            gap: 0.006in;
          }

          .registration-assignments__row {
            display: block;
            min-height: 0.112in;
          }

          .registration-assignments__slot-label {
            font-size: 0.09in;
            font-weight: 900;
            line-height: 1;
            text-transform: uppercase;
            white-space: nowrap;
          }

          .registration-assignments__print-name {
            display: inline;
            font-size: 0.086in;
            font-weight: 700;
            line-height: 1;
            white-space: normal;
          }

          @media screen {
            .print-only.registration-assignments-paper { display: none; }
          }

          @media print {
            .registration-assignment-workspace { display: block !important; page: registrationAssignmentsClassic; }
            .print-only.registration-assignments-paper { display: grid !important; }
            body, main { background: white !important; margin: 0 !important; padding: 0 !important; }
          }
        `
      }}
    />
  );
}
