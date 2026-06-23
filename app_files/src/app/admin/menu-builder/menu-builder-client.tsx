"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { ActivityIcon } from "@/components/activity-icon";
import { Badge, Field, Panel, SectionHeader, buttonClass, dangerButtonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { DEFAULT_STAFF_TARGET, filterActivitiesForArea } from "@/lib/menu-builder-behavior";
import { createOffering, deleteOffering, deleteOfferings, duplicateOffering, renameActivity, updateOffering } from "./actions";

const areaStorageKey = "walden-menu-builder-area-id";

type Option = { value: string; label: string };
type AreaOption = { id: string; name: string };
type ActivityOption = { id: string; areaId: string; name: string };
type CertificationOption = { id: string; name: string };
type MenuRow = { id: string; label: string; visible: boolean; includeInPrint: boolean };
type OfferingItem = {
  id: string;
  period: string;
  periodLabel: string;
  area: AreaOption;
  activity: { id: string; name: string; requiredCertifications: CertificationOption[] };
  rosterLimit: number | null;
  limitType: string;
  staffTarget: number;
  active: boolean;
  preAssigned: boolean;
  spansTwoPeriods: boolean;
  visibleForCamperRegistration: boolean;
  allowOverride: boolean;
  visibleOnMenu: boolean;
  visibleOnMasterMenu: boolean;
  includeInPrint: boolean;
  notes: string | null;
  eligibleUnits: string[];
  eligibleSwimLevels: string[];
  camperCount: number;
  staffCount: number;
  menuRows: MenuRow[];
};

export function MenuBuilderClient({
  areas,
  activities,
  certifications,
  offerings,
  periodOptions,
  unitOptions,
  swimLevelOptions,
  limitTypeOptions,
  canEdit
}: {
  areas: AreaOption[];
  activities: ActivityOption[];
  certifications: CertificationOption[];
  offerings: OfferingItem[];
  periodOptions: Option[];
  unitOptions: Option[];
  swimLevelOptions: Option[];
  limitTypeOptions: Option[];
  canEdit: boolean;
}) {
  const [selectedAreaId, setSelectedAreaId] = useState(areas[0]?.id ?? "");
  const [waterfrontSwimDefaults, setWaterfrontSwimDefaults] = useState<string[]>(
    swimLevelOptions.map((o) => o.value)
  );
  const filteredActivities = useMemo(() => filterActivitiesForArea(activities, selectedAreaId), [activities, selectedAreaId]);
  const selectedArea = areas.find((a) => a.id === selectedAreaId);
  const isWaterfront = selectedArea?.name.toLowerCase().includes("waterfront") ?? false;
  const offeringsByArea = useMemo(() => {
    return offerings.reduce<{ area: AreaOption; offerings: OfferingItem[] }[]>((groups, offering) => {
      const group = groups.find((item) => item.area.id === offering.area.id);
      if (group) group.offerings.push(offering);
      else groups.push({ area: offering.area, offerings: [offering] });
      return groups;
    }, []);
  }, [offerings]);

  useEffect(() => {
    const stored = window.localStorage.getItem(areaStorageKey);
    if (stored && areas.some((area) => area.id === stored)) setSelectedAreaId(stored);
  }, [areas]);

  function changeArea(areaId: string) {
    setSelectedAreaId(areaId);
    window.localStorage.setItem(areaStorageKey, areaId);
  }

  return (
    <>
      {canEdit ? (
        <form action={createOffering} className="mb-8 grid gap-5 rounded-lg border border-white/80 bg-white/95 p-5 shadow-soft">
          <SectionHeader title="Add Offering" detail="Choose an existing activity or name a new staff-week addition." />
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-6">
            <div className="2xl:col-span-2">
              <Field label="Area for new activity">
                <select className={inputClass} name="areaId" required value={selectedAreaId} onChange={(event) => changeArea(event.target.value)}>
                  {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="2xl:col-span-2">
              <Field label="Select Activity">
                <select key={selectedAreaId} className={inputClass} name="activityId" defaultValue={filteredActivities[0]?.id ?? ""}>
                  {filteredActivities.length ? filteredActivities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>) : <option value="">No activities in this area</option>}
                </select>
              </Field>
            </div>
            <Field label="Or new activity">
              <input className={inputClass} name="newActivityName" placeholder="Staff week addition" />
            </Field>
            <Field label="Period">
              <select className={inputClass} name="period" defaultValue="P1A">
                {periodOptions.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
              </select>
            </Field>
            <Field label="Create for">
              <select className={inputClass} name="daySelection" defaultValue="SINGLE">
                <option value="SINGLE">Selected period</option>
                <option value="A">A day</option>
                <option value="B">B day</option>
                <option value="BOTH">A and B days</option>
                <option value="CUSTOM">Checked periods</option>
              </select>
            </Field>
            <Field label="Roster limit">
              <input className={inputClass} name="rosterLimit" min="0" type="number" placeholder="18" />
            </Field>
            <Field label="Limit type">
              <select className={inputClass} name="limitType" defaultValue="FIXED">
                {limitTypeOptions.map((limit) => <option key={limit.value} value={limit.value}>{limit.label}</option>)}
              </select>
            </Field>
            <Field label="Staff target">
              <input className={inputClass} name="staffTarget" min="1" type="number" defaultValue={DEFAULT_STAFF_TARGET} />
            </Field>
            <div className="md:col-span-2 2xl:col-span-4">
              <Field label="Notes">
                <input className={inputClass} name="notes" placeholder="All levels, equipment notes..." />
              </Field>
            </div>
          </div>
          <ChipSet name="periods" title="Checked periods" options={periodOptions} />
          <ChipSet name="eligibleUnits" title="Eligible units" options={unitOptions} defaultChecked />

          {isWaterfront ? (
            <div className="rounded-lg border border-lake-200 bg-lake-50 p-4">
              <p className="mb-2 text-sm font-black text-lake-900">Waterfront swim level requirement</p>
              <p className="mb-3 text-xs font-medium text-lake-700">Pick the swim levels eligible for this class. This selection will be applied to all new waterfront classes you create.</p>
              <div className="flex flex-wrap gap-3">
                {swimLevelOptions.map((option) => (
                  <label key={option.value} className="cursor-pointer">
                    <input
                      className="peer sr-only"
                      name="eligibleSwimLevels"
                      type="checkbox"
                      value={option.value}
                      checked={waterfrontSwimDefaults.includes(option.value)}
                      onChange={(e) => {
                        setWaterfrontSwimDefaults((prev) =>
                          e.target.checked ? [...prev, option.value] : prev.filter((v) => v !== option.value)
                        );
                      }}
                    />
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white hover:border-lake-300">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <ChipSet name="eligibleSwimLevels" title="Eligible swim levels" options={swimLevelOptions} defaultChecked />
          )}

          <div className="flex flex-wrap gap-4 xl:col-span-3">
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold"><input name="allowOverride" type="checkbox" defaultChecked />Allow override</label>
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold"><input name="preAssigned" type="checkbox" />Pre-assigned / no camper choice</label>
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold"><input name="spansTwoPeriods" type="checkbox" />Runs two periods (this + next, e.g. 3A&nbsp;+&nbsp;4A)</label>
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold"><input name="staffOnlyForCamperRegistration" type="checkbox" />Staff only / hide from camper registration</label>
            <Toggle name="visibleOnMenu" label="Show on Standard A/B menu" defaultChecked />
            <Toggle name="visibleOnMasterMenu" label="Show on Master A/B menu" defaultChecked />
            <Toggle name="includeInPrint" label="Include in print" defaultChecked />
          </div>
          {certifications.length ? (
            <ChipSet name="certificationIds" title="Required certifications for this activity" options={certifications.map((certification) => ({ value: certification.id, label: certification.name }))} />
          ) : null}
          <button className={buttonClass} type="submit">Add offering</button>
        </form>
      ) : null}

      <OfferingsPanel
        canEdit={canEdit}
        certifications={certifications}
        limitTypeOptions={limitTypeOptions}
        offerings={offerings}
        offeringsByArea={offeringsByArea}
        periodOptions={periodOptions}
        unitOptions={unitOptions}
        swimLevelOptions={swimLevelOptions}
      />
    </>
  );
}

/* ─── Offerings Table Panel ─── */

function OfferingsPanel({
  canEdit,
  certifications,
  limitTypeOptions,
  offerings,
  offeringsByArea,
  periodOptions,
  unitOptions,
  swimLevelOptions
}: {
  canEdit: boolean;
  certifications: CertificationOption[];
  limitTypeOptions: Option[];
  offerings: OfferingItem[];
  offeringsByArea: { area: AreaOption; offerings: OfferingItem[] }[];
  periodOptions: Option[];
  unitOptions: Option[];
  swimLevelOptions: Option[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [editingOffering, setEditingOffering] = useState<OfferingItem | null>(null);
  const selectedOfferings = offerings.filter((offering) => selectedIds.includes(offering.id));

  function toggleSelection(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <Panel>
      <SectionHeader title="Current Offerings" detail="Click any row to edit. Inline fields save on change.">
        <Badge>{offerings.length} offerings</Badge>
      </SectionHeader>
      {canEdit && selectedIds.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <span className="text-sm font-black text-red-900">{selectedIds.length} selected</span>
          <button className={dangerButtonClass} type="button" onClick={() => setConfirming(true)}>Delete selected</button>
        </div>
      ) : null}
      <div className="space-y-3">
        {offeringsByArea.map((group) => (
          <details key={group.area.id} className="rounded-lg border border-slate-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 font-black text-forest-900">
              <span className="ml-2 inline-flex items-center gap-2">
                <ActivityIcon area={group.area.name} size="sm" />
                {group.area.name}
                <Badge>{group.offerings.length} offerings</Badge>
              </span>
            </summary>
            <div className="overflow-x-auto border-t border-slate-200">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr className="border-b">
                    {canEdit ? <th className="py-3 pl-4">Select</th> : null}
                    <th className={canEdit ? "py-3" : "py-3 pl-4"}>Period</th>
                    <th>Activity</th>
                    <th>Limit</th>
                    <th>Staff</th>
                    <th>Swim</th>
                    <th>Active</th>
                    <th>Flags</th>
                    <th>Notes</th>
                    <th className="pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {group.offerings.map((offering) => (
                    <OfferingRow
                      key={offering.id}
                      offering={offering}
                      canEdit={canEdit}
                      selected={selectedIds.includes(offering.id)}
                      onToggleSelect={() => toggleSelection(offering.id)}
                      onEdit={() => setEditingOffering(offering)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>

      {/* Bulk delete confirmation modal */}
      {confirming ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-black text-red-900">Delete selected offerings?</h2>
            <p className="mt-2 text-sm font-medium text-slate-600">These classes and their roster/staffing records will be removed only after you confirm.</p>
            <ul className="mt-4 max-h-56 overflow-auto rounded-md border border-slate-200 p-3 text-sm">
              {selectedOfferings.map((offering) => <li key={offering.id} className="py-1 font-semibold">{offering.periodLabel} - {offering.area.name} - {offering.activity.name}</li>)}
            </ul>
            <form action={deleteOfferings} className="mt-4 grid gap-3">
              {selectedIds.map((id) => <input key={id} name="offeringId" type="hidden" value={id} />)}
              <input name="confirmMassDelete" type="hidden" value="DELETE SELECTED" />
              <div className="flex flex-wrap justify-end gap-2">
                <button className={secondaryButtonClass} type="button" onClick={() => setConfirming(false)}>Cancel</button>
                <button className={dangerButtonClass} type="submit">Confirm delete</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Full edit modal */}
      {editingOffering ? (
        <EditOfferingModal
          offering={editingOffering}
          certifications={certifications}
          limitTypeOptions={limitTypeOptions}
          periodOptions={periodOptions}
          unitOptions={unitOptions}
          swimLevelOptions={swimLevelOptions}
          onClose={() => setEditingOffering(null)}
        />
      ) : null}
    </Panel>
  );
}

/* ─── Inline-editable table row ─── */

function OfferingRow({
  offering,
  canEdit,
  selected,
  onToggleSelect,
  onEdit
}: {
  offering: OfferingItem;
  canEdit: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function inlineSave(field: string, value: string | number | boolean) {
    const formData = new FormData();
    formData.set("id", offering.id);
    formData.set("limitType", offering.limitType);
    formData.set("staffTarget", String(offering.staffTarget));
    formData.set("rosterLimit", offering.rosterLimit != null ? String(offering.rosterLimit) : "");

    if (field === "rosterLimit") formData.set("rosterLimit", String(value));
    if (field === "staffTarget") formData.set("staffTarget", String(value));
    if (field === "active") {
      formData.set("active", value ? "on" : "off");
    } else {
      formData.set("active", offering.active ? "on" : "off");
    }

    // Preserve existing flags
    formData.set("preAssigned", offering.preAssigned ? "on" : "off");
    formData.set("spansTwoPeriods", offering.spansTwoPeriods ? "on" : "off");
    formData.set("visibleOnMenu", offering.visibleOnMenu ? "on" : "off");
    formData.set("visibleOnMasterMenu", offering.visibleOnMasterMenu ? "on" : "off");
    formData.set("includeInPrint", offering.includeInPrint ? "on" : "off");
    formData.set("allowOverride", offering.allowOverride ? "on" : "off");
    if (!offering.visibleForCamperRegistration) formData.set("staffOnlyForCamperRegistration", "on");
    formData.set("notes", offering.notes ?? "");

    startTransition(() => { updateOffering(formData); });
  }

  const swimLabels = offering.eligibleSwimLevels.length
    ? offering.eligibleSwimLevels.map((s) => s.replace("PENDING_SWIM_TEST", "PST").replace("BLUEGILL", "BG").replace("WALLEYE", "WE").replace("MUSKIE", "MK")).join(", ")
    : "";

  return (
    <tr className={`border-b align-top last:border-0 ${isPending ? "opacity-50" : ""}`}>
      {canEdit ? (
        <td className="py-3 pl-4">
          <input aria-label={`Select ${offering.activity.name} ${offering.periodLabel}`} checked={selected} type="checkbox" onChange={onToggleSelect} />
        </td>
      ) : null}
      <td className={canEdit ? "py-3 font-semibold" : "py-3 pl-4 font-semibold"}>{offering.periodLabel}</td>
      <td>
        <span className="inline-flex min-w-0 items-center gap-2">
          <ActivityIcon activity={offering.activity.name} area={offering.area.name} size="sm" />
          <span className="font-bold text-forest-900">{offering.activity.name}</span>
        </span>
      </td>
      <td>
        {canEdit ? (
          <input
            className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold hover:border-slate-300 focus:border-lake-400 focus:outline-none"
            type="number"
            min="0"
            defaultValue={offering.rosterLimit ?? ""}
            placeholder="∞"
            onBlur={(e) => inlineSave("rosterLimit", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
          />
        ) : (
          <span>{offering.camperCount} / {offering.rosterLimit ?? "∞"}</span>
        )}
      </td>
      <td>
        {canEdit ? (
          <input
            className="w-12 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold hover:border-slate-300 focus:border-lake-400 focus:outline-none"
            type="number"
            min="1"
            defaultValue={offering.staffTarget}
            onBlur={(e) => inlineSave("staffTarget", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
          />
        ) : (
          <span>{offering.staffCount} / {offering.staffTarget}</span>
        )}
      </td>
      <td><span className="text-xs font-medium text-slate-500">{swimLabels || "—"}</span></td>
      <td>
        {canEdit ? (
          <button
            type="button"
            className={`rounded-full px-2.5 py-1 text-xs font-black ${offering.active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"}`}
            onClick={() => inlineSave("active", !offering.active)}
          >
            {offering.active ? "Active" : "Off"}
          </button>
        ) : (
          offering.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>
        )}
      </td>
      <td className="space-x-1">
        {offering.preAssigned ? <Badge tone="amber">Pre</Badge> : null}
        {!offering.visibleForCamperRegistration ? <Badge tone="amber">Staff</Badge> : null}
        {!offering.visibleOnMenu ? <Badge>Std ✗</Badge> : null}
        {!offering.visibleOnMasterMenu ? <Badge>Mst ✗</Badge> : null}
        {!offering.includeInPrint ? <Badge>Prn ✗</Badge> : null}
      </td>
      <td className="max-w-40 truncate text-xs text-slate-500">{offering.notes}</td>
      <td className="pr-4">
        {canEdit ? (
          <button type="button" className="text-sm font-black text-lake-700 hover:underline" onClick={onEdit}>Edit</button>
        ) : null}
      </td>
    </tr>
  );
}

/* ─── Full Edit Modal ─── */

function EditOfferingModal({
  offering,
  certifications,
  limitTypeOptions,
  periodOptions,
  unitOptions,
  swimLevelOptions,
  onClose
}: {
  offering: OfferingItem;
  certifications: CertificationOption[];
  limitTypeOptions: Option[];
  periodOptions: Option[];
  unitOptions: Option[];
  swimLevelOptions: Option[];
  onClose: () => void;
}) {
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(offering.activity.name);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicatePeriods, setDuplicatePeriods] = useState<string[]>([]);
  const isWaterfront = offering.area.name.toLowerCase().includes("waterfront");

  const nameDirty = nameValue.trim() !== offering.activity.name && nameValue.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-12" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="min-w-0 flex-1">
            {editingName ? (
              <form action={async (formData) => {
                await renameActivity(formData);
                setEditingName(false);
              }} className="flex flex-wrap items-center gap-2">
                <input name="activityId" type="hidden" value={offering.activity.id} />
                <input
                  className={`${inputClass} max-w-sm text-xl font-black`}
                  name="newName"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  autoFocus
                />
                <button className={buttonClass} type="submit" disabled={!nameDirty}>Save name</button>
                <button type="button" className="text-sm font-bold text-slate-600 hover:underline" onClick={() => { setNameValue(offering.activity.name); setEditingName(false); }}>Cancel</button>
                <p className="basis-full text-xs font-bold text-amber-700">Note: renaming changes the activity name on every period it's offered.</p>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-forest-900">{offering.activity.name}</h2>
                <button type="button" className="text-xs font-bold text-lake-700 hover:underline" onClick={() => setEditingName(true)}>Rename</button>
              </div>
            )}
            <p className="mt-0.5 text-sm font-medium text-slate-500">{offering.area.name} · {offering.periodLabel} · {offering.camperCount} campers · {offering.staffCount} staff</p>
          </div>
          <button type="button" className="rounded-lg p-2 hover:bg-slate-100" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {/* Form */}
        <form action={async (formData) => { await updateOffering(formData); onClose(); }} className="p-6">
          <input name="id" type="hidden" value={offering.id} />

          {/* Row 1: Period, Limit, Type, Staff */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Period">
              <select className={inputClass} name="period" defaultValue={offering.period}>
                {periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Roster limit">
              <input className={inputClass} name="rosterLimit" type="number" min="0" defaultValue={offering.rosterLimit ?? ""} placeholder="Unlimited" />
            </Field>
            <Field label="Limit type">
              <select className={inputClass} name="limitType" defaultValue={offering.limitType}>
                {limitTypeOptions.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </Field>
            <Field label="Staff target">
              <input className={inputClass} name="staffTarget" type="number" min="1" defaultValue={offering.staffTarget} />
            </Field>
          </div>

          {/* Notes */}
          <div className="mt-4">
            <Field label="Notes">
              <input className={inputClass} name="notes" defaultValue={offering.notes ?? ""} placeholder="Equipment, level info, special instructions…" />
            </Field>
          </div>

          {/* Units */}
          <div className="mt-5">
            <p className="mb-2 text-sm font-black text-slate-700">Eligible units</p>
            <div className="flex flex-wrap gap-2">
              {unitOptions.map((option) => (
                <label key={option.value} className="cursor-pointer">
                  <input className="peer sr-only" name="eligibleUnits" type="checkbox" value={option.value} defaultChecked={offering.eligibleUnits.includes(option.value) || !offering.eligibleUnits.length} />
                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Swim levels — highlighted for waterfront */}
          <div className={`mt-5 rounded-lg p-4 ${isWaterfront ? "border border-lake-200 bg-lake-50" : ""}`}>
            <p className="mb-2 text-sm font-black text-slate-700">{isWaterfront ? "Waterfront swim level requirement" : "Eligible swim levels"}</p>
            <div className="flex flex-wrap gap-2">
              {swimLevelOptions.map((option) => (
                <label key={option.value} className="cursor-pointer">
                  <input className="peer sr-only" name="eligibleSwimLevels" type="checkbox" value={option.value} defaultChecked={offering.eligibleSwimLevels.includes(option.value) || !offering.eligibleSwimLevels.length} />
                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 transition peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Flags */}
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm font-bold"><input className="h-4 w-4" name="active" type="checkbox" value="on" defaultChecked={offering.active} />Active</label>
            <label className="flex items-center gap-2 text-sm font-bold"><input className="h-4 w-4" name="preAssigned" type="checkbox" value="on" defaultChecked={offering.preAssigned} />Pre-assigned (no camper choice)</label>
            <label className="flex items-center gap-2 text-sm font-bold"><input className="h-4 w-4" name="spansTwoPeriods" type="checkbox" value="on" defaultChecked={offering.spansTwoPeriods} />Runs two periods (this + next consecutive period)</label>
            <label className="flex items-center gap-2 text-sm font-bold"><input className="h-4 w-4" name="staffOnlyForCamperRegistration" type="checkbox" defaultChecked={!offering.visibleForCamperRegistration} />Staff only (hide from camper reg)</label>
            <label className="flex items-center gap-2 text-sm font-bold"><input className="h-4 w-4" name="allowOverride" type="checkbox" value="on" defaultChecked={offering.allowOverride} />Allow override</label>
            <ModalToggle name="visibleOnMenu" label="Show on Standard A/B menu" defaultChecked={offering.visibleOnMenu} />
            <ModalToggle name="visibleOnMasterMenu" label="Show on Master A/B menu" defaultChecked={offering.visibleOnMasterMenu} />
            <ModalToggle name="includeInPrint" label="Include in print" defaultChecked={offering.includeInPrint} />
          </div>

          {/* Menu rows */}
          {offering.menuRows.length ? (
            <div className="mt-5 rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-black uppercase text-slate-500">Menu display rows / units</p>
              <div className="grid gap-2">
                {offering.menuRows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between rounded border border-slate-100 px-3 py-2">
                    <input name="menuRowId" type="hidden" value={row.id} />
                    <span className="text-sm font-black text-forest-900">{row.label}</span>
                    <div className="flex gap-4">
                      <label className="text-xs font-bold"><input className="mr-1.5" name={`menuRowVisible-${row.id}`} type="checkbox" defaultChecked={row.visible} />Visible</label>
                      <label className="text-xs font-bold"><input className="mr-1.5" name={`menuRowPrint-${row.id}`} type="checkbox" defaultChecked={row.includeInPrint} />Print</label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Required certifications */}
          {certifications.length ? (
            <div className="mt-5">
              <p className="mb-2 text-sm font-black text-slate-700">Required certifications</p>
              <div className="flex flex-wrap gap-2">
                {certifications.map((certification) => {
                  const checked = offering.activity.requiredCertifications.some((r) => r.id === certification.id);
                  return (
                    <label key={certification.id} className="cursor-pointer">
                      <input className="peer sr-only" name="certificationIds" type="checkbox" value={certification.id} defaultChecked={checked} />
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-700 transition peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white">{certification.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Action buttons */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" className="text-sm font-black text-red-700 hover:underline" onClick={() => setShowDelete(true)}>Delete this offering</button>
              <button type="button" className="text-sm font-black text-lake-700 hover:underline" onClick={() => setShowDuplicate(true)}>Duplicate to other periods…</button>
            </div>
            <div className="flex gap-2">
              <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancel</button>
              <button type="submit" className={buttonClass}>Save changes</button>
            </div>
          </div>
        </form>

        {/* Inline duplicate panel */}
        {showDuplicate ? (
          <div className="border-t border-lake-200 bg-lake-50 px-6 py-4">
            <p className="text-sm font-black text-lake-900">Duplicate this offering to other periods</p>
            <p className="mt-1 text-xs font-medium text-lake-700">Pick the periods to create copies in. The source period is excluded. Roster and staff settings, units, swim levels, and notes are all copied — registrations are also copied to new periods.</p>
            <form action={async (formData) => {
              await duplicateOffering(formData);
              setShowDuplicate(false);
              setDuplicatePeriods([]);
              onClose();
            }} className="mt-3 grid gap-3">
              <input name="sourceOfferingId" type="hidden" value={offering.id} />
              <input name="daySelection" type="hidden" value="CUSTOM" />
              <div className="flex flex-wrap gap-2">
                {periodOptions.filter((p) => p.value !== offering.period).map((option) => {
                  const checked = duplicatePeriods.includes(option.value);
                  return (
                    <label key={option.value} className="cursor-pointer">
                      <input
                        className="peer sr-only"
                        name="periods"
                        type="checkbox"
                        value={option.value}
                        checked={checked}
                        onChange={(e) => {
                          setDuplicatePeriods((current) =>
                            e.target.checked ? [...current, option.value] : current.filter((p) => p !== option.value)
                          );
                        }}
                      />
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 transition peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white">{option.label}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center gap-3">
                <button type="button" className="text-xs font-bold text-lake-700 hover:underline" onClick={() => setDuplicatePeriods(periodOptions.filter((p) => p.value !== offering.period).map((p) => p.value))}>Select all</button>
                <button type="button" className="text-xs font-bold text-slate-500 hover:underline" onClick={() => setDuplicatePeriods([])}>Clear</button>
              </div>
              <div className="flex items-center gap-3">
                <button className={buttonClass} type="submit" disabled={duplicatePeriods.length === 0}>Create {duplicatePeriods.length || ""} {duplicatePeriods.length === 1 ? "copy" : "copies"}</button>
                <button type="button" className="text-sm font-bold text-slate-600 hover:underline" onClick={() => { setShowDuplicate(false); setDuplicatePeriods([]); }}>Cancel</button>
              </div>
            </form>
          </div>
        ) : null}

        {/* Inline delete confirmation */}
        {showDelete ? (
          <div className="border-t border-red-200 bg-red-50 px-6 py-4">
            <p className="text-sm font-bold text-red-800">Type DELETE to permanently remove this offering and all its registrations/staffing records.</p>
            <form action={async (formData) => { await deleteOffering(formData); onClose(); }} className="mt-3 flex items-center gap-3">
              <input name="id" type="hidden" value={offering.id} />
              <input className={`${inputClass} w-40`} name="confirmDelete" placeholder="DELETE" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
              <button className={dangerButtonClass} type="submit" disabled={deleteConfirm.toUpperCase() !== "DELETE"}>Delete</button>
              <button type="button" className="text-sm font-bold text-slate-600 hover:underline" onClick={() => { setShowDelete(false); setDeleteConfirm(""); }}>Cancel</button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Shared UI components ─── */

function ChipSet({ name, title, options, defaultChecked = false }: { name: string; title: string; options: Option[]; defaultChecked?: boolean }) {
  return (
    <div className="xl:col-span-2">
      <p className="mb-2 text-sm font-semibold text-slate-700">{title}</p>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label key={option.value} className="cursor-pointer">
            <input className="peer sr-only" name={name} type="checkbox" value={option.value} defaultChecked={defaultChecked} />
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white hover:border-lake-300">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <>
      <input name={name} type="hidden" value="off" />
      <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
        <input name={name} type="checkbox" value="on" defaultChecked={defaultChecked} />{label}
      </label>
    </>
  );
}

function ModalToggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <>
      <input name={name} type="hidden" value="off" />
      <label className="flex items-center gap-2 text-sm font-bold"><input className="h-4 w-4" name={name} type="checkbox" value="on" defaultChecked={defaultChecked} />{label}</label>
    </>
  );
}
