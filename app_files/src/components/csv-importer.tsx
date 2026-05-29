"use client";

import { useState, useTransition } from "react";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

type PreviewRow = {
  row: Record<string, string>;
  valid: boolean;
  duplicate: boolean;
  errors?: string[];
  warnings?: string[];
};

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
  const [preview, setPreview] = useState<PreviewRow[]>([]);
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
      setPreview(data.preview ?? []);
      setMessage(commit ? `Imported ${data.imported ?? 0} rows.` : `Previewed ${data.preview?.length ?? 0} rows.`);
    });
  }

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
          <button className={buttonClass} disabled={isPending || !preview.length} type="button" onClick={() => submit(true)}>
            Commit valid rows
          </button>
        </div>
        {message ? <p className="mt-3 text-sm font-medium text-forest-800">{message}</p> : null}
      </div>

      {preview.length ? (
        <div className="overflow-x-auto rounded-lg border border-white bg-white p-5 shadow-soft">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b">
                <th className="py-3">Status</th>
                <th>Name</th>
                <th>Details</th>
                <th>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((item, index) => (
                <tr key={`${item.row.firstName}-${item.row.lastName}-${index}`} className="border-b last:border-0">
                  <td className="py-3 font-semibold">{item.valid ? (item.duplicate ? "Update" : "New") : "Fix"}</td>
                  <td>{item.row.firstName} {item.row.lastName}</td>
                  <td className="text-slate-500">{item.errors?.join(", ") || item.row.cabin || item.row.primaryArea || "Ready"}</td>
                  <td className="text-slate-500">{item.warnings?.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
