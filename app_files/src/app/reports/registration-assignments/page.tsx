import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { Badge, Field, PageHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  REGISTRATION_ASSIGNMENT_BLANK_ROWS,
  REGISTRATION_ASSIGNMENT_EXTRA_LABELS,
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
  editableLabel: boolean;
};

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
  const rowLookup = new Map(rows.filter((row) => !row.isCustom).map((row) => [`${row.section}:${row.sortOrder}`, row]));
  const customRows = rows.filter((row) => row.isCustom);
  const selectedStaff = new Set(rows.map((row) => row.staffId).filter((id): id is string => Boolean(id)));
  const staffOptions = staff.filter((member) => member.active || selectedStaff.has(member.id));
  const label = report?.registrationLabel ?? session?.name ?? "Registration Assignments";
  const dateValue = report?.registrationDate ? toDateInputValue(report.registrationDate) : "";

  return (
    <AppShell user={user}>
      <PageHeader
        title="Registration Assignments"
        eyebrow="Registration reports"
        description="Manual dining-room table assignments for registration day. These assignments do not change normal class staffing."
      >
        <a className={`${secondaryButtonClass} no-print`} href="/exports">Reports</a>
        <PrintButton label="Print report" />
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

      <form action={saveRegistrationAssignments} className="grid gap-5 registration-assignments-page">
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
          <p className="mt-3 text-sm text-slate-500">Blank staff assignments are allowed.</p>
        </section>

        <section className="registration-assignments-paper bg-white shadow-soft print:shadow-none">
          <header className="registration-assignments__header">
            <div>
              <p className="registration-assignments__kicker">{dateValue || "Registration date"}</p>
              <h2>Registration Assignments</h2>
            </div>
            <Badge tone="blue">{label}</Badge>
          </header>
          <p className="registration-assignments__instructions">
            These people will work at the tables in the dining room during registration. All other staff are to remain
            with their campers throughout the day.
          </p>

          <div className="registration-assignments__layout">
            {REGISTRATION_ASSIGNMENT_SECTIONS.map((section) => {
              const customSectionRows = customRows.filter((row) => row.section === section.name);
              return (
                <AssignmentSection
                  key={section.name}
                  className={section.className}
                  name={section.name}
                  rows={[
                    ...section.slots.map((slot, index) => ({
                      key: registrationAssignmentRowKey(section.name, index),
                      label: rowLookup.get(`${section.name}:${index}`)?.label ?? slot,
                      staffId: rowLookup.get(`${section.name}:${index}`)?.staffId ?? "",
                      sortOrder: index,
                      isCustom: false,
                      editableLabel: true
                    })),
                    ...customSectionRows.map((row, index) => ({
                      key: registrationAssignmentRowKey(section.name, section.slots.length + index, true),
                      label: row.label,
                      staffId: row.staffId ?? "",
                      sortOrder: section.slots.length + index,
                      isCustom: true,
                      editableLabel: true
                    })),
                    ...Array.from({ length: section.slots.length ? 0 : REGISTRATION_ASSIGNMENT_BLANK_ROWS }, (_, index) => ({
                      key: registrationAssignmentRowKey(section.name, customSectionRows.length + index, true),
                      label: "",
                      staffId: "",
                      sortOrder: section.slots.length + customSectionRows.length + index,
                      isCustom: true,
                      editableLabel: true
                    }))
                  ]}
                  staffOptions={staffOptions}
                />
              );
            })}

            <section className="registration-assignments__section registration-assignments__section--additional">
              <h3>{REGISTRATION_ASSIGNMENT_EXTRA_SECTION}</h3>
              <div className="registration-assignments__rows">
                {buildAdditionalRows(customRows).map((row) => (
                  <AssignmentRow
                    key={row.key}
                    row={row}
                    sectionName={REGISTRATION_ASSIGNMENT_EXTRA_SECTION}
                    staffOptions={staffOptions}
                  />
                ))}
              </div>
            </section>
          </div>
        </section>
      </form>
    </AppShell>
  );
}

function AssignmentSection({
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
        {rows.map((row) => (
          <AssignmentRow key={row.key} row={row} sectionName={name} staffOptions={staffOptions} />
        ))}
      </div>
    </section>
  );
}

function AssignmentRow({
  row,
  sectionName,
  staffOptions
}: {
  row: AssignmentRowData;
  sectionName: string;
  staffOptions: StaffOption[];
}) {
  const assignedStaff = staffOptions.find((staff) => staff.id === row.staffId);
  return (
    <div className="registration-assignments__row">
      <input name="rowKey" type="hidden" value={row.key} />
      <input name={`section:${row.key}`} type="hidden" value={sectionName} />
      <input name={`sortOrder:${row.key}`} type="hidden" value={row.sortOrder} />
      <input name={`isCustom:${row.key}`} type="hidden" value={row.isCustom ? "true" : "false"} />
      <input
        aria-label={`${sectionName} activity or role`}
        className="registration-assignments__slot-input"
        name={`label:${row.key}`}
        placeholder={row.isCustom ? "Add role" : "Activity"}
        defaultValue={row.label}
      />
      <select aria-label={`${row.label || sectionName} staff`} name={`staffId:${row.key}`} defaultValue={row.staffId}>
        <option value="">Blank</option>
        {staffOptions.map((staff) => (
          <option key={staff.id} value={staff.id}>
            {staff.firstName} {staff.lastName}{staff.active ? "" : " (inactive)"}
          </option>
        ))}
      </select>
      <span className="registration-assignments__print-name">
        {assignedStaff ? `${assignedStaff.firstName} ${assignedStaff.lastName}` : ""}
      </span>
    </div>
  );
}

function buildAdditionalRows(customRows: SavedRow[]): AssignmentRowData[] {
  const savedAdditional = customRows.filter(
    (row) => row.section === REGISTRATION_ASSIGNMENT_EXTRA_SECTION || row.section === REGISTRATION_ASSIGNMENT_LEGACY_EXTRA_SECTION
  );
  const defaultRows = REGISTRATION_ASSIGNMENT_EXTRA_LABELS.map((label, index) => {
    const saved = savedAdditional.find((row) => row.sortOrder === index) ?? savedAdditional.find((row) => row.label === label);
    return {
      key: registrationAssignmentRowKey(REGISTRATION_ASSIGNMENT_EXTRA_SECTION, index, true),
      label: saved?.label ?? label,
      staffId: saved?.staffId ?? "",
      sortOrder: index,
      isCustom: true,
      editableLabel: true
    };
  });
  const remaining = savedAdditional
    .filter((row) => row.sortOrder >= defaultRows.length)
    .map((row, index) => ({
      key: registrationAssignmentRowKey(REGISTRATION_ASSIGNMENT_EXTRA_SECTION, defaultRows.length + index, true),
      label: row.label,
      staffId: row.staffId ?? "",
      sortOrder: defaultRows.length + index,
      isCustom: true,
      editableLabel: true
    }));

  return [...defaultRows, ...remaining];
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}
