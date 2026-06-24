import { AlertCircle, Eye, LockKeyhole, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { CampWaldenLogo, PineWaveMark } from "@/components/brand";
import { inputClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const params = await searchParams;

  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfdfb] text-slate-950">
      <header className="relative z-10 border-b border-white/10 bg-[radial-gradient(circle_at_20%_0%,#0d6b42_0%,#052f22_55%,#04271d_100%)] text-white shadow-sm">
        <div className="mx-auto flex h-[88px] max-w-[1500px] items-center justify-between px-6 md:px-10">
          <div className="flex items-center gap-6">
            <CampWaldenLogo subtitle="" />
            <span className="hidden h-9 w-px bg-white/20 md:block" />
            <p className="hidden text-lg font-black uppercase tracking-[0.12em] text-forest-100/70 md:block">A/B Operations</p>
          </div>
          <div className="hidden items-center gap-2 text-sm font-black md:flex">
            <ShieldCheck className="h-5 w-5 text-forest-100" />
            Secure Operations System
          </div>
        </div>
      </header>

      <section className="walden-topography walden-lake-line relative grid min-h-[calc(100vh-88px)] place-items-center px-4 py-10">
        <div className="w-full max-w-[575px] rounded-2xl border border-slate-200/80 bg-white p-8 shadow-[0_22px_70px_rgba(15,33,25,0.18)] md:p-9">
          <div className="text-center">
            <div className="mx-auto grid h-24 w-24 place-items-center">
              <PineWaveMark className="h-24 w-24" mode="dark" />
            </div>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-forest-900">Camp Walden</h1>
            <p className="mt-2 text-lg font-black uppercase tracking-[0.16em] text-lake-600">A/B Operations</p>
            <div className="mx-auto mt-7 flex max-w-sm items-center gap-5">
              <span className="h-px flex-1 bg-forest-900/25" />
              <PineWaveMark className="h-6 w-7" mode="dark" />
              <span className="h-px flex-1 bg-forest-900/25" />
            </div>
          </div>

          {params?.error ? (
            <div className="mt-7 flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                {params.error === "ratelimit" ? (
                  <>
                    <p className="font-black">Too many login attempts.</p>
                    <p className="mt-0.5 font-medium">Wait about 15 minutes and try again. If you&rsquo;re locked out and need access urgently, contact an administrator.</p>
                  </>
                ) : (
                  <>
                    <p className="font-black">Invalid email or password.</p>
                    <p className="mt-0.5 font-medium">Please try again or contact an administrator.</p>
                  </>
                )}
              </div>
            </div>
          ) : null}

          <form action="/api/auth/login" method="post" className="mt-7 grid gap-5">
            <label className="grid gap-2 text-sm font-black text-slate-800">
              Email
              <input className={`${inputClass} min-h-12 text-base`} name="email" type="email" autoComplete="email" placeholder="Enter your email address" required />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-800">
              Password
              <span className="relative">
                <input className={`${inputClass} min-h-12 w-full pr-11 text-base`} name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required />
                <Eye className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              </span>
            </label>
            <button className="inline-flex min-h-14 items-center justify-center gap-3 rounded-lg bg-forest-900 px-5 py-3 text-lg font-black text-white shadow-sm transition hover:bg-forest-800" type="submit">
              <LockKeyhole className="h-5 w-5" />
              Sign in
            </button>
          </form>

          <div className="mx-auto mt-8 flex max-w-sm items-center gap-5">
            <span className="h-px flex-1 bg-forest-900/25" />
            <ShieldCheck className="h-6 w-6 text-forest-700" />
            <span className="h-px flex-1 bg-forest-900/25" />
          </div>
          <p className="mt-4 text-center text-sm font-medium leading-6 text-slate-600">
            Your session is encrypted and monitored for security.<br />
            Authorized personnel only.
          </p>
        </div>
      </section>
    </main>
  );
}
