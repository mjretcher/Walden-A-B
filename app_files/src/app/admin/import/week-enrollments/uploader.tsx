"use client";

import { useState, useTransition } from "react";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

type ImportResult = {
  sessionName: string | null;
  totalRows: number;
  matched: number;
  applied: number;
  weeksCreated: number;
  unmatched: string[];
  ambiguous: string[];
  unknownSessionLabels: string[];
  committed: boolean;
};

export function WeekEnrollmentUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(commit: boolean) {
    if (!file) {
      setMessage("Choose the xlsx report first.");
      return;
    }
    setMessage("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("commit", commit ? "true" : "false");
      const response = await fetch("/api/import/week-enrollments", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Import failed.");
        setResult(null);
        return;
      }
      setResult(data.result);
      setMessage(
        commit
          ? `Imported: ${data.result.weeksCreated} week rows across ${data.result.applied} campers.`
          : `Preview only — nothing written. ${data.result.applied} campers ready.`
      );
    });
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-lg border border-white bg-white p-5 shadow-soft">
        <label className="grid gap-2 text-sm font-black text-forest-900">
          CampMinder report (.xlsx)
          <input
            accept=".xlsx,.xls"
            className="rounded-md border border-slate-200 p-2 text-sm"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={secondaryButtonClass} disabled={isPending} onClick={() => submit(false)} type="button">
            Preview
          </button>
          <button className={buttonClass} disabled={isPending} onClick={() => submit(true)} type="button">
            Import week enrollments
          </button>
        </div>
        {message ? <p className="mt-3 text-sm font-bold text-forest-900">{message}</p> : null}
      </div>

      {result ? (
        <div className="rounded-lg border border-white bg-white p-5 shadow-soft text-sm">
          <h2 className="text-lg font-bold text-forest-900">{result.committed ? "Import result" : "Preview"} — {result.sessionName}</h2>
          <p className="mt-2 text-slate-700">
            {result.totalRows} rows in file · {result.applied} campers {result.committed ? "updated" : "ready"} · {result.weeksCreated} week rows {result.committed ? "written" : "to write"}
          </p>
          {result.unknownSessionLabels.length ? (
            <p className="mt-2 font-bold text-red-700">Unrecognized session values (skipped): {result.unknownSessionLabels.join("; ")}</p>
          ) : null}
          {result.ambiguous.length ? (
            <p className="mt-2 font-bold text-amber-700">Multiple matching campers (skipped, fix by hand): {result.ambiguous.join(", ")}</p>
          ) : null}
          {result.unmatched.length ? (
            <div className="mt-2">
              <p className="font-bold text-slate-700">No matching camper in the active session ({result.unmatched.length}):</p>
              <p className="text-slate-600">{result.unmatched.join(", ")}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
