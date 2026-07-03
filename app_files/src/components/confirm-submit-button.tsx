"use client";

import { useFormStatus } from "react-dom";

/**
 * Wraps a form-submit button with a native confirm() prompt AND disables
 * itself (via useFormStatus) once the form is actually submitting. Use this
 * for server actions where the blast radius is large and irreversible-
 * feeling — e.g. switching the globally active session, which instantly
 * changes what every signed-in user sees (search, outages, rosters,
 * registration).
 *
 * The surrounding <form action={serverAction}> stays exactly as-is; only the
 * button itself needs to be a client component to intercept the click and
 * read pending status.
 */
export function ConfirmSubmitButton({
  confirmMessage,
  className,
  pendingLabel = "Working…",
  children
}: {
  confirmMessage: string;
  className?: string;
  pendingLabel?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * Same pending-disable behavior as ConfirmSubmitButton, without the confirm
 * prompt — for actions that are one-time-guarded server-side (like the
 * session copy actions) but don't need an "are you sure" dialog. Prevents a
 * double-click / slow-wifi double-submit race on actions that create data.
 */
export function SubmitButton({
  className,
  pendingLabel = "Working…",
  children
}: {
  className?: string;
  pendingLabel?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
