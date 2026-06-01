"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, inputClass } from "@/components/ui";

type StaffRow = {
  id: string;
  name: string;
  primaryArea: string;
  skills: string[];
  certifications: string[];
  availabilityNotes?: string | null;
  assignments: Record<string, string>;
};

type OfferingOption = {
  id: string;
  label: string;
  period: string;
  periodLabel: string;
  area: string;
  activity: string;
};

type PeriodOption = {
  value: string;
  label: string;
};

export function ScreamSessionBoard({
  staff,
  offerings,
  periods
}: {
  staff: StaffRow[];
  offerings: OfferingOption[];
  periods: PeriodOption[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [assignments, setAssignments] = useState(() => staff.map((row) => ({ ...row.assignments })));
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const activeStaff = staff[activeIndex];

  const offeringsByPeriod = useMemo(() => {
    return periods.reduce<Record<string, OfferingOption[]>>((record, period) => {
      record[period.value] = offerings.filter((offering) => offering.period === period.value);
      return record;
    }, {});
  }, [offerings, periods]);

  function saveAssignment(period: string, offeringId: string) {
    if (!activeStaff) return;
    setAssignments((current) => current.map((row, index) => (index === activeIndex ? { ...row, [period]: offeringId } : row)));
    setMessage(offeringId ? "Saving..." : "Removing...");
    startTransition(async () => {
      const response = await fetch("/api/staff-assignments", {
        method: offeringId ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(offeringId ? { staffId: activeStaff.id, offeringId } : { staffId: activeStaff.id, period })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Assignment failed.");
        return;
      }
      setMessage(offeringId ? data.warnings?.length ? data.warnings.join(" ") : `Saved ${activeStaff.name} to ${data.label}.` : `Removed ${activeStaff.name} from ${period}.`);
    });
  }

  if (!activeStaff) return null;

  return (
    <div className="grid gap-5 xl:grid-cols-[20rem_1fr]">
      <section className="rounded-lg border border-white bg-white p-4 shadow-soft">
        <input className={inputClass} placeholder="Jump by name" onChange={(event) => {
          const term = event.target.value.toLowerCase();
          const index = staff.findIndex((row) => row.name.toLowerCase().includes(term));
          if (index >= 0) setActiveIndex(index);
        }} />
        <div className="mt-4 max-h-[70vh] overflow-auto">
          {staff.map((row, index) => (
            <button
              key={row.id}
              className={`mb-1 block w-full rounded-md px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-forest-700 font-semibold text-white" : "hover:bg-forest-50"}`}
              type="button"
              onClick={() => setActiveIndex(index)}
            >
              {row.name}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-lake-700">Alphabetical scream session</p>
            <h2 className="mt-1 text-4xl font-bold text-forest-900">{activeStaff.name}</h2>
            <p className="mt-2 text-slate-500">{activeStaff.primaryArea || "No primary area"} - {activeStaff.availabilityNotes || "No availability notes"}</p>
          </div>
          <Badge tone="blue">{activeIndex + 1} / {staff.length}</Badge>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {activeStaff.skills.map((skill) => <Badge key={skill} tone="green">{skill}</Badge>)}
          {activeStaff.certifications.map((cert) => <Badge key={cert} tone="blue">{cert}</Badge>)}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {periods.map((period) => (
            <label key={period.value} className="rounded-lg border border-slate-100 bg-paper/70 p-3 text-sm font-semibold text-forest-900">
              <span>{period.label}</span>
              <select
                className="mt-2 w-full rounded-md border border-slate-200 bg-white p-2 text-sm font-normal text-slate-700"
                value={assignments[activeIndex]?.[period.value] ?? ""}
                disabled={isPending}
                onChange={(event) => saveAssignment(period.value, event.target.value)}
              >
                <option value="">Unassigned</option>
                {offeringsByPeriod[period.value]?.map((offering) => (
                  <option key={offering.id} value={offering.id}>{offering.area} - {offering.activity}</option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold" type="button" onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}>Previous</button>
          <p className="text-sm font-medium text-slate-600">{message}</p>
          <button className="rounded-md bg-forest-700 px-4 py-2 text-sm font-semibold text-white" type="button" onClick={() => setActiveIndex(Math.min(staff.length - 1, activeIndex + 1))}>Next staff</button>
        </div>
      </section>
    </div>
  );
}
