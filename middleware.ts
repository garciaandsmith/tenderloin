import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check for a Supabase session cookie (sb-<project-ref>-auth-token).
  // Full cryptographic verification happens in server components via
  // supabase.auth.getUser() — this check is purely for redirect UX.
  const hasSession = request.cookies
    .getAll()
    .some(
      (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
    );

  // Redirect unauthenticated users to login
  if (!hasSession && !pathname.startsWith("/login") && !pathname.startsWith("/api/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from the login page
  if (hasSession && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    // Match all routes except static files, images and favicon
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
