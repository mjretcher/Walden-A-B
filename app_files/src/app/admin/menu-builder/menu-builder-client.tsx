"use client";

import { useEffect, useMemo, useState } from "react";
import { ActivityIcon } from "@/components/activity-icon";
import { Badge, Field, Panel, SectionHeader, buttonClass, dangerButtonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { DEFAULT_STAFF_TARGET, filterActivitiesForArea } from "@/lib/menu-builder-behavior";
import { createOffering, deleteOffering, deleteOfferings, duplicateOffering, updateOffering } from "./actions";

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
  allowOverride: boolean;
  visibleOnMenu: boolean;
  visibleOnMasterMenu: boolean;
  includeInPrint: boolean;
  notes: string | null;
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
  const filteredActivities = useMemo(() => filterActivitiesForArea(activities, selectedAreaId), [activities, selectedAreaId]);
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
              <select className={inputClass} name="period" defaultValue="P1B">
                {periodOptions.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
              </select>
            </Field>
            <Field label="Create for">
              <select className={inputClass} name="daySelection" defaultValue="SINGLE">
                <option value="SINGLE">Selected period</option>
                <option value="B">B day</option>
                <option value="A">A day</option>
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
          <ChipSet name="eligibleSwimLevels" title="Eligible swim levels" options={swimLevelOptions} defaultChecked />
          <div className="flex flex-wrap gap-4 xl:col-span-3">
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold"><input name="allowOverride" type="checkbox" defaultChecked />Allow override</label>
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold"><input name="preAssigned" type="checkbox" />Pre-assigned</label>
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
      />
    </>
  );
}

