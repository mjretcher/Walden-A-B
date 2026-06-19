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
import { saveRegistrationAssignments } from "./actions";

type SearchParams = {
  reportId?: string;
};

type StaffOption = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
};

type SavedRow = {
  section: string;
  label: string;
  staffId: string | null;
  sortOrder: number;
  isCustom: boolean;
};

type AssignmentRowData = {
  key: string;
  label: string;
  staffId: string;
  sortOrder: number;
  isCustom: boolean;
};

type AssignmentSectionData = {
  name: string;
  className: string;
  rows: AssignmentRowData[];
};

const ADDITIONAL_STAFF_LABEL = "Additional Staff";

export default async function RegistrationAssignmentsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const params = searchParams ? await searchParams : {};
  const [session, reports, staff] = await Promise.all([
    prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } }),
    prisma.registrationAssignmentReport.findMany({ orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.staff.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] })
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
  const staffOptions = staff.filter((member) => member.active || selectedStaff.has(member.id));
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
          <p className="mt-3 text-sm text-slate-500">Riding, Media, and Additional Staff are blank custom areas. Type only the rows you need.</p>
        </section>

        <section className="no-print mt-5 grid gap-5 xl:grid-cols-2">
          {sections.map((section) => (
            <EditorSection key={section.name} name={section.name} rows={section.rows} staffOptions={staffOptions} />
          ))}
          <EditorSection name={ADDITIONAL_STAFF_LABEL} sectionName={REGISTRATION_ASSIGNMENT_EXTRA_SECTION} rows={additionalRows} staffOptions={staffOptions} />
        </section>

        <section className="registration-assignments-paper print-only" aria-label="Printable registration assignments sheet">
          <header className="registration-assignments__header">
            <h2>Registration Assignments</h2>
          </header>
          <p className="registration-assignments__instructions">
            These people will work at the tables in the dining room during registration. All other staff are to remain with their campers throughout the day.
          </p>

          <div className="registration-assignments__layout">
            {sections.map((section) => (
              <PrintSection key={section.name} className={section.className} name={section.name} rows={section.rows} staffOptions={staffOptions} />
            ))}
            <PrintSection
              className="registration-assignments__section--additional"
              name={ADDITIONAL_STAFF_LABEL}
              rows={additionalRows}
              staffOptions={staffOptions}
            />
          </div>
        </section>
      </form>
      <RegistrationAssignmentPrintStyles />
    </AppShell>
  );
}

function EditorSection({
  name,
  sectionName,
  rows,
  staffOptions
}: {
  name: string;
  sectionName?: string;
  rows: AssignmentRowData[];
  staffOptions: StaffOption[];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
      <h2 className="mb-4 text-lg font-black text-forest-900">{name}</h2>
      <div className="grid gap-3">
        {rows.map((row) => (
          <EditorRow key={row.key} row={row} sectionName={sectionName ?? name} staffOptions={staffOptions} />
        ))}
      </div>
    </section>
  );
}

function EditorRow({
  row,
  sectionName,
  staffOptions
}: {
  row: AssignmentRowData;
  sectionName: string;
  staffOptions: StaffOption[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(140px,0.9fr)_minmax(180px,1.1fr)]">
      <input name="rowKey" type="hidden" value={row.key} />
      <input name={`section:${row.key}`} type="hidden" value={sectionName} />
      <input name={`sortOrder:${row.key}`} type="hidden" value={row.sortOrder} />
      <input name={`isCustom:${row.key}`} type="hidden" value={row.isCustom ? "true" : "false"} />
      <input
        aria-label={`${sectionName} activity or role`}
        className={inputClass}
        name={`label:${row.key}`}
        placeholder={row.isCustom ? "Type assignment / role" : "Activity"}
        defaultValue={row.label}
        readOnly={!row.isCustom}
      />
      <select aria-label={`${row.label || sectionName} staff`} className={inputClass} name={`staffId:${row.key}`} defaultValue={row.staffId}>
        <option value="">Blank</option>
        {staffOptions.map((staff) => (
          <option key={staff.id} value={staff.id}>
            {staff.firstName} {staff.lastName}{staff.active ? "" : " (inactive)"}
          </option>
        ))}
      </select>
    </div>
  );
}

