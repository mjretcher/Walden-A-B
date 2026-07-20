"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { inputClass } from "@/components/ui";

/**
 * One entry per pickable person, built server-side in page.tsx so the
 * editor and the print sheet share a single source of truth for labels.
 * Staff and CAs live in ONE list -- CAs are Camper records
 * (counselorAssistant: true), never Staff, so before this combobox
 * existed they could only be hand-typed into customStaffName.
 */
export type PersonOption = {
  value: string; // "staff:<id>" | "ca:<id>"
  kind: "staff" | "ca";
  id: string;
  pickerLabel: string; // "* First Last(UH) (G2)" -- LG star + role tag + cabin
  search: string; // lowercase haystack: name + cabin + tags
  inactive?: boolean;
};

type AssignmentRowData = {
  key: string;
  label: string;
  staffId: string;
  camperId: string;
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
  personOptions
}: {
  sections: AssignmentSectionData[];
  additionalRows: AssignmentRowData[];
  additionalSectionName: string;
  personOptions: PersonOption[];
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

  const optionsByValue = useMemo(() => new Map(personOptions.map((option) => [option.value, option])), [personOptions]);

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
              camperId: "",
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
              return row.isCustom ? null : { ...row, label: "", staffId: "", camperId: "", customStaffName: "", hidden: true, deleted: true };
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
          personOptions={personOptions}
          optionsByValue={optionsByValue}
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
  personOptions,
  optionsByValue,
  onAdd,
  onDelete,
  onRowChange
}: {
  name: string;
  rows: EditableRow[];
  sectionName: string;
  personOptions: PersonOption[];
  optionsByValue: Map<string, PersonOption>;
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
              personOptions={personOptions}
              optionsByValue={optionsByValue}
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
      <input name={`camperId:${row.key}`} type="hidden" value="" />
      <input name={`customStaffName:${row.key}`} type="hidden" value="" />
    </div>
  );
}

function EditorRow({
  row,
  sectionName,
  personOptions,
  optionsByValue,
  canDelete,
  onDelete,
  onRowChange
}: {
  row: EditableRow;
  sectionName: string;
  personOptions: PersonOption[];
  optionsByValue: Map<string, PersonOption>;
  canDelete: boolean;
  onDelete: () => void;
  onRowChange: (changes: Partial<EditableRow>) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_auto]">
      <input name="rowKey" type="hidden" value={row.key} />
      <input name={`section:${row.key}`} type="hidden" value={sectionName} />
      <input name={`sortOrder:${row.key}`} type="hidden" value={row.sortOrder} />
      <input name={`isCustom:${row.key}`} type="hidden" value={row.isCustom ? "true" : "false"} />
      <input name={`hidden:${row.key}`} type="hidden" value="false" />
      <input name={`staffId:${row.key}`} type="hidden" value={row.staffId} />
      <input name={`camperId:${row.key}`} type="hidden" value={row.camperId} />
      <input name={`customStaffName:${row.key}`} type="hidden" value={row.customStaffName} />
      <input
        aria-label={`${sectionName} activity or role`}
        className={`${inputClass} min-w-0`}
        name={`label:${row.key}`}
        placeholder="Activity / assignment"
        value={row.label}
        onChange={(event) => onRowChange({ label: event.target.value })}
      />
      <PersonCombobox
        ariaLabel={`${row.label || sectionName} staff or CA`}
        row={row}
        personOptions={personOptions}
        optionsByValue={optionsByValue}
        onRowChange={onRowChange}
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

/**
 * The typeahead that replaces the old full-roster <select> + free-text
 * "custom display name" pair. Type a few letters -> filtered staff AND
 * CAs, arrow keys + Enter or click to pick. The three underlying fields
 * (staffId / camperId / customStaffName) are mutually exclusive and
 * carried by hidden inputs on the row, so the save action's form shape
 * is unchanged apart from the new camperId field.
 *
 * Hand-typing still exists ONLY as the explicit last-resort escape hatch
 * for off-roster people: an "Use ... as written" entry at the bottom of
 * the dropdown -- never something you land in by accident.
 */
function PersonCombobox({
  ariaLabel,
  row,
  personOptions,
  optionsByValue,
  onRowChange
}: {
  ariaLabel: string;
  row: EditableRow;
  personOptions: PersonOption[];
  optionsByValue: Map<string, PersonOption>;
  onRowChange: (changes: Partial<EditableRow>) => void;
}) {
  const selectedOption = row.staffId
    ? optionsByValue.get(`staff:${row.staffId}`)
    : row.camperId
      ? optionsByValue.get(`ca:${row.camperId}`)
      : undefined;
  const selectionMissing = Boolean((row.staffId || row.camperId) && !selectedOption);
  const displayValue = selectedOption
    ? selectedOption.pickerLabel
    : selectionMissing
      ? "Unknown person (removed?)"
      : row.customStaffName;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = useMemo(() => {
    const pool = terms.length
      ? personOptions.filter((option) => terms.every((term) => option.search.includes(term)))
      : personOptions;
    return pool.slice(0, 12);
  }, [personOptions, terms]);
  const customEntry = query.trim() && !terms.length ? null : query.trim();

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function pick(option: PersonOption) {
    onRowChange(
      option.kind === "staff"
        ? { staffId: option.id, camperId: "", customStaffName: "" }
        : { staffId: "", camperId: option.id, customStaffName: "" }
    );
    setOpen(false);
    setQuery("");
  }

  function pickCustom(name: string) {
    onRowChange({ staffId: "", camperId: "", customStaffName: name });
    setOpen(false);
    setQuery("");
  }

  function clearSelection() {
    onRowChange({ staffId: "", camperId: "", customStaffName: "" });
    setOpen(false);
    setQuery("");
  }

  const totalEntries = matches.length + (customEntry ? 1 : 0);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(totalEntries - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex < matches.length && matches[activeIndex]) pick(matches[activeIndex]);
      else if (customEntry) pickCustom(customEntry);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="relative min-w-0" ref={wrapperRef}>
      <div className={`${inputClass} flex min-w-0 items-center gap-2 pr-1`}>
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          aria-label={ariaLabel}
          className={`min-w-0 flex-1 bg-transparent outline-none ${selectionMissing ? "text-red-700" : ""}`}
          placeholder="Type a staff or CA name..."
          value={open ? query : displayValue}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onKeyDown={onKeyDown}
        />
        {displayValue && !open ? (
          <button aria-label="Clear person" className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" type="button" onClick={clearSelection}>
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-panel">
          {matches.map((option, index) => (
            <button
              key={option.value}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-lake-50" : "hover:bg-slate-50"}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => pick(option)}
            >
              <span className={`truncate font-semibold ${option.inactive ? "text-slate-400" : "text-slate-800"}`}>{option.pickerLabel}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${option.kind === "ca" ? "bg-lake-100 text-lake-800" : "bg-forest-50 text-forest-800"}`}>
                {option.kind === "ca" ? "CA" : "Staff"}
              </span>
            </button>
          ))}
          {!matches.length && !customEntry ? (
            <p className="px-3 py-2 text-sm text-slate-500">No staff or CAs match.</p>
          ) : null}
          {customEntry ? (
            <button
              className={`block w-full border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-500 ${activeIndex === matches.length ? "bg-lake-50" : "hover:bg-slate-50"}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(matches.length)}
              onClick={() => pickCustom(customEntry)}
            >
              Use &quot;{customEntry}&quot; as written (not on roster)
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
