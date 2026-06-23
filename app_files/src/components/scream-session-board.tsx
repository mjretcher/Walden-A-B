"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Clock, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
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

const OFF_PERIOD_VALUE = "__OFF_PERIOD__";

function isLifeguard(certifications: string[]) {
  return certifications.some((certification) => /\bLG\b|lifeguard/i.test(certification));
}

function certTags(certifications: string[]) {
  const joined = certifications.join(" ");
  const tags: Array<{ code: string; className: string }> = [];
  if (/\bLG\b|lifeguard/i.test(joined)) tags.push({ code: "LG", className: "bg-red-600 text-white" });
  if (/ski\s*boat|waterski|water-ski/i.test(joined)) tags.push({ code: "SKI", className: "bg-lake-600 text-white" });
  if (/tube\s*boat|tubing/i.test(joined)) tags.push({ code: "TUBE", className: "bg-orange-500 text-white" });
  if (/\bboat\b|driver|boating/i.test(joined) && !tags.some((tag) => tag.code === "SKI" || tag.code === "TUBE")) tags.push({ code: "BOAT", className: "bg-purple-600 text-white" });
  if (/wsi|swim instructor/i.test(joined)) tags.push({ code: "WSI", className: "bg-teal-600 text-white" });
  return tags;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function sortOfferingsForAssignment(left: OfferingOption, right: OfferingOption) {
  const areaSort = left.area.localeCompare(right.area, undefined, { numeric: true, sensitivity: "base" });
  if (areaSort !== 0) return areaSort;
  return left.activity.localeCompare(right.activity, undefined, { numeric: true, sensitivity: "base" });
}

export function ScreamSessionBoard({ staff, offerings, periods }: { staff: StaffRow[]; offerings: OfferingOption[]; periods: PeriodOption[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [staffQuery, setStaffQuery] = useState("");
  const [showStaffFilters, setShowStaffFilters] = useState(false);
  const [staffAreaFilter, setStaffAreaFilter] = useState("");
  const [staffCertFilter, setStaffCertFilter] = useState("");
  const [assignments, setAssignments] = useState(() => staff.map((row) => ({ ...row.assignments })));
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const activeStaff = staff[activeIndex];

  const staffAreas = useMemo(() => uniqueSorted(staff.map((row) => row.primaryArea || "No primary area")), [staff]);
  const staffCerts = useMemo(() => uniqueSorted(staff.flatMap((row) => row.certifications)), [staff]);

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
      record[period.value] = offerings.filter((offering) => offering.period === period.value).sort(sortOfferingsForAssignment);
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
    return staff.filter((row) => {
      if (staffAreaFilter && (row.primaryArea || "No primary area") !== staffAreaFilter) return false;
      if (staffCertFilter && !row.certifications.includes(staffCertFilter)) return false;
      if (term && !`${row.name} ${row.primaryArea} ${row.skills.join(" ")} ${row.certifications.join(" ")}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [staff, staffQuery, staffAreaFilter, staffCertFilter]);

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
    if (offeringId === OFF_PERIOD_VALUE) return undefined;
    return offerings.find((item) => item.id === offeringId);
  }

  function saveAssignment(period: string, offeringId: string) {
    if (!activeStaff) return;
    const staffIndex = activeIndex;
    const staffName = activeStaff.name;
    const previousOfferingId = assignments[staffIndex]?.[period] ?? "";
    const isOffPeriod = offeringId === OFF_PERIOD_VALUE;
    setAssignments((current) => current.map((row, index) => (index === staffIndex ? { ...row, [period]: offeringId } : row)));
    setMessage(isOffPeriod ? "Saving off period..." : offeringId ? "Saving..." : "Removing...");
    startTransition(async () => {
      const save = (approveDoubleTwilight = false) => fetch("/api/staff-assignments", {
        method: offeringId ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isOffPeriod
          ? { staffId: activeStaff.id, period, offPeriod: true }
          : offeringId
            ? { staffId: activeStaff.id, offeringId, approveDoubleTwilight }
            : { staffId: activeStaff.id, period })
      });

      let response = await save();
      let data = await response.json();
      if (response.status === 409 && data.needsApproval === "DOUBLE_TWILIGHT" && window.confirm(data.warning ?? data.error ?? "Approve assigning both twilight periods?")) {
        response = await save(true);
        data = await response.json();
      }

      if (!response.ok) {
        setAssignments((current) => current.map((row, index) => (index === staffIndex ? { ...row, [period]: previousOfferingId } : row)));
        setMessage(data.error ?? "Assignment failed.");
        return;
      }

      if (Array.isArray(data.clearedPeriods) && data.clearedPeriods.length) {
        setAssignments((current) => current.map((row, index) => {
          if (index !== staffIndex) return row;
          const next = { ...row };
          data.clearedPeriods.forEach((clearedPeriod: string) => {
            next[clearedPeriod] = "";
          });
          return next;
        }));
      }

      setMessage(offeringId ? data.warnings?.length ? data.warnings.join(" ") : `Saved ${staffName} to ${data.label}.` : `Removed ${staffName} from ${period}.`);
    });
  }

  function clearStaffFilters() {
    setStaffQuery("");
    setStaffAreaFilter("");
    setStaffCertFilter("");
  }

  if (!activeStaff) return <div className="rounded-xl border border-slate-200 bg-white p-6 font-bold text-slate-600">No active staff found.</div>;

  const activeInitials = activeStaff.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const activeIsLifeguard = isLifeguard(activeStaff.certifications);

  return (
    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
      <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wide">Staff Queue (A-Z)</h2>
          <button className={`rounded-lg border p-2 ${showStaffFilters ? "border-lake-600 bg-lake-50 text-lake-700" : "border-slate-200"}`} type="button" onClick={() => setShowStaffFilters((current) => !current)} aria-label="Toggle staff filters"><SlidersHorizontal className="h-4 w-4" /></button>
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
        {showStaffFilters ? (
          <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <select className={inputClass} value={staffAreaFilter} onChange={(event) => setStaffAreaFilter(event.target.value)}>
              <option value="">All areas</option>
              {staffAreas.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
            <select className={inputClass} value={staffCertFilter} onChange={(event) => setStaffCertFilter(event.target.value)}>
              <option value="">All certifications</option>
              {staffCerts.map((certification) => <option key={certification} value={certification}>{certification}</option>)}
            </select>
            <button className={`${secondaryButtonClass} min-h-9 px-3 py-1 text-xs`} type="button" onClick={clearStaffFilters}>Clear staff filters</button>
          </div>
        ) : null}
        <div className="mt-3 max-h-[680px] overflow-auto pr-1">
          {filteredStaff.map((row) => {
            const index = staff.findIndex((staffRow) => staffRow.id === row.id);
            const initials = row.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
            const complete = periods.every((period) => assignments[index]?.[period.value]);
            const tags = certTags(row.certifications);
            return (
              <button key={row.id} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${index === activeIndex ? "bg-lake-600 text-white shadow-sm" : "hover:bg-slate-50"}`} type="button" onClick={() => setActiveIndex(index)}>
                <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${index === activeIndex ? "bg-white/20" : "bg-slate-100 text-slate-600"}`}>{initials}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="block truncate text-sm font-black">{row.name}</span>
                    {tags.slice(0, 2).map((tag) => <span key={tag.code} className={`rounded px-1.5 py-0.5 text-[0.62rem] font-black ${tag.className}`}>{tag.code}</span>)}
                  </span>
                  <span className={`block truncate text-xs ${index === activeIndex ? "text-lake-50" : "text-slate-500"}`}>{row.primaryArea || "No primary area"}</span>
                </span>
                <span className={`h-2 w-2 rounded-full ${complete ? "bg-green-500" : "bg-orange-500"}`} />
              </button>
            );
          })}
          {!filteredStaff.length ? <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm font-bold text-slate-500">No staff match these filters.</p> : null}
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">Showing {filteredStaff.length} of {staff.length} staff</p>
      </aside>

      <main className="grid gap-5">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="grid gap-0 2xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.9fr)]">
            <div className="bg-[radial-gradient(circle_at_0%_0%,rgba(7,95,202,0.11),transparent_34%),linear-gradient(135deg,#ffffff,#f7fbff)] p-5">
              <div className="flex min-w-0 items-start gap-5">
                <div className={`grid h-20 w-20 shrink-0 place-items-center rounded-2xl text-3xl font-black text-white shadow-sm ${activeIsLifeguard ? "bg-red-600" : "bg-lake-600"}`}>{activeInitials}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 max-w-full break-words text-2xl font-black leading-tight tracking-tight text-slate-950 2xl:text-3xl">{activeStaff.name}</h2>
                    <Badge tone="green">Active</Badge>
                    {certTags(activeStaff.certifications).map((tag) => <span key={tag.code} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-black ${tag.className}`}>{tag.code === "LG" ? <ShieldCheck className="h-3.5 w-3.5" /> : null}{tag.code}</span>)}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <InfoTile label="Primary Area" value={activeStaff.primaryArea || "Unassigned"} />
                    <InfoTile label="Experience" value="Returning Staff" />
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <ChipPanel title="Skills" empty="No skills" values={activeStaff.skills} tone="blue" />
                <ChipPanel title="Certifications" empty="No certs" values={activeStaff.certifications} tone="cert" />
              </div>
            </div>
            <div className="grid gap-4 border-t border-slate-200 bg-slate-50/70 p-5 2xl:border-l 2xl:border-t-0">
              <NotePanel title="Availability Notes" body={activeStaff.availabilityNotes || "No availability notes."} />
              <NotePanel title="Staff Notes" body="Great with younger campers. Natural leader on waterfront." />
            </div>
          </div>
          <div className="m-5 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-900">
            <AlertTriangle className="mr-2 inline h-4 w-4" /> Warnings ({warnings.reduce((total, warning) => total + warning.value, 0)}) • Review double-booking, certifications, and staffing targets before final export.
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft">
          <div className="flex items-center justify-between p-4">
            <h2 className="text-sm font-black uppercase tracking-wide">Assignments</h2>
            <div className="flex items-center gap-4 text-xs font-bold"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-600" />Assigned</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Off</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-600" />Conflict</span></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
            {periods.map((period) => {
              const selectedValue = assignments[activeIndex]?.[period.value] ?? "";
              const isOffPeriod = selectedValue === OFF_PERIOD_VALUE;
              const currentOffering = assignedOffering(period.value);
              const assignedCount = currentOffering ? offeringStaffCounts.get(currentOffering.id) ?? 0 : 0;
              const conflict = currentOffering ? assignedCount > currentOffering.staffTarget : false;
              const suggestions = offeringsByPeriod[period.value]?.slice(0, 3) ?? [];
              return (
                <div key={period.value} className="grid min-h-[320px] min-w-0 content-start gap-3 border-r border-b border-slate-200 p-3 last:border-r-0">
                  <div className="rounded-lg bg-lake-600 px-3 py-2 text-center text-lg font-black leading-none text-white">
                    {period.label}
                  </div>
                  <div className={`min-w-0 rounded-lg border p-3 ${conflict ? "border-red-200 bg-red-50" : isOffPeriod ? "border-amber-200 bg-amber-50" : currentOffering ? "border-green-100 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-black leading-tight">{isOffPeriod ? "Off Period" : currentOffering?.activity ?? "-"}</p>
                        <p className="mt-1 break-words text-xs font-medium leading-tight text-slate-600">{isOffPeriod ? "Protected staff break" : currentOffering?.area ?? "(Empty)"}</p>
                      </div>
                      {currentOffering || isOffPeriod ? <span className={`h-2 w-2 rounded-full ${conflict ? "bg-red-600" : isOffPeriod ? "bg-amber-500" : "bg-green-600"}`} /> : null}
                    </div>
                  </div>
                  <select className={`${inputClass} min-w-0 text-sm`} value={selectedValue} disabled={isPending} onChange={(event) => saveAssignment(period.value, event.target.value)}>
                    <option value="">Search...</option>
                    <option value={OFF_PERIOD_VALUE}>Off Period</option>
                    {offeringsByPeriod[period.value]?.map((offering) => <option key={offering.id} value={offering.id}>{offering.area} - {offering.activity}</option>)}
                  </select>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-500">Quick Assign</p>
                    <div className="mt-1 grid min-w-0 gap-1">
                      <button className="min-w-0 break-words text-left text-xs font-black leading-tight text-amber-700" type="button" onClick={() => saveAssignment(period.value, OFF_PERIOD_VALUE)}>Off Period</button>
                      {suggestions.map((suggestion) => <button key={suggestion.id} className="min-w-0 break-words text-left text-xs font-bold leading-tight text-lake-700" type="button" onClick={() => saveAssignment(period.value, suggestion.id)}>{suggestion.activity}</button>)}
                    </div>
                  </div>
                  <textarea className="min-h-16 min-w-0 resize-y rounded-lg border border-slate-200 p-2 text-xs outline-none focus:border-lake-500" placeholder="Notes..." />
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

function InfoTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white/80 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-lg font-black text-forest-900">{value}</p></div>;
}

function ChipPanel({ title, values, empty, tone }: { title: string; values: string[]; empty: string; tone: "blue" | "cert" }) {
  return (
    <div>
      <p className="text-sm font-black text-slate-950">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.length ? values.map((value) => {
          const [tag] = certTags([value]);
          return <span key={value} className={`rounded-lg px-2.5 py-1 text-xs font-black ${tag ? tag.className : tone === "blue" ? "bg-lake-100 text-lake-800" : "bg-slate-100 text-slate-700"}`}>{tag ? `${tag.code} • ${value}` : value}</span>;
        }) : <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{empty}</span>}
      </div>
    </div>
  );
}

function NotePanel({ title, body }: { title: string; body: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm font-black text-slate-950">{title}</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p></div>;
}

function WarningRow({ label, value, tone }: { label: string; value: number; tone: "red" | "orange" | "blue" }) {
  const colors = { red: "text-red-600 bg-red-50 border-red-100", orange: "text-orange-600 bg-orange-50 border-orange-100", blue: "text-lake-600 bg-lake-50 border-lake-100" };
  return <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-bold ${colors[tone]}`}><span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{label}</span><span>{value}</span></div>;
}
