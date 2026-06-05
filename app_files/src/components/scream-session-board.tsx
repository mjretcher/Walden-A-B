"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Search, X } from "lucide-react";
import { Badge, Panel, SectionHeader, buttonClass, secondaryButtonClass } from "@/components/ui";

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
  staffTarget: number;
  staffAssigned: number;
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
  const [staffQuery, setStaffQuery] = useState("");
  const [assignments, setAssignments] = useState(() => staff.map((row) => ({ ...row.assignments })));
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const activeStaff = staff[activeIndex];

  const offeringStaffCounts = useMemo(() => {
    const counts = new Map(offerings.map((offering) => [offering.id, staff.length ? 0 : offering.staffAssigned]));
    if (staff.length) {
      assignments.forEach((row) => {
        Object.values(row).forEach((offeringId) => {
          if (!offeringId) return;
          counts.set(offeringId, (counts.get(offeringId) ?? 0) + 1);
        });
      });
    }
    return counts;
  }, [assignments, offerings, staff.length]);

  const areaSummaries = useMemo(() => {
    const summaries = new Map<string, {
      area: string;
      assigned: number;
      target: number;
      needsStaff: number;
      complete: number;
      overstaffed: number;
      offerings: number;
    }>();

    offerings.forEach((offering) => {
      const assigned = offeringStaffCounts.get(offering.id) ?? 0;
      const target = offering.staffTarget;
      const summary = summaries.get(offering.area) ?? {
        area: offering.area,
        assigned: 0,
        target: 0,
        needsStaff: 0,
        complete: 0,
        overstaffed: 0,
        offerings: 0
      };

      summary.assigned += assigned;
      summary.target += target;
      summary.offerings += 1;
      if (assigned < target) summary.needsStaff += 1;
      else if (assigned > target) summary.overstaffed += 1;
      else summary.complete += 1;
      summaries.set(offering.area, summary);
    });

    return Array.from(summaries.values()).sort((left, right) => left.area.localeCompare(right.area));
  }, [offeringStaffCounts, offerings]);

  const overallSignals = useMemo(() => {
    return areaSummaries.reduce(
      (total, area) => ({
        needsStaff: total.needsStaff + area.needsStaff,
        complete: total.complete + area.complete,
        overstaffed: total.overstaffed + area.overstaffed
      }),
      { needsStaff: 0, complete: 0, overstaffed: 0 }
    );
  }, [areaSummaries]);

  const offeringsByPeriod = useMemo(() => {
    return periods.reduce<Record<string, OfferingOption[]>>((record, period) => {
      record[period.value] = offerings.filter((offering) => offering.period === period.value);
      return record;
    }, {});
  }, [offerings, periods]);

  const filteredStaff = useMemo(() => {
    const term = staffQuery.trim().toLowerCase();
    if (!term) return staff;
    return staff.filter((row) => `${row.name} ${row.primaryArea} ${row.skills.join(" ")} ${row.certifications.join(" ")}`.toLowerCase().includes(term));
  }, [staff, staffQuery]);

  function assignmentLabel(period: string) {
    const offeringId = assignments[activeIndex]?.[period];
    const offering = offerings.find((item) => item.id === offeringId);
    return offering ? `${offering.area} - ${offering.activity}` : "Unassigned";
  }

  function assignedOffering(period: string) {
    const offeringId = assignments[activeIndex]?.[period];
    return offerings.find((item) => item.id === offeringId);
  }

  function saveAssignment(period: string, offeringId: string) {
    if (!activeStaff) return;
    const staffIndex = activeIndex;
    const staffName = activeStaff.name;
    const previousOfferingId = assignments[staffIndex]?.[period] ?? "";
    setAssignments((current) => current.map((row, index) => (index === staffIndex ? { ...row, [period]: offeringId } : row)));
    setMessage(offeringId ? "Saving..." : "Removing...");
    startTransition(async () => {
      const response = await fetch("/api/staff-assignments", {
        method: offeringId ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(offeringId ? { staffId: activeStaff.id, offeringId } : { staffId: activeStaff.id, period })
      });
      const data = await response.json();
      if (!response.ok) {
        setAssignments((current) => current.map((row, index) => (index === staffIndex ? { ...row, [period]: previousOfferingId } : row)));
        setMessage(data.error ?? "Assignment failed.");
        return;
      }
      setMessage(offeringId ? data.warnings?.length ? data.warnings.join(" ") : `Saved ${staffName} to ${data.label}.` : `Removed ${staffName} from ${period}.`);
    });
  }

  if (!activeStaff) return null;

  return (
    <div className="grid gap-5 xl:grid-cols-[21rem_minmax(0,1fr)_20rem]">
      <Panel className="p-4">
        <SectionHeader title="Staff Queue" detail={`${activeIndex + 1} of ${staff.length}`} />
        <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            className="min-h-8 flex-1 bg-transparent text-sm outline-none"
            placeholder="Jump by name, area, skill"
            value={staffQuery}
            onChange={(event) => {
              const term = event.target.value;
              setStaffQuery(term);
              const index = staff.findIndex((row) => row.name.toLowerCase().includes(term.toLowerCase()));
              if (term && index >= 0) setActiveIndex(index);
            }}
          />
        </label>
        <div className="mt-4 max-h-[70vh] overflow-auto pr-1">
          {filteredStaff.map((row) => {
            const index = staff.findIndex((staffRow) => staffRow.id === row.id);
            return (
            <button
              key={row.id}
              className={`mb-1 block w-full rounded-md px-3 py-2 text-left text-sm transition ${index === activeIndex ? "bg-forest-700 font-bold text-white shadow-sm" : "text-slate-700 hover:bg-forest-50 hover:text-forest-900"}`}
              type="button"
              onClick={() => setActiveIndex(index)}
            >
              <span className="block font-bold">{row.name}</span>
              <span className={`block text-xs ${index === activeIndex ? "text-forest-50" : "text-slate-500"}`}>{row.primaryArea || "No primary area"}</span>
            </button>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-lake-700">Alphabetical scream session</p>
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
          {periods.map((period) => {
            const currentOffering = assignedOffering(period.value);
            const assignedCount = currentOffering ? offeringStaffCounts.get(currentOffering.id) ?? 0 : 0;
            const isUnderTarget = currentOffering ? assignedCount < currentOffering.staffTarget : false;
            return (
              <label key={period.value} className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-forest-900 shadow-sm">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-lg font-black">{period.label}</span>
                  <Badge tone={currentOffering ? isUnderTarget ? "amber" : "green" : "neutral"}>{currentOffering ? "Set" : "Open"}</Badge>
                </span>
                <span className="mt-2 block min-h-12 rounded-md bg-forest-50 px-3 py-2 text-sm font-bold text-forest-900">{assignmentLabel(period.value)}</span>
                {currentOffering ? (
                  <span className="mt-2 flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
                    <span>Staff {assignedCount} / {currentOffering.staffTarget}</span>
                    {isUnderTarget ? <span className="text-amber-700">Needs staff</span> : <span className="text-forest-700">Covered</span>}
                  </span>
                ) : null}
                <select
                  className="mt-2 w-full rounded-md border border-slate-200 bg-white p-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-lake-500 focus:ring-2 focus:ring-lake-100"
                  value={assignments[activeIndex]?.[period.value] ?? ""}
                  disabled={isPending}
                  onChange={(event) => saveAssignment(period.value, event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {offeringsByPeriod[period.value]?.map((offering) => (
                    <option key={offering.id} value={offering.id}>{offering.area} - {offering.activity}</option>
                  ))}
                </select>
                {currentOffering ? (
                  <button
                    className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isPending}
                    type="button"
                    onClick={() => saveAssignment(period.value, "")}
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </button>
                ) : null}
              </label>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button className={secondaryButtonClass} type="button" onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}>Previous</button>
          <p className="text-sm font-medium text-slate-600">{message}</p>
          <button className={buttonClass} type="button" onClick={() => setActiveIndex(Math.min(staff.length - 1, activeIndex + 1))}>Next staff</button>
        </div>
      </Panel>

      <Panel className="p-4">
        <SectionHeader title="Staffing Signals" detail="Live from current assignments" />
        <div className="grid gap-3">
          <SignalRow icon={<AlertTriangle className="h-4 w-4" />} label="Needs staff" value={overallSignals.needsStaff} tone="amber" />
          <SignalRow icon={<CheckCircle2 className="h-4 w-4" />} label="Complete" value={overallSignals.complete} tone="green" />
          <SignalRow icon={<AlertTriangle className="h-4 w-4" />} label="Overstaffed" value={overallSignals.overstaffed} tone="blue" />
        </div>

        <div className="mt-5 grid gap-2">
          {areaSummaries.map((area) => {
            const missing = Math.max(area.target - area.assigned, 0);
            return (
              <div key={area.area} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-black text-forest-900">{area.area}</p>
                  <Badge tone={missing ? "amber" : area.assigned > area.target ? "blue" : "green"}>{area.assigned} / {area.target}</Badge>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {missing ? `${missing} missing` : area.assigned > area.target ? `${area.assigned - area.target} over target` : "Staffing target met"}
                </p>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function SignalRow({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "amber" | "green" | "blue";
}) {
  const tones = {
    amber: "bg-amber-50 text-amber-800",
    green: "bg-forest-50 text-forest-800",
    blue: "bg-lake-50 text-lake-800"
  };

  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${tones[tone]}`}>
      <span className="inline-flex items-center gap-2 text-sm font-black">
        {icon}
        {label}
      </span>
      <span className="text-lg font-black">{value}</span>
    </div>
  );
}
