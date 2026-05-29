import { NextRequest, NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const user = await loginWithPassword(email, password);

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=1", request.url));
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
