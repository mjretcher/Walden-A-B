"use client";

/**
 * Wraps a form-submit button with a native confirm() prompt. Use this for
 * server actions where the blast radius is large and irreversible-feeling —
 * e.g. switching the globally active session, which instantly changes what
 * every signed-in user sees (search, outages, rosters, registration).
 *
 * The surrounding <form action={serverAction}> stays exactly as-is; only the
 * button itself needs to be a client component to intercept the click.
 */
export function ConfirmSubmitButton({
  confirmMessage,
  className,
  children
}: {
  confirmMessage: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={className}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
