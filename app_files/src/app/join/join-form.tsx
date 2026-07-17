"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { inputClass } from "@/components/ui";

export function JoinForm({ prefillCode, eventOpen }: { prefillCode: string; eventOpen: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState(prefillCode);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/event/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Couldn't join — try again.");
        return;
      }
      router.push("/event-registration");
      router.refresh();
    } catch {
      setError("Network hiccup — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-700" htmlFor="join-code">Join code</label>
        <input
          autoCapitalize="characters"
          autoComplete="off"
          className={`${inputClass} text-center text-2xl font-black tracking-[0.3em] uppercase`}
          id="join-code"
          inputMode="text"
          maxLength={8}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="ABC123"
          value={code}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-700" htmlFor="join-name">Your name</label>
        <input
          autoComplete="name"
          className={inputClass}
          id="join-name"
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !busy) join();
          }}
          placeholder="First Last"
          value={name}
        />
        <p className="mt-1 text-xs font-medium text-slate-500">Every registration you save is recorded under this name.</p>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div> : null}
      <button
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-lake-600 text-base font-black text-white disabled:opacity-50"
        disabled={busy || !eventOpen || code.trim().length < 4 || name.trim().length < 2}
        onClick={join}
        type="button"
      >
        <LogIn className="h-5 w-5" />
        {busy ? "Joining..." : "Join Registration Day"}
      </button>
    </div>
  );
}
