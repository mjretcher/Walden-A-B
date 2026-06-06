"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Clock, Search, SlidersHorizontal } from "lucide-react";
import { Badge, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

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

export function ScreamSessionBoard({ staff, offerings, periods }: { staff: StaffRow[]; offerings: OfferingOption[]; periods: PeriodOption[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [staffQuery, setStaffQuery] = useState("");
  const [assignments, setAssignments] = useState(() => staff.map((row) => ({ ...row.assignments })));
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const activeStaff = staff[activeIndex];

  const offeringStaffCounts = useMemo(() => {
    const counts = new Map(offerings.map((offering) => [offering.id, 0]));
    assignments.forEach((row) => {
      Object.values(row).forEach((offeringId) => {
        if (offeringId) counts.set(offeringId, (counts.get(offeringId) ?? 0) + 1);
      });
    });
    return counts;
  }, [assignments, offerings]);

  const offeringsByPeriod = useMemo(() => {
    return periods.reduce<Record<string, OfferingOption[]>>((record, period) => {
      record[period.value] = offerings.filter((offering) => offering.period === period.value);
      return record;
    }, {});
  }, [offerings, periods]);

  const areaSummaries = useMemo(() => {
    const summaries = new Map<string, { area: string; assigned: number; target: number }>();
    offerings.forEach((offering) => {
      const current = summaries.get(offering.area) ?? { area: offering.area, assigned: 0, target: 0 };
      current.assigned += offeringStaffCounts.get(offering.id) ?? 0;
      current.target += offering.staffTarget;
      summaries.set(offering.area, current);
    });
    return Array.from(summaries.values()).sort((left, right) => left.area.localeCompare(right.area));
  }, [offeringStaffCounts, offerings]);

  const filteredStaff = useMemo(() => {
    const term = staffQuery.trim().toLowerCase();
    if (!term) return staff;
    return staff.filter((row) => `${row.name} ${row.primaryArea} ${row.skills.join(" ")} ${row.certifications.join(" ")}`.toLowerCase().includes(term));
  }, [staff, staffQuery]);

  const warnings = useMemo(() => {
    const needsStaff = offerings.filter((offering) => (offeringStaffCounts.get(offering.id) ?? 0) < offering.staffTarget).length;
    const overstaffed = offerings.filter((offering) => (offeringStaffCounts.get(offering.id) ?? 0) > offering.staffTarget).length;
    return [
      { label: "Double-booked staff", value: 0, tone: "red" as const },
      { label: "Missing certifications", value: 0, tone: "orange" as const },
      { label: "Understaffed offerings", value: needsStaff, tone: "orange" as const },
      { label: "Overstaffed offerings", value: overstaffed, tone: "blue" as const },
      { label: "Past availability", value: 0, tone: "blue" as const }
    ];
  }, [offeringStaffCounts, offerings]);

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

  if (!activeStaff) return <div className="rounded-xl border border-slate-200 bg-white p-6 font-bold text-slate-600">No active staff found.</div>;

  const activeInitials = activeStaff.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
      <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wide">Staff Queue (A-Z)</h2>
          <button className="rounded-lg border border-slate-200 p-2"><SlidersHorizontal className="h-4 w-4" /></button>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <Search className="h-4 w-4 text-slate-500" />
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search staff..." value={staffQuery} onChange={(event) => {
            const term = event.target.value;
            setStaffQuery(term);
            const index = staff.findIndex((row) => row.name.toLowerCase().includes(term.toLowerCase()));
            if (term && index >= 0) setActiveIndex(index);
          }} />
        </label>
        <div className="mt-3 max-h-[680px] overflow-auto pr-1">
          {filteredStaff.map((row) => {
            const index = staff.findIndex((staffRow) => staffRow.id === row.id);
            const initials = row.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
            const complete = periods.every((period) => assignments[index]?.[period.value]);
            return (
              <button key={row.id} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${index === activeIndex ? "bg-lake-600 text-white shadow-sm" : "hover:bg-slate-50"}`} type="button" onClick={() => setActiveIndex(index)}>
                <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${index === activeIndex ? "bg-white/20" : "bg-slate-100 text-slate-600"}`}>{initials}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black">{row.name}</span>
                  <span className={`block truncate text-xs ${index === activeIndex ? "text-lake-50" : "text-slate-500"}`}>{row.primaryArea || "No primary area"}</span>
                </span>
                <span className={`h-2 w-2 rounded-full ${complete ? "bg-green-500" : "bg-orange-500"}`} />
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">Showing {filteredStaff.length} of {staff.length} staff</p>
      </aside>

      <main className="grid gap-5">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr_0.75fr]">
            <div className="flex gap-4">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-lake-600 text-3xl font-black text-white">{activeInitials}</div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-black">{activeStaff.name}</h2>
                  <Badge tone="green">Active</Badge>
                </div>
                <p className="mt-3 text-sm font-black">Primary Area</p>
                <p className="mt-1 text-sm font-medium text-slate-600">{activeStaff.primaryArea || "Unassigned"}</p>
                <p className="mt-4 text-sm font-black">Experience</p>
                <p className="mt-1 text-sm font-medium text-slate-600">Returning Staff</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-black">Skills</p>
              <div className="mt-2 flex flex-wrap gap-2">{activeStaff.skills.length ? activeStaff.skills.map((skill) => <Badge key={skill} tone="blue">{skill}</Badge>) : <Badge>No skills</Badge>}</div>
              <p className="mt-5 text-sm font-black">Certifications</p>
              <div className="mt-2 flex flex-wrap gap-2">{activeStaff.certifications.length ? activeStaff.certifications.map((cert) => <Badge key={cert} tone="neutral">{cert}</Badge>) : <Badge>No certs</Badge>}</div>
            </div>
            <div className="border-l border-slate-200 pl-5">
              <p className="text-sm font-black">Availability Notes</p>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{activeStaff.availabilityNotes || "No availability notes."}</p>
              <p className="mt-5 text-sm font-black">Staff Notes</p>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">Great with younger campers. Natural leader on waterfront.</p>
            </div>
          </div>
          <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-900">
            <AlertTriangle className="mr-2 inline h-4 w-4" /> Warnings ({warnings.reduce((total, warning) => total + warning.value, 0)}) • Review double-booking, certifications, and staffing targets before final export.
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft">
          <div className="flex items-center justify-between p-4">
            <h2 className="text-sm font-black uppercase tracking-wide">Assignments</h2>
            <div className="flex items-center gap-4 text-xs font-bold"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-600" />Assigned</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-600" />Conflict</span></div>
          </div>
          <div className="grid grid-cols-2 border-y border-slate-200 bg-lake-600 text-white sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-10">
            {periods.map((period) => <div key={period.value} className="border-r border-white/20 px-3 py-3 text-center text-sm font-black last:border-r-0">{period.label}</div>)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-10">
            {periods.map((period) => {
              const currentOffering = assignedOffering(period.value);
              const assignedCount = currentOffering ? offeringStaffCounts.get(currentOffering.id) ?? 0 : 0;
              const conflict = currentOffering ? assignedCount > currentOffering.staffTarget : false;
              const suggestions = offeringsByPeriod[period.value]?.slice(0, 3) ?? [];
              return (
                <div key={period.value} className="grid min-h-[300px] min-w-0 content-start gap-3 border-r border-b border-slate-200 p-3 last:border-r-0 2xl:border-b-0">
                  <div className={`rounded-lg border p-3 ${conflict ? "border-red-200 bg-red-50" : currentOffering ? "border-green-100 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-black">{currentOffering?.activity ?? "—"}</p>
                        <p className="mt-1 text-xs font-medium text-slate-600">{currentOffering?.area ?? "(Empty)"}</p>
                      </div>
                      {currentOffering ? <span className={`h-2 w-2 rounded-full ${conflict ? "bg-red-600" : "bg-green-600"}`} /> : null}
                    </div>
                  </div>
                  <select className={inputClass} value={assignments[activeIndex]?.[period.value] ?? ""} disabled={isPending} onChange={(event) => saveAssignment(period.value, event.target.value)}>
                    <option value="">Search...</option>
                    {offeringsByPeriod[period.value]?.map((offering) => <option key={offering.id} value={offering.id}>{offering.area} - {offering.activity}</option>)}
                  </select>
                  <div>
                    <p className="text-xs font-black text-slate-500">Suggested</p>
                    <div className="mt-1 grid gap-1">
                      {suggestions.map((suggestion) => <button key={suggestion.id} className="text-left text-xs font-bold text-lake-700" type="button" onClick={() => saveAssignment(period.value, suggestion.id)}>{suggestion.activity}</button>)}
                    </div>
                  </div>
                  <textarea className="min-h-16 rounded-lg border border-slate-200 p-2 text-xs outline-none focus:border-lake-500" placeholder="Notes..." />
                  <div className="mt-auto grid gap-2 border-t border-slate-100 pt-2 text-center text-sm font-black">
                    <span>{currentOffering?.staffTarget ?? "—"}</span>
                    <span className={conflict ? "text-red-600" : "text-green-700"}>{currentOffering ? assignedCount : 0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
          <button className={secondaryButtonClass} type="button" onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}><ArrowLeft className="h-4 w-4" />Previous Staff</button>
          <p className="flex items-center gap-2 text-sm font-bold text-slate-600"><Check className="h-4 w-4 text-green-700" />{message || "Auto-save on change"}</p>
          <button className={buttonClass} type="button" onClick={() => setActiveIndex(Math.min(staff.length - 1, activeIndex + 1))}>Next Staff <ArrowRight className="h-4 w-4" /></button>
        </div>
      </main>

      <aside className="grid content-start gap-5">
        <Panel title="Live Warnings">
          <div className="grid gap-2">
            {warnings.map((warning) => <WarningRow key={warning.label} {...warning} />)}
          </div>
          <button className="mt-3 min-h-11 w-full rounded-lg border border-lake-600 text-sm font-black text-lake-700">View All Warnings</button>
        </Panel>
        <Panel title="Area Staffing Summary">
          <div className="grid gap-3">
            {areaSummaries.map((area) => {
              const pct = area.target ? Math.min(100, Math.round((area.assigned / area.target) * 100)) : 0;
              return (
                <div key={area.area}>
                  <div className="mb-1 flex justify-between text-xs font-bold"><span>{area.area}</span><span>{area.assigned} / {area.target}</span></div>
                  <div className="h-1.5 rounded-full bg-slate-200"><div className={`h-full rounded-full ${area.assigned < area.target ? "bg-orange-500" : "bg-green-600"}`} style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
          <a className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-lake-600 text-sm font-black text-lake-700" href="/area-dashboard">View Area Dashboard</a>
        </Panel>
        <Panel title="Scream Session Tips">
          <p className="flex gap-2 text-sm font-medium leading-6 text-slate-600"><Clock className="mt-1 h-4 w-4 shrink-0" />Use search in each period cell to quickly assign an offering. Changes save instantly.</p>
        </Panel>
      </aside>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft"><h2 className="mb-4 text-sm font-black uppercase tracking-wide">{title}</h2>{children}</section>;
}

function WarningRow({ label, value, tone }: { label: string; value: number; tone: "red" | "orange" | "blue" }) {
  const colors = { red: "text-red-600 bg-red-50 border-red-100", orange: "text-orange-600 bg-orange-50 border-orange-100", blue: "text-lake-600 bg-lake-50 border-lake-100" };
  return <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-bold ${colors[tone]}`}><span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{label}</span><span>{value}</span></div>;
}
