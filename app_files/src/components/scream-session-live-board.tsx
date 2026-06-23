"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Clock, Search, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
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

function isLifeguard(certifications: string[]) {
  return certifications.some((certification) => /\bLG\b|lifeguard/i.test(certification));
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export function ScreamSessionLiveBoard({ staff, offerings, periods }: { staff: StaffRow[]; offerings: OfferingOption[]; periods: PeriodOption[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentPeriodIndex, setCurrentPeriodIndex] = useState(0);
  const [staffQuery, setStaffQuery] = useState("");
  const [showStaffFilters, setShowStaffFilters] = useState(false);
  const [staffAreaFilter, setStaffAreaFilter] = useState("");
  const [staffCertFilter, setStaffCertFilter] = useState("");
  const [assignments, setAssignments] = useState(() => staff.map((row) => ({ ...row.assignments })));
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const activeStaff = staff[activeIndex];
  const currentPeriod = periods[currentPeriodIndex] ?? periods[0];
  const nextPeriod = periods[currentPeriodIndex + 1];

  const staffAreas = useMemo(() => uniqueSorted(staff.map((row) => row.primaryArea || "No primary area")), [staff]);
  const staffCerts = useMemo(() => uniqueSorted(staff.flatMap((row) => row.certifications)), [staff]);

  const offeringsByPeriod = useMemo(() => {
    return periods.reduce<Record<string, OfferingOption[]>>((record, period) => {
      record[period.value] = offerings.filter((offering) => offering.period === period.value);
      return record;
    }, {});
  }, [offerings, periods]);

  const offeringStaffCounts = useMemo(() => {
    const counts = new Map(offerings.map((offering) => [offering.id, 0]));
    assignments.forEach((row) => {
      Object.values(row).forEach((offeringId) => {
        if (offeringId) counts.set(offeringId, (counts.get(offeringId) ?? 0) + 1);
      });
    });
    return counts;
  }, [assignments, offerings]);

  const filteredStaff = useMemo(() => {
    const term = staffQuery.trim().toLowerCase();
    return staff.filter((row) => {
      if (staffAreaFilter && (row.primaryArea || "No primary area") !== staffAreaFilter) return false;
      if (staffCertFilter && !row.certifications.includes(staffCertFilter)) return false;
      if (term && !`${row.name} ${row.primaryArea} ${row.skills.join(" ")} ${row.certifications.join(" ")}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [staff, staffQuery, staffAreaFilter, staffCertFilter]);

  const activeAssignments = assignments[activeIndex] ?? {};
  const currentOffering = currentPeriod && activeAssignments[currentPeriod.value] !== OFF_PERIOD_VALUE ? offerings.find((item) => item.id === activeAssignments[currentPeriod.value]) : undefined;
  const nextOffering = nextPeriod && activeAssignments[nextPeriod.value] !== OFF_PERIOD_VALUE ? offerings.find((item) => item.id === activeAssignments[nextPeriod.value]) : undefined;
  const completedCount = periods.filter((period) => completed[`${activeStaff?.id}-${period.value}`]).length;
  const assignedCount = periods.filter((period) => activeAssignments[period.value]).length;

  function saveAssignment(period: string, offeringId: string) {
    if (!activeStaff) return;
    const staffIndex = activeIndex;
    const staffName = activeStaff.name;
    const previousOfferingId = assignments[staffIndex]?.[period] ?? "";
    const isOffPeriod = offeringId === OFF_PERIOD_VALUE;
    setAssignments((current) => current.map((row, index) => (index === staffIndex ? { ...row, [period]: offeringId } : row)));
    setMessage(isOffPeriod ? "Saving off period..." : offeringId ? "Saving assignment..." : "Removing assignment...");
    startTransition(async () => {
      const save = (approveDoubleTwilight = false) => fetch("/api/staff-assignments", {
        method: offeringId ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isOffPeriod
          ? { staffId: activeStaff.id, period, offPeriod: true }
          : offeringId
            ? { staffId: activeStaff.id, offeringId, period, approveDoubleTwilight }
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

  function markCurrentComplete() {
    if (!activeStaff || !currentPeriod) return;
    setCompleted((current) => ({ ...current, [`${activeStaff.id}-${currentPeriod.value}`]: true }));
    setMessage(`${currentPeriod.label} marked complete for ${activeStaff.name}.`);
    if (currentPeriodIndex < periods.length - 1) setCurrentPeriodIndex((current) => current + 1);
  }

  function goToStaff(index: number) {
    setActiveIndex(index);
    setCurrentPeriodIndex(0);
  }

  if (!activeStaff) return <div className="rounded-xl border border-slate-200 bg-white p-6 font-bold text-slate-600">No active staff found.</div>;

  const activeInitials = activeStaff.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const activeIsLifeguard = isLifeguard(activeStaff.certifications);

  return (
    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Running Order A-Z</h2>
          <button className={`rounded-lg border p-2 ${showStaffFilters ? "border-lake-600 bg-lake-50 text-lake-700" : "border-slate-200"}`} type="button" onClick={() => setShowStaffFilters((current) => !current)} aria-label="Toggle staff filters"><SlidersHorizontal className="h-4 w-4" /></button>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <Search className="h-4 w-4 text-slate-500" />
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search staff..." value={staffQuery} onChange={(event) => setStaffQuery(event.target.value)} />
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
            <button className={`${secondaryButtonClass} min-h-9 px-3 py-1 text-xs`} type="button" onClick={() => { setStaffQuery(""); setStaffAreaFilter(""); setStaffCertFilter(""); }}>Clear staff filters</button>
          </div>
        ) : null}
        <div className="mt-3 max-h-[720px] overflow-auto pr-1">
          {filteredStaff.map((row) => {
            const index = staff.findIndex((staffRow) => staffRow.id === row.id);
            const initials = row.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
            const rowAssigned = periods.filter((period) => assignments[index]?.[period.value]).length;
            const tags = certTags(row.certifications);
            return (
              <button key={row.id} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${index === activeIndex ? "bg-lake-600 text-white shadow-sm" : "hover:bg-slate-50"}`} type="button" onClick={() => goToStaff(index)}>
                <span className={`grid h-9 w-9 place-items-center rounded-full text-xs font-black ${index === activeIndex ? "bg-white/20" : "bg-slate-100 text-slate-600"}`}>{initials}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="block truncate text-sm font-black">{row.name}</span>
                    {tags.slice(0, 1).map((tag) => <span key={tag.code} className={`rounded px-1.5 py-0.5 text-[0.62rem] font-black ${tag.className}`}>{tag.code}</span>)}
                  </span>
                  <span className={`block truncate text-xs ${index === activeIndex ? "text-lake-50" : "text-slate-500"}`}>{rowAssigned} / {periods.length} assigned</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="grid content-start gap-5">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_0%_0%,rgba(124,58,237,0.14),transparent_34%),linear-gradient(135deg,#ffffff,#f8fbff)] p-6">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="flex min-w-0 items-start gap-5">
                <div className={`grid h-24 w-24 shrink-0 place-items-center rounded-full text-4xl font-black text-white shadow-sm ${activeIsLifeguard ? "bg-red-600" : "bg-forest-700"}`}>{activeInitials}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black uppercase tracking-wide text-lake-700">Next up in alphabetical order</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 max-w-full break-words text-4xl font-black leading-tight tracking-tight text-slate-950">{activeStaff.name}</h2>
                    {certTags(activeStaff.certifications).map((tag) => <span key={tag.code} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-black ${tag.className}`}>{tag.code === "LG" ? <ShieldCheck className="h-3.5 w-3.5" /> : null}{tag.code}</span>)}
                  </div>
                  <p className="mt-3 text-xl font-black text-slate-600">Primary Area: {activeStaff.primaryArea || "Unassigned"}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-600">Skills: {activeStaff.skills.length ? activeStaff.skills.join(", ") : "None listed"}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-600">Certs: {activeStaff.certifications.length ? activeStaff.certifications.join(", ") : "None listed"}</p>
                </div>
              </div>
              <div className="w-full rounded-2xl border border-lake-100 bg-white/80 p-4 sm:w-64">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Currently assigning</p>
                <p className="mt-2 text-3xl font-black text-lake-700">{currentPeriod?.label ?? "Done"}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{currentPeriod && activeAssignments[currentPeriod.value] === OFF_PERIOD_VALUE ? "Off Period" : currentOffering?.activity ?? "Choose class"}</p>
                <p className="text-sm font-semibold text-slate-500">{currentPeriod && activeAssignments[currentPeriod.value] === OFF_PERIOD_VALUE ? "Protected staff break" : currentOffering?.area ?? "No class selected yet"}</p>
                <button className={`${buttonClass} mt-4 w-full justify-center`} type="button" onClick={markCurrentComplete} disabled={!currentPeriod}>Mark Complete</button>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">Assignment Progress</h2>
                <p className="text-sm font-semibold text-slate-500">Select or change a class directly inside each period card.</p>
              </div>
              <Badge tone="green">{assignedCount} / {periods.length} Assigned</Badge>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {periods.map((period, index) => {
                const isOffPeriod = activeAssignments[period.value] === OFF_PERIOD_VALUE;
                const selectedOffering = isOffPeriod ? undefined : offerings.find((item) => item.id === activeAssignments[period.value]);
                const isComplete = completed[`${activeStaff.id}-${period.value}`];
                const isCurrent = index === currentPeriodIndex;
                const isNext = index === currentPeriodIndex + 1;
                const assignedTotal = selectedOffering ? offeringStaffCounts.get(selectedOffering.id) ?? 0 : 0;
                const overTarget = selectedOffering ? assignedTotal > selectedOffering.staffTarget : false;
                const tileClass = isComplete
                  ? "border-green-200 bg-green-50 text-green-950"
                  : isCurrent
                    ? "border-purple-300 bg-purple-50 ring-2 ring-purple-200 text-purple-950"
                    : isNext
                      ? "border-blue-300 bg-blue-50 text-blue-950"
                      : "border-slate-200 bg-white text-slate-700";
                return (
                  <button key={period.value} className={`min-h-[190px] rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tileClass}`} type="button" onClick={() => setCurrentPeriodIndex(index)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-3xl font-black">{period.label}</p>
                        <p className="mt-1 line-clamp-2 text-lg font-black">{isOffPeriod ? "Off Period" : selectedOffering?.activity ?? "Unassigned"}</p>
                        <p className="text-sm font-bold opacity-80">{isOffPeriod ? "Protected staff break" : selectedOffering?.area ?? "Choose class below"}</p>
                      </div>
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-white ${isComplete ? "bg-green-600" : isCurrent ? "bg-purple-600" : isNext ? "bg-blue-600" : "bg-slate-400"}`}>
                        {isComplete ? <Check className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      </span>
                    </div>
                    <div className="mt-4" onClick={(event) => event.stopPropagation()}>
                      <select className={`${inputClass} bg-white`} value={activeAssignments[period.value] ?? ""} disabled={isPending} onChange={(event) => saveAssignment(period.value, event.target.value)}>
                        <option value="">Select class...</option>
                        <option value={OFF_PERIOD_VALUE}>Off Period</option>
                        {offeringsByPeriod[period.value]?.map((offering) => <option key={offering.id} value={offering.id}>{offering.area} - {offering.activity}</option>)}
                      </select>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs font-black uppercase tracking-wide">
                      <span>{isComplete ? "Done" : isCurrent ? "Current" : isNext ? "Next" : "Upcoming"}</span>
                      <span className={overTarget ? "text-red-600" : "text-slate-500"}>{isOffPeriod ? "OFF" : selectedOffering ? `${assignedTotal}/${selectedOffering.staffTarget}` : "0/-"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
          <button className={secondaryButtonClass} type="button" onClick={() => goToStaff(Math.max(0, activeIndex - 1))}><ArrowLeft className="h-4 w-4" />Previous Staff</button>
          <p className="flex items-center gap-2 text-sm font-bold text-slate-600"><Check className="h-4 w-4 text-green-700" />{message || "Auto-save on class selection"}</p>
          <button className={buttonClass} type="button" onClick={() => goToStaff(Math.min(staff.length - 1, activeIndex + 1))}>Next Staff <ArrowRight className="h-4 w-4" /></button>
        </div>
      </main>

      <aside className="grid content-start gap-5">
        <Panel title="Up Next">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">Next period</p>
            <p className="mt-2 text-4xl font-black text-blue-700">{nextPeriod?.label ?? "Done"}</p>
            <p className="mt-1 text-lg font-black text-slate-950">{nextPeriod && activeAssignments[nextPeriod.value] === OFF_PERIOD_VALUE ? "Off Period" : nextOffering?.activity ?? "No class selected"}</p>
            <p className="text-sm font-semibold text-slate-600">{nextPeriod && activeAssignments[nextPeriod.value] === OFF_PERIOD_VALUE ? "Protected staff break" : nextOffering?.area ?? ""}</p>
          </div>
        </Panel>
        <Panel title="Session Progress">
          <div className="grid place-items-center rounded-2xl bg-slate-50 p-5 text-center">
            <Users className="h-8 w-8 text-lake-700" />
            <p className="mt-3 text-3xl font-black text-slate-950">{completedCount} / {periods.length}</p>
            <p className="text-sm font-bold text-slate-500">completed for this staff member</p>
          </div>
        </Panel>
        <Panel title="Live Notes">
          <p className="flex gap-2 text-sm font-semibold leading-6 text-slate-600"><Clock className="mt-1 h-4 w-4 shrink-0" />Click any period tile to make it current, then use the dropdown inside that tile to select the class code/activity. Changes save instantly.</p>
          {activeStaff.availabilityNotes ? <p className="mt-3 rounded-lg bg-orange-50 p-3 text-sm font-bold text-orange-900">{activeStaff.availabilityNotes}</p> : null}
        </Panel>
      </aside>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft"><h2 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-800">{title}</h2>{children}</section>;
}
