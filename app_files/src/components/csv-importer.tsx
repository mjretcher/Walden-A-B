"use client";

import { useState, useTransition } from "react";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

// Matches what /api/import/campers and /api/import/staff actually return
// (previewRealCamperImport / previewRealStaffImport in real-data-import.ts):
// a summary object with counts + a small sample of rows, NOT an array of
// per-row valid/duplicate entries. The component previously assumed the
// latter shape, which meant `preview.map(...)` / `preview.length` were
// called against an object — the preview table never rendered.
type ImportPreview = {
  session?: string | null;
  rows: number;
  valid?: number;
  invalid?: number;
  eligible?: number;
  ineligible?: number;
  sampleReplacementCandidates?: number;
  externalIdColumnDetected?: boolean;
  firstRows: Array<Record<string, unknown>>;
};

function labelForKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function CsvImporter({
  endpoint,
  sample,
  title
}: {
  endpoint: string;
  sample: string;
  title: string;
}) {
  const [csv, setCsv] = useState(sample);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  async function submit(commit: boolean) {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, commit })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Import failed.");
        return;
      }
      setPreview(data.preview ?? null);
      setMessage(commit ? `Imported ${data.imported ?? 0} rows.` : `Previewed ${data.preview?.rows ?? 0} rows.`);
    });
  }

  const readyCount = preview?.valid ?? preview?.eligible ?? 0;
  const needsFixCount = preview?.invalid ?? preview?.ineligible ?? 0;

  return (
    <div className="grid gap-5">
      <div className="rounded-lg border border-white bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-forest-900">{title}</h2>
        <textarea
          className="mt-4 min-h-72 w-full rounded-md border border-slate-200 p-3 font-mono text-sm outline-none focus:border-lake-500 focus:ring-2 focus:ring-lake-100"
          value={csv}
          onChange={(event) => setCsv(event.target.value)}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={secondaryButtonClass} disabled={isPending} type="button" onClick={() => submit(false)}>
            Preview
          </button>
          <button className={buttonClass} disabled={isPending || !preview || readyCount === 0} type="button" onClick={() => submit(true)}>
            Commit valid rows
          </button>
        </div>
        {message ? <p className="mt-3 text-sm font-medium text-forest-800">{message}</p> : null}
      </div>

      {preview ? (
        <div className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-forest-900">
            <span>{preview.rows} row{preview.rows === 1 ? "" : "s"} found</span>
            <span className="text-slate-300">·</span>
            <span className="text-forest-700">{readyCount} ready</span>
            {needsFixCount > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-red-700">{needsFixCount} need fixing</span>
              </>
            )}
            {preview.session && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-slate-500">importing into {preview.session}</span>
              </>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
            {typeof preview.sampleReplacementCandidates === "number" && preview.sampleReplacementCandidates > 0 && (
              <span>{preview.sampleReplacementCandidates} sample record{preview.sampleReplacementCandidates === 1 ? "" : "s"} will be replaced</span>
            )}
            {preview.externalIdColumnDetected && <span className="font-semibold text-lake-700">Matching by ID column</span>}
          </div>

          {preview.firstRows.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr className="border-b">
                    <th className="py-3">Name</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.firstRows.map((row, index) => {
                    const name = [row.firstName, row.lastName].filter(Boolean).join(" ") || "—";
                    const details = Object.entries(row)
                      .filter(([key]) => key !== "firstName" && key !== "lastName")
                      .map(([key, value]) => [labelForKey(key), formatDetailValue(value)] as const)
                      .filter(([, value]) => value !== "")
                      .map(([label, value]) => `${label}: ${value}`)
                      .join(" · ");
                    return (
                      <tr key={`${name}-${index}`} className="border-b last:border-0">
                        <td className="py-3 font-semibold">{name}</td>
                        <td className="text-slate-500">{details || "Ready"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {preview.rows > preview.firstRows.length && (
                <p className="mt-2 text-xs text-slate-400">Showing first {preview.firstRows.length} of {preview.rows} rows.</p>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
