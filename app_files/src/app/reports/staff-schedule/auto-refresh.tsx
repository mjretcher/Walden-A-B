"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const refreshMs = 3000;

export function StaffScheduleAutoRefresh() {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function refresh() {
      startTransition(() => {
        router.refresh();
      });
      setLastRefresh(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }));
    }

    // Immediate refresh on mount
    refresh();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, refreshMs);

    // Also refresh immediately when tab regains focus
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);

  return (
    <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-black text-forest-800">
      <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
      {lastRefresh ? `Live · updated ${lastRefresh}` : "Connecting…"}
    </span>
  );
}
