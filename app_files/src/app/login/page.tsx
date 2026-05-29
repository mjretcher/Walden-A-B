import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { buttonClass, inputClass } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="w-full max-w-md rounded-lg border border-white/70 bg-white p-8 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-wide text-lake-700">Camp Walden</p>
        <h1 className="mt-2 text-3xl font-bold text-forest-900">A/B Operations</h1>
        <p className="mt-2 text-sm text-slate-500">Sign in to manage registration, rosters, staffing, and switch workflows.</p>

        {params?.error ? (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            Email or password did not match an active user.
          </div>
        ) : null}

        <form action="/api/auth/login" method="post" className="mt-6 grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Email
            <input className={inputClass} name="email" type="email" defaultValue="admin@campwalden.local" required />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Password
            <input className={inputClass} name="password" type="password" defaultValue="walden2025!" required />
          </label>
          <button className={buttonClass} type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}
