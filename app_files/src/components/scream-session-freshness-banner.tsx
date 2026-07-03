"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const pollMs = 20000;

/**
 * The Scream Session board is edited by multiple Exec Admins at once, but
 * nothing previously told a user when someone else had just changed it —
 * the "Live Updates" badge on this page was aspirational, not real. This
 * polls a cheap timestamp endpoint and shows a banner (not a forced
 * refresh) when it detects a change, so someone mid-assignment never has
 * their board yanked out from under them — they choose when to reload.
 *
 * Known limitation: this detects new/changed assignments via updatedAt,
 * but a pure removal (no other row touched) won't bump any timestamp, so a
 * same-moment delete-only change by someone else may not trigger the
 * banner. Good enough to catch the common case (someone is actively
 * staffing) without adding a separate change-log just for this.
 */
export function ScreamSessionFreshnessBanner({ sessionId, initialLatest }: { sessionId: string; initialLatest: string | null }) {
  const router = useRouter();
  const knownLatest = useRef(initialLatest);
  const [staleDetected, setStaleDetected] = useState(false);

  // Runs whenever the server hands us a new initialLatest — which happens
  // right after router.refresh() completes. Syncing here (rather than
  // guessing a value inside the click handler) is what keeps the banner
  // from reappearing immediately after the user just refreshed.
  useEffect(() => {
    knownLatest.current = initialLatest;
    setStaleDetected(false);
  }, [initialLatest]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/scream-session/last-updated?sessionId=${encodeURIComponent(sessionId)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        if (data.latest && data.latest !== knownLatest.current) {
          setStaleDetected(true);
        }
      } catch {
        // Silent — a missed poll just means a slightly later notice, not a
        // broken board. No need to surface network hiccups to the user.
      }
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sessionId]);

  if (!staleDetected) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
      <span>Someone else just changed this board. What you&rsquo;re seeing may be out of date.</span>
      <button className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-amber-400 bg-white px-3 text-sm font-black text-amber-900 hover:bg-amber-100" type="button" onClick={() => router.refresh()}>
        <RefreshCw className="h-4 w-4" />
        Refresh now
      </button>
    </div>
  );
}
