"use client";

import { useMemo, useState } from "react";
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

type AssignmentRowData = {
  key: string;
  label: string;
  staffId: string;
  customStaffName: string;
  sortOrder: number;
  isCustom: boolean;
  hidden: boolean;
};

type AssignmentSectionData = {
  name: string;
  className: string;
  rows: AssignmentRowData[];
};

type EditableRow = AssignmentRowData & { deleted?: boolean };
type EditableSection = Omit<AssignmentSectionData, "rows"> & { rows: EditableRow[]; sectionName?: string };

export function RegistrationAssignmentEditorSections({
  sections,
  additionalRows,
  additionalSectionName,
  staffOptions
}: {
  sections: AssignmentSectionData[];
  additionalRows: AssignmentRowData[];
  additionalSectionName: string;
  staffOptions: StaffOption[];
}) {
  const [editableSections, setEditableSections] = useState<EditableSection[]>(() => [
    ...sections.map((section) => ({ ...section, rows: section.rows.map((row) => ({ ...row })) })),
    {
      name: "Additional Staff",
      className: "registration-assignments__section--additional",
      sectionName: additionalSectionName,
      rows: additionalRows.map((row) => ({ ...row }))
    }
  ]);

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
              key: `new-${section.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${nextSortOrder}`,
              label: "",
              staffId: "",
              customStaffName: "",
              sortOrder: nextSortOrder,
              isCustom: true,
              hidden: false
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
        return {
          ...section,
          rows: section.rows.map((row) => (row.key === rowKey ? { ...row, ...changes } : row))
        };
      })
    );
  }

  function deleteRow(sectionIndex: number, rowKey: string) {
    setEditableSections((current) =>
      current.map((section, index) => {
        if (index !== sectionIndex) return section;
        return {
          ...section,
          rows: section.rows
            .map((row) => {
              if (row.key !== rowKey) return row;
              return row.isCustom ? null : { ...row, label: "", staffId: "", customStaffName: "", hidden: true, deleted: true };
            })
            .filter((row): row is EditableRow => Boolean(row))
        };
      })
    );
  }

  return (
    <section className="no-print mt-5 grid items-start gap-5 xl:grid-cols-2">
      {editableSections.map((section, sectionIndex) => (
        <EditorSection
          key={section.name}
          name={section.name}
          rows={section.rows}
          sectionName={section.sectionName ?? section.name}
          staffOptions={staffOptions}
          onAdd={() => addRow(sectionIndex)}
          onDelete={(rowKey) => deleteRow(sectionIndex, rowKey)}
          onRowChange={(rowKey, changes) => updateRow(sectionIndex, rowKey, changes)}
        />
      ))}
    </section>
  );
}

function EditorSection({
  name,
  rows,
  sectionName,
  staffOptions,
  onAdd,
  onDelete,
  onRowChange
}: {
  name: string;
  rows: EditableRow[];
  sectionName: string;
  staffOptions: StaffOption[];
  onAdd: () => void;
  onDelete: (rowKey: string) => void;
  onRowChange: (rowKey: string, changes: Partial<EditableRow>) => void;
}) {
  const visibleRows = useMemo(() => rows.filter((row) => !row.deleted), [rows]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black text-forest-900">{name}</h2>
        <button
          className="rounded-full border border-forest-200 bg-forest-50 px-3 py-1.5 text-sm font-bold text-forest-800 hover:bg-forest-100"
          type="button"
          onClick={onAdd}
        >
          Add row
        </button>
      </div>
      <div className="grid gap-3">
        {rows.map((row) => (
          row.deleted ? (
            <DeletedRow key={row.key} row={row} sectionName={sectionName} />
          ) : (
            <EditorRow
              key={row.key}
              row={row}
              sectionName={sectionName}
              staffOptions={staffOptions}
              canDelete={visibleRows.length > 1}
              onDelete={() => onDelete(row.key)}
              onRowChange={(changes) => onRowChange(row.key, changes)}
            />
          )
        ))}
      </div>
    </section>
  );
}

function DeletedRow({ row, sectionName }: { row: EditableRow; sectionName: string }) {
  return (
    <div className="hidden">
      <input name="rowKey" type="hidden" value={row.key} />
      <input name={`section:${row.key}`} type="hidden" value={sectionName} />
      <input name={`sortOrder:${row.key}`} type="hidden" value={row.sortOrder} />
      <input name={`isCustom:${row.key}`} type="hidden" value="false" />
      <input name={`hidden:${row.key}`} type="hidden" value="true" />
      <input name={`label:${row.key}`} type="hidden" value="" />
      <input name={`staffId:${row.key}`} type="hidden" value="" />
      <input name={`customStaffName:${row.key}`} type="hidden" value="" />
    </div>
  );
}

function EditorRow({
  row,
  sectionName,
  staffOptions,
  canDelete,
  onDelete,
  onRowChange
}: {
  row: EditableRow;
  sectionName: string;
  staffOptions: StaffOption[];
  canDelete: boolean;
  onDelete: () => void;
  onRowChange: (changes: Partial<EditableRow>) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_auto]">
      <input name="rowKey" type="hidden" value={row.key} />
      <input name={`section:${row.key}`} type="hidden" value={sectionName} />
      <input name={`sortOrder:${row.key}`} type="hidden" value={row.sortOrder} />
      <input name={`isCustom:${row.key}`} type="hidden" value={row.isCustom ? "true" : "false"} />
      <input name={`hidden:${row.key}`} type="hidden" value="false" />
      <input
        aria-label={`${sectionName} activity or role`}
        className={`${inputClass} min-w-0`}
        name={`label:${row.key}`}
        placeholder="Activity / assignment"
        value={row.label}
        onChange={(event) => onRowChange({ label: event.target.value })}
      />
      <select
        aria-label={`${row.label || sectionName} staff`}
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
        aria-label={`${row.label || sectionName} custom staff display name`}
        className={`${inputClass} min-w-0`}
        name={`customStaffName:${row.key}`}
        placeholder="Custom display name"
        value={row.customStaffName}
        onChange={(event) => onRowChange({ customStaffName: event.target.value })}
      />
      <button
        className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!canDelete}
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
  return `${lifeguardPrefix}${staff.firstName} ${staff.lastName}${cabinSuffix}`;
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