function PrintSection({
  className,
  name,
  rows,
  staffOptions
}: {
  className: string;
  name: string;
  rows: AssignmentRowData[];
  staffOptions: StaffOption[];
}) {
  return (
    <section className={`registration-assignments__section ${className}`}>
      <h3>{name}</h3>
      <div className="registration-assignments__rows">
        {rows.map((row) => {
          const assignedStaff = staffOptions.find((staff) => staff.id === row.staffId);
          return (
            <div className="registration-assignments__row" key={row.key}>
              <span className="registration-assignments__slot-label">{row.label ? `${row.label}:` : ""}</span>
              <span className="registration-assignments__print-name">
                {assignedStaff ? `${assignedStaff.firstName} ${assignedStaff.lastName}` : ""}
              </span>
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
  const savedAdditional = customRows.filter(
    (row) => row.section === REGISTRATION_ASSIGNMENT_EXTRA_SECTION || row.section === REGISTRATION_ASSIGNMENT_LEGACY_EXTRA_SECTION
  );
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
          @page registrationAssignmentsClassic { size: letter portrait; margin: 0.15in; }

          .registration-assignments-paper {
            --ink: #111;
            background: #fffdf6;
            border: 3px solid var(--ink);
            color: var(--ink);
            display: grid;
            font-family: "Arial Black", "Trebuchet MS", Arial, sans-serif;
            grid-template-rows: auto auto 1fr;
            height: 10.7in;
            margin: 0 auto;
            overflow: hidden;
            padding: 0;
            width: 8.2in;
          }

          .registration-assignments-paper::before,
          .registration-assignments-paper::after {
            background-image: url("data:image/svg+xml,%3Csvg width='96' height='10' viewBox='0 0 96 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 5c6-5 12 5 18 0s12-5 18 0 12 5 18 0 12-5 18 0 12 5 22 0' fill='none' stroke='%23111' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E");
            background-repeat: repeat-x;
            background-size: 96px 10px;
            content: "";
            height: 10px;
            left: 0.12in;
            pointer-events: none;
            position: absolute;
            right: 0.12in;
          }

          .registration-assignments__header {
            border-bottom: 3px solid var(--ink);
            padding: 0.22in 0.22in 0.14in;
            position: relative;
          }

          .registration-assignments__header::before {
            background-image: url("data:image/svg+xml,%3Csvg width='96' height='10' viewBox='0 0 96 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 5c6-5 12 5 18 0s12-5 18 0 12 5 18 0 12-5 18 0 12 5 22 0' fill='none' stroke='%23111' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E");
            background-repeat: repeat-x;
            background-size: 96px 10px;
            content: "";
            height: 10px;
            left: 0.16in;
            position: absolute;
            right: 0.16in;
            top: 0.04in;
          }

          .registration-assignments__header h2 {
            font-family: "Arial Black", Impact, "Trebuchet MS", sans-serif;
            font-size: 0.43in;
            font-weight: 900;
            letter-spacing: 0.025em;
            line-height: 1;
            margin: 0;
            text-transform: uppercase;
          }

          .registration-assignments__instructions {
            border-bottom: 3px solid var(--ink);
            font-size: 0.16in;
            font-weight: 900;
            line-height: 1.25;
            margin: 0;
            padding: 0.1in 0.18in;
            text-align: left;
            text-transform: uppercase;
          }

          .registration-assignments__layout {
            display: grid;
            grid-template-areas:
              "athletics waterfront arts"
              "athletics waterfront outdoor"
              "athletics performing outdoor"
              "riding performing checkout"
              "media performing additional";
            grid-template-columns: 38% 34% 28%;
            grid-template-rows: 1.3fr 1.45fr 1.45fr 1.05fr 1.25fr;
            min-height: 0;
          }

          .registration-assignments__section {
            border-bottom: 3px solid var(--ink);
            border-right: 3px solid var(--ink);
            min-height: 0;
            overflow: hidden;
            padding: 0.1in 0.11in;
          }

          .registration-assignments__section--athletics { grid-area: athletics; }
          .registration-assignments__section--riding { grid-area: riding; }
          .registration-assignments__section--media { border-bottom: 0; grid-area: media; }
          .registration-assignments__section--waterfront { grid-area: waterfront; }
          .registration-assignments__section--performing { border-bottom: 0; grid-area: performing; }
          .registration-assignments__section--arts { border-right: 0; grid-area: arts; }
          .registration-assignments__section--outdoor { border-right: 0; grid-area: outdoor; }
          .registration-assignments__section--checkout { border-right: 0; grid-area: checkout; }
          .registration-assignments__section--additional { border-bottom: 0; border-right: 0; grid-area: additional; }

          .registration-assignments__section h3 {
            display: inline-block;
            font-family: "Arial Black", Impact, "Trebuchet MS", sans-serif;
            font-size: 0.205in;
            font-weight: 900;
            line-height: 1;
            margin: 0 0 0.08in;
            position: relative;
            text-transform: uppercase;
          }

          .registration-assignments__section h3::after {
            background-image: url("data:image/svg+xml,%3Csvg width='96' height='10' viewBox='0 0 96 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 5c6-5 12 5 18 0s12-5 18 0 12 5 18 0 12-5 18 0 12 5 22 0' fill='none' stroke='%23111' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E");
            background-repeat: repeat-x;
            background-size: 96px 10px;
            bottom: -0.07in;
            content: "";
            height: 10px;
            left: 0;
            position: absolute;
            right: -0.15in;
          }

          .registration-assignments__section--additional h3 {
            font-size: 0.14in;
            line-height: 1.05;
            max-width: 1.65in;
          }

          .registration-assignments__section--additional h3::after { display: none; }

          .registration-assignments__rows { display: grid; gap: 0.018in; }

          .registration-assignments__row {
            align-items: baseline;
            display: grid;
            gap: 0.04in;
            grid-template-columns: auto minmax(0, 1fr);
            min-height: 0.148in;
          }

          .registration-assignments__slot-label {
            font-family: "Arial Black", "Trebuchet MS", Arial, sans-serif;
            font-size: 0.122in;
            font-weight: 900;
            line-height: 1;
            overflow: hidden;
            text-transform: uppercase;
            white-space: nowrap;
          }

          .registration-assignments__print-name {
            display: block;
            font-family: "Trebuchet MS", Arial, sans-serif;
            font-size: 0.118in;
            font-weight: 700;
            line-height: 1;
            min-height: 0.13in;
            overflow: hidden;
            white-space: nowrap;
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
