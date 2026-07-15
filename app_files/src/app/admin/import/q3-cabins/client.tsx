"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Eye, Loader2, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { Badge, Panel, SectionHeader, buttonClass, secondaryButtonClass } from "@/components/ui";
import { generateQ3Diff, applyQ3Diff, type DiffResult, type DiffEntry } from "./actions";

export function Q3CabinImportClient() {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ applied: number; overrideApplied: number; created: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<DiffEntry["status"] | "all" | "changes">("changes");
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [resolvedConflicts, setResolvedConflicts] = useState<Record<string, number>>({});
  const [isPending, startTransition] = useTransition();

  function runDiff() {
    setError(null);
    setApplied(null);
    startTransition(async () => {
      try {
        const result = await generateQ3Diff();
        setDiff(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function runApply() {
    if (!diff) return;
    const overrideCount = Object.keys(overrides).length;
    const resolvedCount = Object.keys(resolvedConflicts).length;
    const totalCreates = diff.totals.will_create_new + diff.totals.will_create_from_prior;
    const totalChanges = diff.totals.will_change + overrideCount + totalCreates + resolvedCount;
    const confirmed = window.confirm(
      `Apply ${totalChanges} change${totalChanges === 1 ? "" : "s"} to ${diff.sessionName} (${diff.sessionCycle} ${diff.sessionYear})?\n\n` +
      `  • ${diff.totals.will_change} clean match${diff.totals.will_change === 1 ? "" : "es"} (cabin/unit will change)\n` +
      `  • ${diff.totals.will_create_from_prior} NEW record${diff.totals.will_create_from_prior === 1 ? "" : "s"} copied forward from another session (real swim level/age/allergies preserved, bunk NOT carried forward)\n` +
      `  • ${diff.totals.will_create_new} brand-NEW record${diff.totals.will_create_new === 1 ? "" : "s"} with no prior history\n` +
      `  • ${overrideCount} manual override${overrideCount === 1 ? "" : "s"} you confirmed\n` +
      `  • ${resolvedCount} conflicting row${resolvedCount === 1 ? "" : "s"} you picked a winner for\n\n` +
      `Every record touched also gets its Session designation (e.g. "Second Session") set from the sheet.\n\n` +
      `Remaining unmatched names, ambiguous matches, unresolved conflicting rows, and missing cabins will NOT be touched.\n\n` +
      `This action runs in a single transaction.`
    );
    if (!confirmed) return;
    setApplying(true);
    setError(null);
    startTransition(async () => {
      try {
        const result = await applyQ3Diff(overrides, Object.values(resolvedConflicts));
        if (result.ok) {
          setApplied({ applied: result.applied, overrideApplied: result.overrideApplied, created: result.created });
          setOverrides({});
          setResolvedConflicts({});
          const fresh = await generateQ3Diff();
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
      <div className="space-y-4">
        <Panel>
          <SectionHeader title="Start here" detail="Generate a diff to see what would change before applying anything." />
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-black">What this does</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Compares Bree&apos;s Q3 (Second Session) camper list to current database assignments.</li>
              <li>Matches campers by exact first + last name (case-insensitive), scoped to whichever session is currently active.</li>
              <li>If a camper in the sheet doesn&apos;t exist in this session yet, checks every other session for a matching record and copies their real profile (swim level, age, allergies, medical flags) into a new record instead of creating a blank one. Their old bunk is <b>not</b> carried forward — Q3 is a fresh cabin re-shuffle.</li>
              <li>If no record exists anywhere, creates a brand-new one — swim level defaults to &quot;pending test&quot;.</li>
              <li>Every camper touched gets a Session designation (&quot;Second Session&quot;, &quot;Full Season&quot;, etc.) set from the sheet — this is what prints on rosters.</li>
              <li>Rows with no bunk listed in the sheet (mostly CAs) are saved without a cabin — nothing is guessed.</li>
              <li>Shows you every proposed change and creation before any write. Skips unmatched names, ambiguous matches, and conflicting rows — those need manual review.</li>
              <li>Applies only when you click Apply, in a single transaction.</li>
            </ul>
          </div>
          <div className="mt-3 rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-900">
            Make sure the Q3 session has been created and set ACTIVE on the Camp Structure page before generating this
            diff — this tool always targets whichever session is currently active, not necessarily &quot;Q3&quot; by name.
          </div>
          <button type="button" className={`${buttonClass} mt-4`} onClick={runDiff} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            {isPending ? "Generating…" : "Generate diff"}
          </button>
          {error ? <p className="mt-3 text-sm font-bold text-red-700">Error: {error}</p> : null}
        </Panel>
      </div>
    );
  }

  const filtered = diff.entries.filter((e) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "changes") return e.status === "match-cabin-change" || e.status === "match-unit-change" || e.status === "match-both-change";
    if (activeFilter === "will-create-new") return e.status === "will-create-new" || e.status === "will-create-from-prior";
    return e.status === activeFilter;
  });

  const camperFromPrior = diff.totals.will_create_from_prior;
  const camperBrandNew = diff.totals.will_create_new;
  const totalToApplyCount = diff.totals.will_change + diff.totals.will_create_new + diff.totals.will_create_from_prior + Object.keys(overrides).length + Object.keys(resolvedConflicts).length;

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeader title="What this ran against" detail="Confirms which session and how much of the roster is actually in the database." />
        <div className={`mt-2 rounded-lg border-2 p-3 text-sm font-bold ${diff.sessionActive ? "border-forest-700 bg-forest-50 text-forest-900" : "border-red-400 bg-red-50 text-red-900"}`}>
          Applying to the currently active session: {diff.sessionName} ({diff.sessionCycle}, {diff.sessionYear}).
          {" "}If this isn&apos;t Q3, switch the active session on the Camp Structure page first — this tool always targets whichever session is active.
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <p className="font-black text-slate-700">Campers (scoped to active session)</p>
          <p className="mt-1">{diff.totals.matched} of {diff.totals.in_file} rows in the file matched an existing record in this session.</p>
          <p className="mt-1 text-slate-500">Of the rest: {camperFromPrior} will be created by copying a matching record found in another session (real swim level/age/allergies preserved, bunk not carried forward), {camperBrandNew} have no record anywhere and will be created blank.</p>
          {diff.totals.no_bunk_listed > 0 ? (
            <p className="mt-1 text-amber-700 font-bold">{diff.totals.no_bunk_listed} row{diff.totals.no_bunk_listed === 1 ? "" : "s"} in the sheet list no bunk at all (mostly CAs) — these will be saved without a cabin.</p>
          ) : null}
        </div>

        {diff.totals.grade_mismatch_flags > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-black">{diff.totals.grade_mismatch_flags} record{diff.totals.grade_mismatch_flags === 1 ? "" : "s"} flagged for a grade mismatch</p>
            <p className="mt-0.5">Same first+last name matched a record in another session, but the grade doesn&apos;t line up the way it should year-over-year — worth a quick look before trusting the copied profile. Filter to &quot;Will create&quot; below and check the notes under each name.</p>
          </div>
        ) : null}

        <div className="mt-3 overflow-x-auto">
          <p className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Every session in the database</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600">
                <th className="p-1.5 text-left">Name</th>
                <th className="p-1.5 text-left">Cycle</th>
                <th className="p-1.5 text-left">Year</th>
                <th className="p-1.5 text-left">Active?</th>
                <th className="p-1.5 text-left">Camper rows</th>
              </tr>
            </thead>
            <tbody>
              {diff.sessionsOverview.map((s) => (
                <tr key={s.id} className={`border-b border-slate-100 ${s.active ? "bg-lake-50 font-bold" : ""}`}>
                  <td className="p-1.5">{s.name}</td>
                  <td className="p-1.5">{s.cycle}</td>
                  <td className="p-1.5">{s.year}</td>
                  <td className="p-1.5">{s.active ? "Active" : ""}</td>
                  <td className="p-1.5">{s.camperCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {diff.duplicateNameConflicts.length > 0 ? (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-black">{diff.duplicateNameConflicts.length} name{diff.duplicateNameConflicts.length === 1 ? "" : "s"} appear more than once in the sheet with different bunks</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 font-mono">
            {diff.duplicateNameConflicts.map((c) => <li key={c.name}>{c.name} — {c.cabins.join(" / ")}</li>)}
          </ul>
          <p className="mt-1 font-sans">Resolve these below by picking a winning bunk for each — filter to &quot;Conflicting rows&quot;.</p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        <SummaryTile label="In file" value={diff.totals.in_file} tone="slate" />
        <SummaryTile label="Matched" value={diff.totals.matched} tone="green" icon={<CheckCircle2 className="h-4 w-4" />} />
        <SummaryTile label="Will change" value={diff.totals.will_change} tone="lake" icon={<ArrowRight className="h-4 w-4" />} />
        <SummaryTile label="Will create" value={diff.totals.will_create_new + diff.totals.will_create_from_prior} tone="lake" icon={<ArrowRight className="h-4 w-4" />} />
        <SummaryTile label="Unmatched" value={diff.totals.unmatched} tone="amber" icon={<Users className="h-4 w-4" />} />
        <SummaryTile label="Ambiguous" value={diff.totals.ambiguous} tone="amber" icon={<AlertTriangle className="h-4 w-4" />} />
        <SummaryTile label="Cabin missing" value={diff.totals.cabin_missing} tone="red" icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-slate-500">Ready to apply</p>
            <p className="mt-1 text-2xl font-black text-forest-900">{totalToApplyCount} change{totalToApplyCount === 1 ? "" : "s"}</p>
            <p className="mt-1 text-sm text-slate-600">
              {diff.totals.will_change} cabin/unit update{diff.totals.will_change === 1 ? "" : "s"}, {diff.totals.will_create_from_prior} new record{diff.totals.will_create_from_prior === 1 ? "" : "s"} copied from another session, {diff.totals.will_create_new} brand-new record{diff.totals.will_create_new === 1 ? "" : "s"}
              {Object.keys(overrides).length > 0 ? `, + ${Object.keys(overrides).length} manual override${Object.keys(overrides).length === 1 ? "" : "s"}` : ""}
              {Object.keys(resolvedConflicts).length > 0 ? `, + ${Object.keys(resolvedConflicts).length} resolved conflict${Object.keys(resolvedConflicts).length === 1 ? "" : "s"}` : ""}.
              {" "}{diff.totals.matched - diff.totals.will_change} match{diff.totals.matched - diff.totals.will_change === 1 ? " is" : "es are"} already correct.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClass} onClick={runDiff} disabled={isPending}>
              <RefreshCw className="h-4 w-4" />
              {isPending ? "Refreshing…" : "Re-run diff"}
            </button>
            <button type="button" className={buttonClass} onClick={runApply} disabled={applying || isPending || totalToApplyCount === 0}>
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {applying ? "Applying…" : `Apply ${totalToApplyCount} change${totalToApplyCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
        {applied ? (
          <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm font-bold text-green-900">
            ✓ Applied {applied.applied} clean change{applied.applied === 1 ? "" : "s"}, created {applied.created} new record{applied.created === 1 ? "" : "s"}
            {applied.overrideApplied > 0 ? ` + ${applied.overrideApplied} manual override${applied.overrideApplied === 1 ? "" : "s"}` : ""}. Diff has been refreshed.
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm font-bold text-red-700">Error: {error}</p> : null}
      </Panel>

      <Panel>
        <SectionHeader title="Detail" detail="Filter to inspect specific rows." />
        <div className="mb-3 flex flex-wrap gap-2">
          <FilterBtn active={activeFilter === "changes"} onClick={() => setActiveFilter("changes")} count={diff.totals.will_change}>Changes</FilterBtn>
          <FilterBtn active={activeFilter === "will-create-new"} onClick={() => setActiveFilter("will-create-new")} count={diff.totals.will_create_new + diff.totals.will_create_from_prior}>Will create</FilterBtn>
          <FilterBtn active={activeFilter === "all"} onClick={() => setActiveFilter("all")} count={diff.entries.length}>All</FilterBtn>
          <FilterBtn active={activeFilter === "match-no-change"} onClick={() => setActiveFilter("match-no-change")} count={diff.entries.filter((e) => e.status === "match-no-change").length}>Already correct</FilterBtn>
          <FilterBtn active={activeFilter === "no-person"} onClick={() => setActiveFilter("no-person")} count={diff.totals.unmatched}>Unmatched names</FilterBtn>
          <FilterBtn active={activeFilter === "multiple-matches"} onClick={() => setActiveFilter("multiple-matches")} count={diff.totals.ambiguous}>Ambiguous</FilterBtn>
          <FilterBtn active={activeFilter === "no-cabin"} onClick={() => setActiveFilter("no-cabin")} count={diff.totals.cabin_missing}>Missing cabin</FilterBtn>
          <FilterBtn active={activeFilter === "duplicate-conflict"} onClick={() => setActiveFilter("duplicate-conflict")} count={diff.totals.duplicate_conflicts}>Conflicting rows</FilterBtn>
        </div>

        {(activeFilter === "no-person" || activeFilter === "multiple-matches") ? (
          <div className="mb-3 rounded-lg border border-lake-200 bg-lake-50 p-3 text-sm text-lake-900">
            <p className="font-black">Pick a match</p>
            <p className="mt-0.5">Click a suggestion to confirm it — it&apos;ll be included when you Apply. &quot;Match with&quot; updates an existing record in place. &quot;Copy from&quot; means that person exists in a different session, so confirming creates a brand-new record using their real profile.</p>
          </div>
        ) : null}

        {diff.missingCabins.length > 0 ? (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <p className="font-black">Cabins referenced in the file but not in the database:</p>
            <p className="mt-1 font-mono">{diff.missingCabins.join(", ")}</p>
            <p className="mt-1">These rows can&apos;t be applied until the cabins exist. <a className="font-bold underline" href="/admin/cabins">Create them on the Cabin Admin page</a>, then re-run the diff.</p>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-forest-900 text-white">
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Session</th>
                <th className="p-2 text-left">Current cabin</th>
                <th className="p-2 text-left">Desired cabin</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-slate-500">No rows match this filter.</td></tr>
              ) : filtered.map((e) => {
                const isOverridden = overrides[e.importIndex] != null;
                const isChosenWinner = e.conflictGroupKey != null && resolvedConflicts[e.conflictGroupKey] === e.importIndex;
                const isLosingSibling = e.conflictGroupKey != null && resolvedConflicts[e.conflictGroupKey] != null && !isChosenWinner;
                return (
                  <tr key={e.importIndex} className={`border-b border-slate-100 ${isOverridden || isChosenWinner ? "bg-green-50" : ""} ${isLosingSibling ? "opacity-50" : ""}`}>
                    <td className="p-2 font-bold align-top">
                      {e.importName}
                      {e.notes ? <div className={`mt-0.5 text-xs font-normal ${e.notes.startsWith("⚠") ? "font-bold text-amber-700" : "text-slate-500"}`}>{e.notes}</div> : null}
                      {e.status === "duplicate-conflict" && e.conflictGroupKey ? (
                        <button
                          type="button"
                          className={`mt-1 block w-full rounded-md border px-2 py-1 text-left text-xs ${isChosenWinner ? "border-green-500 bg-green-100 font-bold text-green-900" : "border-slate-200 bg-white text-slate-700 hover:border-lake-400 hover:bg-lake-50"}`}
                          onClick={() => {
                            setResolvedConflicts((prev) => {
                              const next = { ...prev };
                              if (isChosenWinner) delete next[e.conflictGroupKey!];
                              else next[e.conflictGroupKey!] = e.importIndex;
                              return next;
                            });
                          }}
                        >
                          {isChosenWinner ? "✓ " : "↪ "}Use this bunk ({e.desiredCabinName || "none listed"}) for {e.importName}
                          {isChosenWinner ? <span className="text-slate-500"> — the other conflicting row will be left alone</span> : null}
                        </button>
                      ) : null}
                      {(e.status === "no-person" || e.status === "multiple-matches") ? (
                        <div className="mt-1 space-y-1">
                          {[...(e.fuzzySuggestions ?? []), ...(e.multipleMatches ?? []).map((m) => ({ ...m, name: e.importName, score: 100, reason: "Exact name match" }))].map((s) => {
                            const selected = overrides[e.importIndex] === s.id;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                className={`block w-full rounded-md border px-2 py-1 text-left text-xs ${selected ? "border-green-500 bg-green-100 font-bold text-green-900" : "border-slate-200 bg-white text-slate-700 hover:border-lake-400 hover:bg-lake-50"}`}
                                onClick={() => {
                                  setOverrides((prev) => {
                                    const next = { ...prev };
                                    if (selected) delete next[e.importIndex];
                                    else next[e.importIndex] = s.id;
                                    return next;
                                  });
                                }}
                              >
                                {selected ? "✓ " : "↪ "}
                                {s.inTargetSession ? "Match with " : "Copy from "}
                                <span className="font-bold">{s.name}</span>
                                {s.inTargetSession
                                  ? (s.currentCabinName ? <span className="text-slate-500"> (currently in {s.currentCabinName})</span> : <span className="text-slate-500"> (no cabin)</span>)
                                  : <span className="text-slate-500"> — found in {s.sessionName ?? "another session"}, will create a new record with their profile</span>}
                                <span className="ml-2 text-slate-400">{s.score}% · {s.reason}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-2 align-top text-slate-700">{e.sessionLabel}</td>
                    <td className="p-2 align-top text-slate-700">{e.match?.currentCabinName ?? "—"}</td>
                    <td className="p-2 align-top font-bold text-forest-900">{e.desiredCabinName || <span className="italic text-slate-400">none listed</span>}</td>
                    <td className="p-2 align-top">
                      <StatusBadge status={e.status} />
                      {isOverridden ? <span className="mt-1 block text-xs font-bold text-green-700">↪ Override set</span> : null}
                      {isChosenWinner ? <span className="mt-1 block text-xs font-bold text-green-700">↪ Picked as winner</span> : null}
                    </td>
                  </tr>
                );
              })}
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
    case "duplicate-conflict": return <Badge tone="red">Conflicting bunks in file</Badge>;
    case "will-create-new": return <Badge tone="blue">Will create — no prior record</Badge>;
    case "will-create-from-prior": return <Badge tone="blue">Will create — copied from prior session</Badge>;
  }
}
