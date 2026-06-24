"use client";

import { useRef } from "react";

export function AutoSubmitForm({ children, className, action }: { children: React.ReactNode; className?: string; action?: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  function handleChange() {
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} method="get" action={action} onChange={handleChange} className={className}>
      {children}
    </form>
  );
}
