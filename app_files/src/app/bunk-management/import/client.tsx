"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2, Upload } from "lucide-react";
import { Panel, SectionHeader, buttonClass, inputClass } from "@/components/ui";
import { applyImportDiff, generateImportDiff, type ImportDiffEntry, type ImportDiffResult } from "./actions";
import type { ParsedCamper } from "@/lib/bunk-import-parser";

const STATUS_LABEL: Record<ImportDiffEntry["status"], string> = {
  "match-no-change": "Already correct",
  "match-cabin-change": "Cabin will change",
  "will-create-new": "New camper",
  "will-create-from-prior": "Found in another session",
  "no-person": "No match found",
  "multiple-matches": "Multiple possible matches",
  "no-cabin": "Cabin doesn't exist yet"
};

export function ImportClient() {
  const [gender, setGender] = useState<"MALE" | "FEMALE">("MALE");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<ImportDiffResult | null>(null);
  const [campers, setCampers] = useState<ParsedCamper[] | null>(null);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [applyResult, setApplyResult] = useState<{ applied: number; created: number; overrideApplied: number } | null>(null);
  const [busy, startTransition] = useTransition();

  function generate() {
    if (!file) { setError("Choose a file first."); return; }
    setError(null);
    setDiff(null);
    setApplyResult(null);
    setOverrides({});
    const formData = new FormData();
    formData.set("file", file);
    formData.set("gender", gender);
    startTransition(async () => {
      const result = await generateImportDiff(formData);
      if (result.ok) {
        setDiff(result.diff);
        setCampers(result.campers);
      } else {
        setError(result.error);
      }
    });
  }

  function apply() {
    if (!diff || !campers) return;
    setError(null);
    startTransition(async () => {
      const result = await applyImportDiff(campers, diff.gender, diff.sessionId, overrides);
      if (result.ok) {
        setApplyResult(result);
      } else {
        setError(result.error);
      }
    });
  }

  const changeCount = diff ? diff.entries.filter((e) => e.status === "match-cabin-change").length : 0;
  const createCount = diff ? diff.entries.filter((e) => e.status === "will-create-new" || e.status === "will-create-from-prior").length : 0;
  const needsReview = diff ? diff.entries.filter((e) => e.status === "no-person" || e.status === "multiple-matches") : [];
  const blocked = diff ? diff.entries.filter((e) => e.status === "no-cabin") : [];
  const readyCount = changeCount + createCount;

  return (
    <div className="space-y-6">
      <Panel>
        <SectionHeader title="1. Upload" detail="Active session, gender-specific" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            <button type="button" className={`px-3 py-2 text-xs font-black ${gender === "MALE" ? "bg-forest-700 text-white" : "bg-white text-slate-700"}`} onClick={() => setGender("MALE")}>Boys</button>
            <button type="button" className={`px-3 py-2 text-xs font-black ${gender === "FEMALE" ? "bg-forest-700 text-white" : "bg-white text-slate-700"}`} onClick={() => setGender("FEMALE")}>Girls</button>
          </div>
          <input
            className={inputClass}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button className={buttonClass} type="button" onClick={generate} disabled={busy || !file}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Generate preview
          </button>
        </div>
        {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
      </Panel>

      {diff ? (
        <>
          <Panel>
            <SectionHeader title="2. Preview" detail={`${diff.sessionCycle} ${diff.sessionYear} · ${diff.gender === "MALE" ? "Boys" : "Girls"} · parsed from ${diff.sheetsParsed.join(", ")}`} />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="In file" value={diff.totals.in_file} />
              <Stat label="Cabin will change" value={diff.totals.will_change} tone="amber" />
              <Stat label="New campers" value={diff.totals.will_create_new + diff.totals.will_create_from_prior} tone="blue" />
              <Stat label="Needs review" value={diff.totals.unmatched + diff.totals.ambiguous} tone="red" />
            </div>

            {diff.missingCabins.length > 0 ? (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Cabin{diff.missingCabins.length === 1 ? "" : "s"} not found in the database: {diff.missingCabins.join(", ")}. Create {diff.missingCabins.length === 1 ? "it" : "them"} on the Cabins screen first, then re-upload.
              </p>
            ) : null}

            {diff.skippedStaffCa.length > 0 ? (
              <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <summary className="cursor-pointer font-bold text-slate-700">Staff/CA names found in the file, not imported ({diff.skippedStaffCa.length})</summary>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {diff.skippedStaffCa.map((s, i) => <li key={i}>{s.name} ({s.tag}) — {s.cabinName}</li>)}
                </ul>
              </details>
            ) : null}
          </Panel>

          {needsReview.length > 0 ? (
            <Panel>
              <SectionHeader title="Needs a decision" detail={`${needsReview.length} row${needsReview.length === 1 ? "" : "s"}`} />
              <div className="mt-3 flex flex-col gap-3">
                {needsReview.map((entry) => (
                  <div key={entry.parsedIndex} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="font-bold text-slate-800">{entry.importName} <span className="text-xs font-semibold text-slate-500">→ {entry.desiredCabinName}{entry.grade ? ` · ${entry.grade}` : ""}{entry.session ? ` · ${entry.session}` : ""}</span></p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-amber-800">{STATUS_LABEL[entry.status]}</p>
                    <div className="mt-2 flex flex-col gap-1">
                      {(entry.fuzzySuggestions ?? entry.multipleMatches ?? []).map((candidate) => {
                        const id = "id" in candidate ? candidate.id : "";
                        const label = "name" in candidate
                          ? `${candidate.name} (${Math.round(candidate.score)}% — ${candidate.reason}${candidate.sessionName ? `, ${candidate.sessionName}` : ""})`
                          : `Existing camper (${candidate.currentCabinName ?? "no cabin"}${candidate.sessionName ? `, ${candidate.sessionName}` : ""})`;
                        return (
                          <label key={id} className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name={`override-${entry.parsedIndex}`}
                              checked={overrides[entry.parsedIndex] === id}
                              onChange={() => setOverrides((prev) => ({ ...prev, [entry.parsedIndex]: id }))}
                            />
                            {label}
                          </label>
                        );
                      })}
                      <label className="flex items-center gap-2 text-sm text-slate-500">
                        <input
                          type="radio"
                          name={`override-${entry.parsedIndex}`}
                          checked={!overrides[entry.parsedIndex]}
                          onChange={() => setOverrides((prev) => { const next = { ...prev }; delete next[entry.parsedIndex]; return next; })}
                        />
                        Skip this one (leave for manual entry later)
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {blocked.length > 0 ? (
            <Panel>
              <SectionHeader title="Blocked — missing cabin" detail={`${blocked.length} row${blocked.length === 1 ? "" : "s"}, never auto-applied`} />
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {blocked.map((e) => <li key={e.parsedIndex}>{e.importName} → {e.desiredCabinName} — {e.notes}</li>)}
              </ul>
            </Panel>
          ) : null}

          <Panel>
            <SectionHeader title="3. Apply" detail={`${readyCount + Object.keys(overrides).length} change${readyCount + Object.keys(overrides).length === 1 ? "" : "s"} ready`} />
            <p className="mt-2 text-sm text-slate-500">Rows already correct aren&apos;t touched. Blocked rows above are skipped until their cabin exists.</p>
            <button className={`${buttonClass} mt-3`} type="button" onClick={apply} disabled={busy || readyCount + Object.keys(overrides).length === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Apply changes
            </button>
            {applyResult ? (
              <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">
                Done — {applyResult.applied} cabin change{applyResult.applied === 1 ? "" : "s"}, {applyResult.created} new camper{applyResult.created === 1 ? "" : "s"} created, {applyResult.overrideApplied} manual pick{applyResult.overrideApplied === 1 ? "" : "s"} applied.
              </p>
            ) : null}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" | "blue" | "red" }) {
  const toneClass = tone === "amber" ? "text-amber-700" : tone === "blue" ? "text-lake-700" : tone === "red" ? "text-red-700" : "text-forest-900";
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}
