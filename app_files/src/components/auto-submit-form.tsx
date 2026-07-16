"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * A filter form that re-runs the page on every change (checkbox toggle,
 * date pick, etc.) without a hard browser navigation.
 *
 * The previous version called `formRef.current?.requestSubmit()` on a
 * plain `<form method="get">` — with no onSubmit handler, that's a real
 * browser-native GET navigation (full document reload), which is what was
 * making every filter click on Rosters/Cards/Waitlists feel jumpy and jump
 * the scroll position back to the top of the page. Building the query
 * string ourselves and pushing it through the Next.js router with
 * `scroll: false` keeps this a soft client-side transition (server
 * component re-renders with the new searchParams) and leaves the
 * person's scroll position exactly where it was.
 */
export function AutoSubmitForm({ children, className, action }: { children: React.ReactNode; className?: string; action?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function navigate() {
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value === "string") params.append(key, value);
    }
    const path = action ?? window.location.pathname;
    router.replace(`${path}?${params.toString()}`, { scroll: false });
  }

  return (
    <form
      ref={formRef}
      action={action}
      onChange={navigate}
      onSubmit={(event) => {
        event.preventDefault();
        navigate();
      }}
      className={className}
    >
      {children}
    </form>
  );
}
