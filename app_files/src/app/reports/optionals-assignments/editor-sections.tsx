"use client";

import { useMemo, useState } from "react";
import { staffRoleSuffix } from "@/lib/bunk-staff-tags";
import { inputClass } from "@/components/ui";

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
  primaryArea?: { name: string } | null;
  skills: { name: string }[];
  certifications: { name: string }[];
};

export type OptionalsRowData = {
  key: string;
  period: string;
  label: string;
  staffId: string;
  customStaffName: string;
  sortOrder: number;
};

export type OptionalsPeriodSection = {
  period: string;
  periodLabel: string;
  rows: OptionalsRowData[];
};

export type AvailabilityEntry = { id: string; name: string; detail: string };

type EditableRow = OptionalsRowData & { deleted?: boolean };
type EditableSection = { period: string; periodLabel: string; rows: EditableRow[] };

export function OptionalsAssignmentEditorSections({
  sections,
  activityNames,
  staffOptions,
  availabilityByPeriod
}: {
  sections: OptionalsPeriodSection[];
  activityNames: string[];
  staffOptions: StaffOption[];
  availabilityByPeriod: Record<string, AvailabilityEntry[]>;
}) {
  const [editableSections, setEditableSections] = useState<EditableSection[]>(() =>
    sections.map((section) => ({ ...section, rows: section.rows.map((row) => ({ ...row })) }))
  );

  function addRow(sectionIndex: number) {
    setEditableSections((current) =>
      current.map((section, index) => {
        if (index !== sectionIndex) return section;
        const nextSortOrder = section.rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
        return {
          ...section,
          rows: [
            ...section.rows,
            {
              key: `new-${section.period}-${Date.now()}-${nextSortOrder}`,
              period: section.period,
              label: "",
              staffId: "",
              customStaffName: "",
              sortOrder: nextSortOrder
            }
          ]
        };
      })
    );
  }

  function updateRow(sectionIndex: number, rowKey: string, changes: Partial<EditableRow>) {
    setEditableSections((current) =>
      current.map((section, index) => {
        if (index !== sectionIndex) return section;
        return { ...section, rows: section.rows.map((row) => (row.key === rowKey ? { ...row, ...changes } : row)) };
      })
    );
  }

  function deleteRow(sectionIndex: number, rowKey: string) {
    setEditableSections((current) =>
      current.map((section, index) => {
        if (index !== sectionIndex) return section;
        return { ...section, rows: section.rows.filter((row) => row.key !== rowKey) };
      })
    );
  }

  return (
    <section className="no-print mt-5 grid items-start gap-5 xl:grid-cols-2">
      {editableSections.map((section, sectionIndex) => (
        <EditorSection
          key={section.period}
          periodLabel={section.periodLabel}
          rows={section.rows}
          activityNames={activityNames}
          staffOptions={staffOptions}
          availability={availabilityByPeriod[section.period]}
          onAdd={() => addRow(sectionIndex)}
          onDelete={(rowKey) => deleteRow(sectionIndex, rowKey)}
          onRowChange={(rowKey, changes) => updateRow(sectionIndex, rowKey, changes)}
        />
      ))}
    </section>
  );
}

function EditorSection({
  periodLabel,
  rows,
  activityNames,
  staffOptions,
  availability,
  onAdd,
  onDelete,
  onRowChange
}: {
  periodLabel: string;
  rows: EditableRow[];
  activityNames: string[];
  staffOptions: StaffOption[];
  availability: AvailabilityEntry[] | undefined;
  onAdd: () => void;
  onDelete: (rowKey: string) => void;
  onRowChange: (rowKey: string, changes: Partial<EditableRow>) => void;
}) {
  const visibleRows = useMemo(() => rows, [rows]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black text-forest-900">Period {periodLabel}</h2>
        <button
          className="rounded-full border border-forest-200 bg-forest-50 px-3 py-1.5 text-sm font-bold text-forest-800 hover:bg-forest-100"
          type="button"
          onClick={onAdd}
        >
          Add activity
        </button>
      </div>
      {visibleRows.length === 0 ? (
        <p className="text-sm font-semibold text-slate-400">No optionals added for this period yet.</p>
      ) : null}
      <div className="grid gap-3">
        {rows.map((row) => (
          <EditorRow
            key={row.key}
            row={row}
            activityNames={activityNames}
            staffOptions={staffOptions}
            onDelete={() => onDelete(row.key)}
            onRowChange={(changes) => onRowChange(row.key, changes)}
          />
        ))}
      </div>
      <AvailabilityPanel availability={availability} />
    </section>
  );
}

