"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, safeEqual, sessionToken } from "@/lib/auth";

export async function signIn(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const password = process.env.DASHBOARD_PASSWORD;
  const next = String(form.get("next") ?? "/");
  // Only same-site paths, never an absolute URL.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!password) redirect(target);
  if (!safeEqual(String(form.get("password") ?? ""), password)) return { error: "Wrong password." };
  (await cookies()).set(AUTH_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(target);
}
