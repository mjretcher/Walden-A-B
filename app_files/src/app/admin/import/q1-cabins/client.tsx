"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Eye, Loader2, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { Badge, Panel, SectionHeader, buttonClass, secondaryButtonClass } from "@/components/ui";
import { generateQ1Diff, applyQ1Diff, type DiffResult, type DiffEntry } from "./actions";

export function Q1CabinImportClient() {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ applied: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<DiffEntry["status"] | "all" | "changes">("changes");
  const [isPending, startTransition] = useTransition();

  function runDiff() {
    setError(null);
    setApplied(null);
    startTransition(async () => {
      try {
        const result = await generateQ1Diff();
        setDiff(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function runApply() {
    if (!diff) return;
    const confirmed = window.confirm(
      `Apply ${diff.totals.will_change} cabin/unit change${diff.totals.will_change === 1 ? "" : "s"}?\n\n` +
      `This will update Q1 cabin assignments for matched campers and staff. Unmatched names and ambiguous matches will NOT be changed — review them after.\n\n` +
      `This action runs in a single transaction. You can re-run the diff afterward to confirm.`
    );
    if (!confirmed) return;
    setApplying(true);
    setError(null);
    startTransition(async () => {
      try {
        const result = await applyQ1Diff();
        if (result.ok) {
          setApplied({ applied: result.applied });
          // Re-run diff to show the new state
          const fresh = await generateQ1Diff();
          setDiff(fresh);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setApplying(false);
      }
    });
  }

  if (!diff) {
    return (
      <Panel>
        <SectionHeader title="Start here" detail="Generate a diff to see what would change before applying anything." />
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-black">What this does</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Compares the latest Q1 cabin sheets (girls & boys) to current database assignments.</li>
            <li>Matches people by exact first + last name (case-insensitive).</li>
            <li>Shows you every proposed cabin move and unit change before any write.</li>
            <li>Skips unmatched names and ambiguous matches — those need manual review.</li>
            <li>Applies only when you click Apply, in a single transaction.</li>
          </ul>
        </div>
        <button type="button" className={`${buttonClass} mt-4`} onClick={runDiff} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          {isPending ? "Generating…" : "Generate diff"}
        </button>
        {error ? <p className="mt-3 text-sm font-bold text-red-700">Error: {error}</p> : null}
      </Panel>
    );
  }

  const filtered = diff.entries.filter((e) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "changes") return e.status === "match-cabin-change" || e.status === "match-unit-change" || e.status === "match-both-change";
    return e.status === activeFilter;
  });

  return (
    <div className="space-y-4">
      {/* Top summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <SummaryTile label="In files" value={diff.totals.in_file} tone="slate" />
        <SummaryTile label="Matched" value={diff.totals.matched} tone="green" icon={<CheckCircle2 className="h-4 w-4" />} />
        <SummaryTile label="Will change" value={diff.totals.will_change} tone="lake" icon={<ArrowRight className="h-4 w-4" />} />
        <SummaryTile label="Unmatched" value={diff.totals.unmatched} tone="amber" icon={<Users className="h-4 w-4" />} />
        <SummaryTile label="Ambiguous" value={diff.totals.ambiguous} tone="amber" icon={<AlertTriangle className="h-4 w-4" />} />
        <SummaryTile label="Cabin missing" value={diff.totals.cabin_missing} tone="red" icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      {/* Apply bar */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-slate-500">Ready to apply</p>
            <p className="mt-1 text-2xl font-black text-forest-900">{diff.totals.will_change} change{diff.totals.will_change === 1 ? "" : "s"}</p>
            <p className="mt-1 text-sm text-slate-600">{diff.totals.matched - diff.totals.will_change} match{diff.totals.matched - diff.totals.will_change === 1 ? " is" : "es are"} already correct and won&apos;t be touched.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClass} onClick={runDiff} disabled={isPending}>
              <RefreshCw className="h-4 w-4" />
              {isPending ? "Refreshing…" : "Re-run diff"}
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={runApply}
              disabled={applying || isPending || diff.totals.will_change === 0}
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {applying ? "Applying…" : `Apply ${diff.totals.will_change} change${diff.totals.will_change === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
        {applied ? (
          <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm font-bold text-green-900">
            ✓ Applied {applied.applied} change{applied.applied === 1 ? "" : "s"}. Diff has been refreshed.
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm font-bold text-red-700">Error: {error}</p> : null}
      </Panel>

      {/* Filters */}
      <Panel>
        <SectionHeader title="Detail" detail="Filter to inspect specific rows." />
        <div className="mb-3 flex flex-wrap gap-2">
          <FilterBtn active={activeFilter === "changes"} onClick={() => setActiveFilter("changes")} count={diff.totals.will_change}>Changes</FilterBtn>
          <FilterBtn active={activeFilter === "all"} onClick={() => setActiveFilter("all")} count={diff.entries.length}>All</FilterBtn>
          <FilterBtn active={activeFilter === "match-no-change"} onClick={() => setActiveFilter("match-no-change")} count={diff.entries.filter((e) => e.status === "match-no-change").length}>Already correct</FilterBtn>
          <FilterBtn active={activeFilter === "no-person"} onClick={() => setActiveFilter("no-person")} count={diff.totals.unmatched}>Unmatched names</FilterBtn>
          <FilterBtn active={activeFilter === "multiple-matches"} onClick={() => setActiveFilter("multiple-matches")} count={diff.totals.ambiguous}>Ambiguous</FilterBtn>
          <FilterBtn active={activeFilter === "no-cabin"} onClick={() => setActiveFilter("no-cabin")} count={diff.totals.cabin_missing}>Missing cabin</FilterBtn>
        </div>

        {diff.missingCabins.length > 0 ? (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <p className="font-black">Cabins referenced in the file but not in the database:</p>
            <p className="mt-1 font-mono">{diff.missingCabins.join(", ")}</p>
            <p className="mt-1">These rows can&apos;t be applied until the cabins exist. Create them in /admin/cabins (once that page is live) or by re-importing the original camper CSV.</p>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-forest-900 text-white">
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Current cabin</th>
                <th className="p-2 text-left">Desired cabin</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-slate-500">No rows match this filter.</td></tr>
              ) : filtered.map((e) => (
                <tr key={e.importIndex} className="border-b border-slate-100">
                  <td className="p-2 font-bold">{e.importName}</td>
                  <td className="p-2"><Badge tone={e.role === "camper" ? "blue" : "green"}>{e.role}</Badge></td>
                  <td className="p-2 text-slate-700">{e.match?.currentCabinName ?? (e.match?.currentHousingLabel ?? "—")}</td>
                  <td className="p-2 font-bold text-forest-900">{e.desiredCabinName}</td>
                  <td className="p-2"><StatusBadge status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function SummaryTile({ label, value, tone, icon }: { label: string; value: number; tone: "slate" | "green" | "lake" | "amber" | "red"; icon?: React.ReactNode }) {
  const toneClasses = {
    slate: "border-slate-200 bg-white text-slate-900",
    green: "border-green-200 bg-green-50 text-green-900",
    lake: "border-lake-200 bg-lake-50 text-lake-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900"
  };
  return (
    <div className={`rounded-lg border p-3 ${toneClasses[tone]}`}>
      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide opacity-80">{icon}{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
    </div>
  );
}

function FilterBtn({ children, active, onClick, count }: { children: React.ReactNode; active: boolean; onClick: () => void; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm font-black ${active ? "border-forest-700 bg-forest-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}
    >
      {children}
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${active ? "bg-white text-forest-700" : "bg-slate-100 text-slate-600"}`}>{count}</span>
    </button>
  );
}

function StatusBadge({ status }: { status: DiffEntry["status"] }) {
  switch (status) {
    case "match-no-change": return <Badge tone="green">Already correct</Badge>;
    case "match-cabin-change": return <Badge tone="blue">Cabin will change</Badge>;
    case "match-unit-change": return <Badge tone="blue">Unit will change</Badge>;
    case "match-both-change": return <Badge tone="blue">Cabin + unit will change</Badge>;
    case "no-person": return <Badge tone="amber">Name not in DB</Badge>;
    case "multiple-matches": return <Badge tone="amber">Multiple matches</Badge>;
    case "no-cabin": return <Badge tone="red">Cabin doesn&apos;t exist</Badge>;
  }
}
