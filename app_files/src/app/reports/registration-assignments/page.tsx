import { UserRole } from "@prisma/client";
import { staffRoleSuffix } from "@/lib/bunk-staff-tags";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { Field, PageHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  REGISTRATION_ASSIGNMENT_EXTRA_SECTION,
  REGISTRATION_ASSIGNMENT_LEGACY_EXTRA_SECTION,
  REGISTRATION_ASSIGNMENT_SECTIONS,
  registrationAssignmentRowKey
} from "@/lib/registration-assignments";
import { RegistrationAssignmentEditorSections, type PersonOption } from "./editor-sections";
import { saveRegistrationAssignments } from "./actions";

type SearchParams = { reportId?: string };
type StaffRecord = {
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
type CaRecord = { id: string; firstName: string; lastName: string; cabin: { name: string } | null };
type SavedRow = { section: string; label: string; staffId: string | null; camperId: string | null; customStaffName: string | null; sortOrder: number; isCustom: boolean; hidden: boolean };
type AssignmentRowData = { key: string; label: string; staffId: string; camperId: string; customStaffName: string; sortOrder: number; isCustom: boolean; hidden: boolean; hasContent: boolean };
type AssignmentSectionData = { name: string; className: string; rows: AssignmentRowData[] };

const ADDITIONAL_STAFF_LABEL = "Additional Staff";

export default async function RegistrationAssignmentsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const params = searchParams ? await searchParams : {};
  const [session, reports, staff] = await Promise.all([
    prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } }),
    prisma.registrationAssignmentReport.findMany({ orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.staff.findMany({
      // ALL active staff, not just scream-eligible: this is the registration
      // table picker, where you might grab anyone -- the old
      // screamEligible-only filter (a leftover from the Scream Session pool)
      // silently hid every non-scream-eligible staffer, which is exactly why
      // people like Evie Long / Grace French didn't appear.
      where: { active: true },
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

  // CAs are Camper records (counselorAssistant: true) -- never Staff. The
  // unified picker is why they're fetched here: before camperId existed on
  // rows, CAs could only be hand-typed into customStaffName.
  const cas: CaRecord[] = session
    ? await prisma.camper.findMany({
        where: { sessionId: session.id, active: true, counselorAssistant: true },
        select: { id: true, firstName: true, lastName: true, cabin: { select: { name: true } } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
      })
    : [];

  // A saved report can reference people the roster queries no longer
  // return (deactivated staff, a CA from another session). Fetch those by
  // id so their rows display a real name (marked inactive in the picker)
  // instead of silently showing blank -- the old <select> had exactly
  // that failure mode.
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const casById = new Map(cas.map((ca) => [ca.id, ca]));
  const missingStaffIds = Array.from(new Set(rows.map((row) => row.staffId).filter((id): id is string => Boolean(id) && !staffById.has(id!))));
  const missingCamperIds = Array.from(new Set(rows.map((row) => row.camperId).filter((id): id is string => Boolean(id) && !casById.has(id!))));
  const [missingStaff, missingCampers] = await Promise.all([
    missingStaffIds.length
      ? prisma.staff.findMany({
          where: { id: { in: missingStaffIds } },
          include: {
            cabin: { select: { name: true } },
            primaryArea: { select: { name: true } },
            certifications: { select: { name: true } },
            skills: { select: { name: true } }
          }
        })
      : Promise.resolve([]),
    missingCamperIds.length
      ? prisma.camper.findMany({
          where: { id: { in: missingCamperIds } },
          select: { id: true, firstName: true, lastName: true, cabin: { select: { name: true } } }
        })
      : Promise.resolve([])
  ]);

  // One list, one label convention, shared by the picker and the print
  // sheet: staff first then CAs, alphabetical within each; anyone only
  // present because a saved row references them is flagged inactive.
  const personOptions: PersonOption[] = [];
  const printNames = new Map<string, string>();
  for (const member of [...staff, ...missingStaff]) {
    const inactive = !staffById.has(member.id);
    const printName = `${member.firstName} ${member.lastName}${staffRoleSuffix(member)}`;
    const cabinName = member.cabin?.name || member.housingLabel;
    const pickerLabel = `${isLifeguard(member) ? "* " : ""}${printName}${cabinName ? ` (${cabinName})` : ""}${inactive ? " [inactive]" : ""}`;
    personOptions.push({
      value: `staff:${member.id}`,
      kind: "staff",
      id: member.id,
      pickerLabel,
      search: `${member.firstName} ${member.lastName} ${cabinName ?? ""} ${member.position ?? ""} ${member.position2 ?? ""}`.toLowerCase(),
      inactive
    });
    printNames.set(`staff:${member.id}`, printName);
  }
  for (const ca of [...cas, ...missingCampers]) {
    const inactive = !casById.has(ca.id);
    const printName = `${ca.firstName} ${ca.lastName} (CA)`;
    personOptions.push({
      value: `ca:${ca.id}`,
      kind: "ca",
      id: ca.id,
      pickerLabel: `${ca.firstName} ${ca.lastName}${ca.cabin?.name ? ` (${ca.cabin.name})` : ""}${inactive ? " [inactive]" : ""}`,
      search: `${ca.firstName} ${ca.lastName} ${ca.cabin?.name ?? ""} ca`.toLowerCase(),
      inactive
    });
    printNames.set(`ca:${ca.id}`, printName);
  }

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
        backHref="/reports"
        backLabel="Back to Reports"
      >
        <a href={report ? `/reports/registration-coverage?reportId=${report.id}` : "/reports/registration-coverage"} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-black">
          Cabin coverage check
        </a>
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
            All activity and assignment labels are editable. Use Add row at the bottom of any section. Type in the person box to search staff AND CAs by name or cabin — likely lifeguards are marked with *. Hand-typing a name is only for people who aren&apos;t on the roster.
          </p>
        </section>

        <RegistrationAssignmentEditorSections
          sections={sections}
          additionalRows={additionalRows}
          additionalSectionName={REGISTRATION_ASSIGNMENT_EXTRA_SECTION}
          personOptions={personOptions}
        />

        <section className="registration-assignments-paper print-only" aria-label="Printable registration assignments sheet">
          <header className="registration-assignments__header">
            <h2>Registration Assignments</h2>
          </header>
          <p className="registration-assignments__instructions">
            These people will work at the tables in the dining room during registration. All other staff are to remain with their campers throughout the day.
          </p>

          <div className="registration-assignments__layout">
            {sections.map((section) => (
              <PrintSection key={section.name} className={section.className} name={section.name} rows={section.rows} printNames={printNames} />
            ))}
            <PrintSection className="registration-assignments__section--additional" name={ADDITIONAL_STAFF_LABEL} rows={additionalRows} printNames={printNames} />
          </div>
        </section>
      </form>
      <RegistrationAssignmentPrintStyles />
    </AppShell>
  );
}

function PrintSection({ className, name, rows, printNames }: { className: string; name: string; rows: AssignmentRowData[]; printNames: Map<string, string> }) {
  const visibleRows = rows.filter((row) => row.hasContent);
  return (
    <section className={`registration-assignments__section ${className}`}>
      <h3>{name}</h3>
      <div className="registration-assignments__rows">
        {visibleRows.map((row) => {
          // Leadership tag (UH/UP/BSH/GSH) and the (CA) marker are baked
          // into printNames server-side; free-typed custom names print as
          // written since they carry no record to derive tags from.
          const pickedName = row.staffId ? printNames.get(`staff:${row.staffId}`) : row.camperId ? printNames.get(`ca:${row.camperId}`) : "";
          const staffName = row.customStaffName || pickedName || "";
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

// Same heuristic the old staff dropdown used (moved here when labels went
// server-side): flags LIKELY lifeguards with * in the picker.
function isLifeguard(staff: StaffRecord) {
  const searchable = [
    staff.position,
    staff.position2,
    staff.statusCertification,
    staff.primaryArea?.name,
    ...staff.skills.map((skill) => skill.name),
    ...staff.certifications.map((certification) => certification.name)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return ["lifeguard", "life guard", "water safety", "wsi", "waterfront", "aquatics", "swim"].some((term) => searchable.includes(term));
}

function buildSections(rows: SavedRow[]): AssignmentSectionData[] {
  const rowLookup = new Map(rows.filter((row) => !row.isCustom).map((row) => [`${row.section}:${row.sortOrder}`, row]));
  const customRows = rows.filter((row) => row.isCustom);

  return REGISTRATION_ASSIGNMENT_SECTIONS.map((section) => {
    const savedCustomRows = customRows.filter((row) => row.section === section.name);
    const fixedRows = section.slots
      .map((slot, index) => {
        const saved = rowLookup.get(`${section.name}:${index}`);
        if (saved?.hidden) return null;
        const label = saved?.label ?? slot;
        return {
          key: registrationAssignmentRowKey(section.name, index),
          label,
          staffId: saved?.staffId ?? "",
          camperId: saved?.camperId ?? "",
          customStaffName: saved?.customStaffName ?? "",
          sortOrder: index,
          isCustom: false,
          hidden: false,
          hasContent: Boolean(saved?.staffId || saved?.camperId || saved?.customStaffName || label !== slot)
        };
      })
      .filter((row): row is AssignmentRowData => Boolean(row));
    const custom = [
      ...savedCustomRows.map((row, index) => ({
        key: registrationAssignmentRowKey(section.name, section.slots.length + index, true),
        label: row.label,
        staffId: row.staffId ?? "",
        camperId: row.camperId ?? "",
        customStaffName: row.customStaffName ?? "",
        sortOrder: section.slots.length + index,
        isCustom: true,
        hidden: false,
        hasContent: Boolean(row.label || row.staffId || row.camperId || row.customStaffName)
      })),
      // Only auto-supply a blank starter row when the section would
      // otherwise render with nothing in it at all (no fixed slots, no
      // saved custom rows) - e.g. a brand-new Riding/Media section. This
      // used to unconditionally add REGISTRATION_ASSIGNMENT_BLANK_ROWS (5)
      // blanks on every single render regardless of how many rows already
      // existed, which meant deleting one did nothing: the very next
      // load/save regenerated all 5 again from scratch, since blank rows
      // have no content and were never actually persisted for the delete
      // to "stick" against. One starter blank, only when truly empty, and
      // the existing Add row button for everything beyond that.
      ...(fixedRows.length === 0 && savedCustomRows.length === 0
        ? [
            {
              key: registrationAssignmentRowKey(section.name, section.slots.length, true),
              label: "",
              staffId: "",
              camperId: "",
              customStaffName: "",
              sortOrder: section.slots.length,
              isCustom: true,
              hidden: false,
              hasContent: false
            }
          ]
        : [])
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
      camperId: row.camperId ?? "",
      customStaffName: row.customStaffName ?? "",
      sortOrder: index,
      isCustom: true,
      hidden: false,
      hasContent: Boolean(row.label || row.staffId || row.camperId || row.customStaffName)
    })),
    ...(savedAdditional.length === 0
      ? [
          {
            key: registrationAssignmentRowKey(REGISTRATION_ASSIGNMENT_EXTRA_SECTION, 0, true),
            label: "",
            staffId: "",
            camperId: "",
            customStaffName: "",
            sortOrder: 0,
            isCustom: true,
            hidden: false,
            hasContent: false
          }
        ]
      : [])
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
            height: 10.35in;
            margin: 0 auto;
            overflow: hidden;
            padding: 0;
            width: 7.8in;
          }

          .registration-assignments__header {
            border-bottom: 3px solid var(--ink);
            padding: 0.11in 0.18in 0.08in;
          }

          .registration-assignments__header h2 {
            font-size: 0.33in;
            font-weight: 900;
            letter-spacing: 0.006em;
            line-height: 1;
            margin: 0;
            text-transform: uppercase;
            white-space: nowrap;
          }

          .registration-assignments__instructions {
            border-bottom: 3px solid var(--ink);
            font-size: 0.115in;
            font-weight: 900;
            line-height: 1.15;
            margin: 0;
            padding: 0.07in 0.15in;
            text-align: left;
            text-transform: uppercase;
          }

          .registration-assignments-paper .registration-assignments__layout {
            display: grid !important;
            grid-template-areas:
              "athletics waterfront arts"
              "athletics waterfront outdoor"
              "athletics performing outdoor"
              "riding performing checkout"
              "media performing additional" !important;
            grid-template-columns: 38% 34% 28% !important;
            grid-template-rows: 1.62fr 1.22fr 1.24fr 0.95fr 1.1fr !important;
            height: auto !important;
            min-height: 0;
            width: 100% !important;
          }

          .registration-assignments-paper .registration-assignments__section {
            border-bottom: 3px solid var(--ink) !important;
            border-right: 3px solid var(--ink) !important;
            min-height: 0;
            overflow: hidden;
            padding: 0.065in 0.075in;
          }

          .registration-assignments__section--athletics { grid-area: athletics; }
          .registration-assignments__section--riding { grid-area: riding; }
          .registration-assignments__section--media { border-bottom: 0 !important; grid-area: media; }
          .registration-assignments__section--waterfront { grid-area: waterfront; }
          .registration-assignments__section--performing { border-bottom: 0 !important; grid-area: performing; }
          .registration-assignments__section--arts { border-right: 0 !important; grid-area: arts; }
          .registration-assignments__section--outdoor { border-right: 0 !important; grid-area: outdoor; }
          .registration-assignments__section--checkout { border-right: 0 !important; grid-area: checkout; }
          .registration-assignments__section--additional { border-bottom: 0 !important; border-right: 0 !important; grid-area: additional; }

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
            text-underline-offset: 0.037in;
          }

          .registration-assignments__section--additional h3 {
            font-size: 0.125in;
            max-width: none;
            text-decoration: none;
          }

          .registration-assignments__rows {
            display: grid;
            gap: 0.004in;
          }

          .registration-assignments__row {
            display: block;
            min-height: 0.112in;
          }

          .registration-assignments__slot-label {
            font-size: 0.088in;
            font-weight: 900;
            line-height: 1;
            text-transform: uppercase;
            white-space: nowrap;
          }

          .registration-assignments__print-name {
            display: inline;
            font-size: 0.082in;
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
