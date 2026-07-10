"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/**
 * The two shared live-data primitives, generalized from the two one-off
 * implementations that came before them (staff-schedule/auto-refresh.tsx
 * and scream-session-freshness-banner.tsx):
 *
 * - AutoLiveRefresh: silently re-fetches the page's server data on an
 *   interval while the tab is visible, and immediately on focus. For
 *   read-heavy views (dashboard, reports) where nobody is mid-edit and a
 *   refresh can never destroy anything.
 *
 * - StaleDataBanner: polls a cheap fingerprint endpoint and, when someone
 *   ELSE has changed the underlying data, shows a "refresh to see the
 *   latest" banner instead of forcing a refresh — so a board is never
 *   yanked out from under someone mid-assignment. For collaborative edit
 *   surfaces (bunk board, PreScream, outages, switches).
 *
 * router.refresh() re-renders server components but preserves client
 * component state, so even the banner's refresh button is safe to press
 * mid-flow in wizard-style pages.
 */

export function AutoLiveRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function refresh() {
      startTransition(() => router.refresh());
      setLastRefresh(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }));
    }

    // Mark the initial render as the first "refresh" — the data really is
    // that fresh, no need to immediately re-fetch what we just got.
    setLastRefresh(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }));

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);

    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return (
    <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-black text-forest-800">
      <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
      {lastRefresh ? `Live · updated ${lastRefresh}` : "Connecting…"}
    </span>
  );
}

export function StaleDataBanner({
  scope,
  sessionId,
  initialFingerprint,
  pollMs = 15000,
  message = "Someone else just changed this page. What you're seeing may be out of date."
}: {
  scope: string;
  sessionId: string;
  initialFingerprint: string;
  pollMs?: number;
  message?: string;
}) {
  const router = useRouter();
  const knownFingerprint = useRef(initialFingerprint);
  const [staleDetected, setStaleDetected] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Runs whenever the server hands us a new baseline — which happens right
  // after router.refresh() completes. Syncing here (rather than guessing a
  // value inside the click handler) is what keeps the banner from
  // reappearing immediately after the user just refreshed.
  useEffect(() => {
    knownFingerprint.current = initialFingerprint;
    setStaleDetected(false);
  }, [initialFingerprint]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/live/fingerprint?scope=${encodeURIComponent(scope)}&sessionId=${encodeURIComponent(sessionId)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        if (data.fingerprint && data.fingerprint !== knownFingerprint.current) {
          setStaleDetected(true);
        }
      } catch {
        // Silent — a missed poll just means a slightly later notice, not a
        // broken page. No need to surface network hiccups to the user.
      }
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [scope, sessionId, pollMs]);

  if (!staleDetected) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
      <span>{message}</span>
      <button
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-amber-400 bg-white px-3 text-sm font-black text-amber-900 hover:bg-amber-100"
        type="button"
        onClick={() => startTransition(() => router.refresh())}
      >
        <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        Refresh now
      </button>
    </div>
  );
}
