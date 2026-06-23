import { NextRequest, NextResponse } from "next/server";

const TOKEN_COOKIE = "vision7_crm_token";

/**
 * Edge guard: if there is no `vision7_crm_token` cookie (mirrored from
 * localStorage on login/logout by lib/auth/token.ts), redirect to /login.
 * The auth-provider re-validates and enforces capability admission client-side;
 * the backend enforces auth on every request. This is a first-line UX gate only.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public: the login page itself.
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return NextResponse.next();
  }

  const hasToken = Boolean(req.cookies.get(TOKEN_COOKIE)?.value);
  if (!hasToken) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals, the API proxy, and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2|ttf)$).*)",
  ],
};