function OfferingsPanel({
  canEdit,
  certifications,
  limitTypeOptions,
  offerings,
  offeringsByArea,
  periodOptions
}: {
  canEdit: boolean;
  certifications: CertificationOption[];
  limitTypeOptions: Option[];
  offerings: OfferingItem[];
  offeringsByArea: { area: AreaOption; offerings: OfferingItem[] }[];
  periodOptions: Option[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const selectedOfferings = offerings.filter((offering) => selectedIds.includes(offering.id));

  function toggleSelection(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <Panel>
      <SectionHeader title="Current Offerings" detail="Edit limits, staffing targets, active state, and operating flags.">
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
                    <th>Type</th>
                    <th>Staff</th>
                    <th>Certs</th>
                    <th>Flags</th>
                    <th>Notes</th>
                    <th className="pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {group.offerings.map((offering) => (
                    <tr key={offering.id} className="border-b align-top last:border-0">
                      {canEdit ? (
                        <td className="py-3 pl-4">
                          <input aria-label={`Select ${offering.activity.name} ${offering.periodLabel}`} checked={selectedIds.includes(offering.id)} type="checkbox" onChange={() => toggleSelection(offering.id)} />
                        </td>
                      ) : null}
                      <td className={canEdit ? "py-3 font-semibold" : "py-3 pl-4 font-semibold"}>{offering.periodLabel}</td>
                      <td>
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <ActivityIcon activity={offering.activity.name} area={offering.area.name} size="sm" />
                          <span className="font-bold text-forest-900">{offering.activity.name}</span>
                        </span>
                      </td>
                      <td>{offering.camperCount} / {offering.rosterLimit ?? "approval"}</td>
                      <td>{offering.limitType.replaceAll("_", " ")}</td>
                      <td>{offering.staffCount} / {offering.staffTarget}</td>
                      <td>
                        <div className="flex max-w-44 flex-wrap gap-1">
                          {offering.activity.requiredCertifications.length ? offering.activity.requiredCertifications.map((certification) => (
                            <Badge key={certification.id} tone="blue">{certification.name}</Badge>
                          )) : <span className="text-xs font-semibold text-slate-400">None</span>}
                        </div>
                      </td>
                      <td className="space-x-1">
                        {offering.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                        {offering.preAssigned ? <Badge tone="amber">Pre</Badge> : null}
                        {offering.visibleOnMenu ? <Badge tone="blue">Standard</Badge> : <Badge>Std hidden</Badge>}
                        {offering.visibleOnMasterMenu ? <Badge tone="blue">Master</Badge> : <Badge>Master hidden</Badge>}
                        {offering.includeInPrint ? <Badge tone="green">Print</Badge> : <Badge>Screen only</Badge>}
                      </td>
                      <td className="max-w-56 text-slate-500">{offering.notes}</td>
                      <td className="pr-4">
                        {canEdit ? (
                          <OfferingActions offering={offering} certifications={certifications} limitTypeOptions={limitTypeOptions} periodOptions={periodOptions} />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
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
    </Panel>
  );
}

function OfferingActions({
  offering,
  certifications,
  limitTypeOptions,
  periodOptions
}: {
  offering: OfferingItem;
  certifications: CertificationOption[];
  limitTypeOptions: Option[];
  periodOptions: Option[];
}) {
  return (
    <div className="grid gap-2">
      <details>
        <summary className="cursor-pointer font-semibold text-lake-700">Edit</summary>
        <form action={updateOffering} className="mt-3 grid w-72 gap-2 rounded-md bg-paper p-3">
          <input name="id" type="hidden" value={offering.id} />
          <input className={inputClass} name="rosterLimit" type="number" defaultValue={offering.rosterLimit ?? ""} placeholder="Roster limit" />
          <select className={inputClass} name="limitType" defaultValue={offering.limitType}>
            {limitTypeOptions.map((limit) => <option key={limit.value} value={limit.value}>{limit.label}</option>)}
          </select>
          <input className={inputClass} name="staffTarget" min="1" type="number" defaultValue={offering.staffTarget} />
          <input className={inputClass} name="notes" defaultValue={offering.notes ?? ""} />
          <label><input className="mr-2" name="active" type="checkbox" defaultChecked={offering.active} />Active</label>
          <label><input className="mr-2" name="preAssigned" type="checkbox" defaultChecked={offering.preAssigned} />Pre-assigned</label>
          <EditToggle name="visibleOnMenu" label="Show on Standard A/B menu" defaultChecked={offering.visibleOnMenu} />
          <EditToggle name="visibleOnMasterMenu" label="Show on Master A/B menu" defaultChecked={offering.visibleOnMasterMenu} />
          <EditToggle name="includeInPrint" label="Include in print" defaultChecked={offering.includeInPrint} />
          <label><input className="mr-2" name="allowOverride" type="checkbox" defaultChecked={offering.allowOverride} />Allow override</label>
          {offering.menuRows.length ? (
            <div className="rounded-md border border-slate-200 bg-white p-2">
              <p className="mb-2 text-xs font-black uppercase text-slate-500">Menu rows / units</p>
              <div className="grid gap-2">
                {offering.menuRows.map((row) => (
                  <div key={row.id} className="rounded border border-slate-100 p-2">
                    <input name="menuRowId" type="hidden" value={row.id} />
                    <p className="text-sm font-black text-forest-900">{row.label}</p>
                    <label className="mr-3 text-xs font-bold"><input className="mr-1" name={`menuRowVisible-${row.id}`} type="checkbox" defaultChecked={row.visible} />Visible</label>
                    <label className="text-xs font-bold"><input className="mr-1" name={`menuRowPrint-${row.id}`} type="checkbox" defaultChecked={row.includeInPrint} />Print</label>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {certifications.length ? (
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Required certs</p>
              <div className="flex flex-wrap gap-2">
                {certifications.map((certification) => {
                  const checked = offering.activity.requiredCertifications.some((required) => required.id === certification.id);
                  return (
                    <label key={certification.id} className="cursor-pointer">
                      <input className="peer sr-only" name="certificationIds" type="checkbox" value={certification.id} defaultChecked={checked} />
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-700 transition peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white hover:border-lake-300">{certification.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
          <button className={buttonClass} type="submit">Save</button>
        </form>
      </details>
      <details>
        <summary className="cursor-pointer font-semibold text-lake-700">Copy</summary>
        <form action={duplicateOffering} className="mt-3 grid w-72 gap-2 rounded-md bg-paper p-3">
          <input name="sourceOfferingId" type="hidden" value={offering.id} />
          <Field label="Create for">
            <select className={inputClass} name="daySelection" defaultValue="B">
              <option value="A">A day</option>
              <option value="B">B day</option>
              <option value="BOTH">A and B days</option>
              <option value="CUSTOM">Checked periods</option>
            </select>
          </Field>
          <ChipSet name="periods" title="Checked periods" options={periodOptions} />
          <button className={buttonClass} type="submit">Create copies</button>
        </form>
      </details>
      <details>
        <summary className="cursor-pointer font-semibold text-red-700">Delete</summary>
        <form action={deleteOffering} className="mt-3 grid w-64 gap-2 rounded-md border border-red-200 bg-red-50 p-3">
          <input name="id" type="hidden" value={offering.id} />
          <p className="text-xs font-bold text-red-800">Type DELETE to permanently remove this offering and its registrations/staffing records.</p>
          <input className={inputClass} name="confirmDelete" placeholder="DELETE" />
          <button className={dangerButtonClass} type="submit">Delete offering</button>
        </form>
      </details>
    </div>
  );
}

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

function EditToggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <>
      <input name={name} type="hidden" value="off" />
      <label><input className="mr-2" name={name} type="checkbox" value="on" defaultChecked={defaultChecked} />{label}</label>
    </>
  );
}
