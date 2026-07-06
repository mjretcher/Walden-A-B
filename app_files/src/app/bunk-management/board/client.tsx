"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, GripVertical, X } from "lucide-react";
import { CabinStaffRole, Gender, Unit } from "@prisma/client";
import { Panel, SectionHeader, inputClass, secondaryButtonClass } from "@/components/ui";
import { assignStaffToCabin, setCabinStaffRole, unassignStaff } from "./actions";

type CabinData = {
  id: string;
  name: string;
  unit: Unit;
  beds: number;
  campers: string[];
  cas: string[];
};

type StaffData = {
  id: string;
  name: string;
  preferences: { unit: string; rank: number }[];
};

type Assignment = { cabinId: string; role: CabinStaffRole };

const UNIT_LABEL: Record<Unit, string> = {
  UNIT1: "Unit 1",
  UNIT2: "Unit 2",
  UNIT3: "Unit 3",
  UNIT4: "Unit 4"
};

const ROLE_LABEL: Record<CabinStaffRole, string> = {
  COUNSELOR: "Counselor",
  UNIT_PROGRAMMER: "Unit programmer",
  UNIT_HEAD: "Unit head"
};

function ord(n: number) {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

export function BunkBoardClient({
  sessionId,
  gender,
  cabins,
  staff: allStaff,
  initialAssignments
}: {
  sessionId: string;
  gender: Gender;
  cabins: CabinData[];
  staff: StaffData[];
  initialAssignments: { staffId: string; cabinId: string; role: CabinStaffRole }[];
}) {
  const [assignments, setAssignments] = useState<Map<string, Assignment>>(
    () => new Map(initialAssignments.map((a) => [a.staffId, { cabinId: a.cabinId, role: a.role }]))
  );
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const staffById = useMemo(() => new Map(allStaff.map((s) => [s.id, s])), [allStaff]);

  const pool = allStaff.filter((s) => !assignments.has(s.id));

  function toggleExpanded(cabinId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cabinId)) next.delete(cabinId);
      else next.add(cabinId);
      return next;
    });
  }

  function assign(staffId: string, cabinId: string, role: CabinStaffRole = CabinStaffRole.COUNSELOR) {
    const previous = assignments.get(staffId) ?? null;
    setError(null);
    setAssignments((prev) => {
      const next = new Map(prev);
      next.set(staffId, { cabinId, role });
      return next;
    });
    const formData = new FormData();
    formData.set("staffId", staffId);
    formData.set("cabinId", cabinId);
    formData.set("sessionId", sessionId);
    formData.set("role", role);
    startTransition(async () => {
      const result = await assignStaffToCabin(formData);
      if (!result.ok) {
        setError(result.error);
        setAssignments((prev) => {
          const next = new Map(prev);
          if (previous) next.set(staffId, previous);
          else next.delete(staffId);
          return next;
        });
      }
    });
  }

  function unassign(staffId: string) {
    const previous = assignments.get(staffId) ?? null;
    setError(null);
    setAssignments((prev) => {
      const next = new Map(prev);
      next.delete(staffId);
      return next;
    });
    const formData = new FormData();
    formData.set("staffId", staffId);
    formData.set("sessionId", sessionId);
    startTransition(async () => {
      const result = await unassignStaff(formData);
      if (!result.ok) {
        setError(result.error);
        if (previous) setAssignments((prev) => new Map(prev).set(staffId, previous));
      }
    });
  }

  function changeRole(staffId: string, role: CabinStaffRole) {
    const current = assignments.get(staffId);
    if (!current) return;
    const previous = current.role;
    setError(null);
    setAssignments((prev) => new Map(prev).set(staffId, { ...current, role }));
    const formData = new FormData();
    formData.set("staffId", staffId);
    formData.set("sessionId", sessionId);
    formData.set("role", role);
    startTransition(async () => {
      const result = await setCabinStaffRole(formData);
      if (!result.ok) {
        setError(result.error);
        setAssignments((prev) => new Map(prev).set(staffId, { ...current, role: previous }));
      }
    });
  }

  function handleDrop(e: React.DragEvent, cabinId: string) {
    e.preventDefault();
    const staffId = e.dataTransfer.getData("text/plain");
    if (!staffId) return;
    const existing = assignments.get(staffId);
    assign(staffId, cabinId, existing?.role ?? CabinStaffRole.COUNSELOR);
  }

  const grouped = useMemo(() => {
    const units = Array.from(new Set(cabins.map((c) => c.unit))).sort();
    return units.map((unit) => ({ unit, cabins: cabins.filter((c) => c.unit === unit) }));
  }, [cabins]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Link href="?gender=MALE" className={`${secondaryButtonClass} min-h-8 px-3 py-1 text-xs ${gender === "MALE" ? "border-lake-500 bg-lake-50" : ""}`}>Boys</Link>
        <Link href="?gender=FEMALE" className={`${secondaryButtonClass} min-h-8 px-3 py-1 text-xs ${gender === "FEMALE" ? "border-lake-500 bg-lake-50" : ""}`}>Girls</Link>
      </div>

      {error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full flex-shrink-0 lg:w-56">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Unassigned staff ({pool.length})</p>
          <div className="flex flex-col gap-2">
            {pool.map((s) => (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", s.id)}
                className="flex cursor-grab items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm font-bold text-slate-800 shadow-soft active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5 text-slate-400" />
                {s.name}
              </div>
            ))}
            {pool.length === 0 ? <p className="text-xs text-slate-400">Everyone's assigned.</p> : null}
          </div>
        </aside>

        <div className="flex-1 space-y-6">
          {grouped.map(({ unit, cabins: unitCabins }) => (
            <Panel key={unit}>
              <SectionHeader title={UNIT_LABEL[unit]} detail={`${unitCabins.length} cabin${unitCabins.length === 1 ? "" : "s"}`} />
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {unitCabins.map((cabin) => {
                  const assignedHere = Array.from(assignments.entries())
                    .filter(([, a]) => a.cabinId === cabin.id)
                    .map(([staffId, a]) => ({ staffId, ...a, staff: staffById.get(staffId) }));
                  const headcount = cabin.campers.length + cabin.cas.length + assignedHere.length;
                  const overCapacity = cabin.beds > 0 && headcount > cabin.beds;
                  const isExpanded = expanded.has(cabin.id);

                  return (
                    <div
                      key={cabin.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, cabin.id)}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => toggleExpanded(cabin.id)}>
                        <span className="font-black text-forest-900">{cabin.name}</span>
                        <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                          {cabin.campers.length} campers
                          <ChevronDown className={`h-3.5 w-3.5 transition ${isExpanded ? "rotate-180" : ""}`} />
                        </span>
                      </button>

                      {overCapacity ? (
                        <p className="mt-1 inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs font-black text-red-800">
                          <AlertTriangle className="h-3 w-3" />OVER CAPACITY — {headcount} assigned vs. {cabin.beds} beds
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-slate-500">{headcount}{cabin.beds > 0 ? `/${cabin.beds}` : ""} beds filled</p>
                      )}

                      {isExpanded ? (
                        <div className="mt-2 rounded-md bg-white p-2 text-xs text-slate-600">
                          {cabin.campers.length ? cabin.campers.join(", ") : <span className="text-slate-400">No campers yet.</span>}
                          {cabin.cas.length ? (
                            <p className="mt-1 text-slate-500">{cabin.cas.map((c) => `${c} (CA)`).join(", ")}</p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-col gap-2">
                        {assignedHere.map(({ staffId, role, staff }) => {
                          const prefRank = staff?.preferences.find((p) => p.unit === cabin.unit)?.rank ?? null;
                          return (
                            <div
                              key={staffId}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData("text/plain", staffId)}
                              className="flex cursor-grab items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm active:cursor-grabbing"
                            >
                              <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-bold text-slate-800">{staff?.name ?? "Unknown staff"}</p>
                                {prefRank ? (
                                  <p className={`text-[11px] font-bold ${prefRank === 1 ? "text-green-700" : "text-slate-400"}`}>{ord(prefRank)} choice</p>
                                ) : null}
                              </div>
                              <select
                                className={`${inputClass} h-8 w-36 text-xs`}
                                value={role}
                                onChange={(e) => changeRole(staffId, e.target.value as CabinStaffRole)}
                              >
                                {Object.values(CabinStaffRole).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                              </select>
                              <button type="button" aria-label="Remove" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => unassign(staffId)}>
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                        {assignedHere.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-slate-300 p-2 text-center text-xs text-slate-400">Drop staff here</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}