/**
 * Read-only companion to the editor above: staff who are free to help run
 * whatever's actually going this period, based on the last SAVED rows --
 * not any unsaved edits still sitting in the form above. Updates the
 * moment "Save report" is hit.
 */
function AvailabilityPanel({ availability }: { availability: AvailabilityEntry[] | undefined }) {
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
      <p className="text-xs font-black uppercase tracking-wide text-amber-800">Available to reassign</p>
      {availability === undefined ? (
        <p className="mt-1 text-xs font-semibold text-amber-700">Save this period&rsquo;s optionals to see who&rsquo;s free.</p>
      ) : availability.length === 0 ? (
        <p className="mt-1 text-xs font-semibold text-amber-700">Nobody&rsquo;s off or elsewhere this period.</p>
      ) : (
        <ul className="mt-1.5 grid gap-1">
          {availability.map((entry) => (
            <li key={entry.id} className="text-xs font-bold text-amber-900">
              {entry.name} <span className="font-semibold text-amber-700">— {entry.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditorRow({
  row,
  activityNames,
  staffOptions,
  onDelete,
  onRowChange
}: {
  row: EditableRow;
  activityNames: string[];
  staffOptions: StaffOption[];
  onDelete: () => void;
  onRowChange: (changes: Partial<EditableRow>) => void;
}) {
  const listId = `optionals-activities-${row.period}`;
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_auto]">
      <input name="rowKey" type="hidden" value={row.key} />
      <input name={`period:${row.key}`} type="hidden" value={row.period} />
      <input name={`sortOrder:${row.key}`} type="hidden" value={row.sortOrder} />
      <input
        aria-label="Optional activity"
        className={`${inputClass} min-w-0`}
        list={listId}
        name={`label:${row.key}`}
        placeholder="Activity name"
        value={row.label}
        onChange={(event) => onRowChange({ label: event.target.value })}
      />
      <datalist id={listId}>
        {activityNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <select
        aria-label={`${row.label || "Optional"} staff`}
        className={`${inputClass} min-w-0`}
        name={`staffId:${row.key}`}
        value={row.staffId}
        onChange={(event) => onRowChange({ staffId: event.target.value })}
      >
        <option value="">Blank</option>
        {staffOptions.map((staff) => (
          <option key={staff.id} value={staff.id}>{staffDropdownLabel(staff)}</option>
        ))}
      </select>
      <input
        aria-label={`${row.label || "Optional"} custom display name`}
        className={`${inputClass} min-w-0`}
        name={`customStaffName:${row.key}`}
        placeholder="Custom display name"
        value={row.customStaffName}
        onChange={(event) => onRowChange({ customStaffName: event.target.value })}
      />
      <button
        className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50"
        type="button"
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  );
}

function staffDropdownLabel(staff: StaffOption) {
  const cabinName = staff.cabin?.name || staff.housingLabel;
  const cabinSuffix = cabinName ? ` (${cabinName})` : "";
  const lifeguardPrefix = isLifeguard(staff) ? "* " : "";
  // Leadership tag (UH/UP/BSH/GSH), same convention as the cabin sheets.
  return `${lifeguardPrefix}${staff.firstName} ${staff.lastName}${staffRoleSuffix(staff)}${cabinSuffix}`;
}

function isLifeguard(staff: StaffOption) {
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
