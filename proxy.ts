import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, safeEqual, sessionToken } from "@/lib/auth";

// Password-protects the whole site when DASHBOARD_PASSWORD is set. Visitors sign in once on
// /login and get a long-lived session cookie (home-screen web apps on iPhone don't handle the
// browser's Basic-auth pop-up well). Basic auth is still accepted, e.g. for scripts.
// The briefing cron route checks CRON_SECRET itself and writes at most one briefing a day.
const PUBLIC = ["/login", "/manifest.webmanifest", "/icon", "/apple-icon", "/icons", "/api/briefing/cron"];

export async function proxy(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  // Icons are public (iOS fetches them without the session cookie): /icon.png, /apple-icon.png, /icons/*.
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}.`))) return NextResponse.next();

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && safeEqual(cookie, await sessionToken(password))) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    if (safeEqual(decoded.slice(decoded.indexOf(":") + 1), password)) return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
