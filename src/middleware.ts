import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "./lib/auth";

// Routes that require authentication
const protectedRoutes = ["/api/v1/student", "/api/v1/teacher", "/api/v1/admin", "/api/v1/settings", "/student", "/teacher", "/admin"];

// Routes specific to teachers
const teacherRoutes = ["/api/v1/teacher", "/teacher"];

// Routes specific to admins
const adminRoutes = ["/api/v1/admin", "/admin"];

// Routes specific to students
const studentRoutes = ["/api/v1/student", "/student"];

/**
 * Returns true if two IPs are on the same /24 (IPv4) or same /48 (IPv6) subnet,
 * or if they are identical. This tolerates minor DHCP/NAT IP changes within the
 * same local network while still blocking access from a completely different network.
 */
function ipSubnetMatch(bound: string, current: string): boolean {
  if (bound === current) return true;
  // IPv4: compare first 3 octets (a.b.c.*)
  const v4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  if (v4.test(bound) && v4.test(current)) {
    return bound.split(".").slice(0, 3).join(".") === current.split(".").slice(0, 3).join(".");
  }
  // IPv6: compare first 6 groups (covers /48 prefix)
  const normalise = (ip: string) => ip.toLowerCase().replace(/::$/, "");
  return normalise(bound).split(":").slice(0, 6).join(":") === normalise(current).split(":").slice(0, 6).join(":");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if route is protected
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );


  if (process.env.NODE_ENV === "development") {
    if (process.env.NODE_ENV === ("production" as string)) {
      throw new Error("SECURITY: Dev auth bypass must never run in production.");
    }
    // Inject dev user headers so API routes have user context
    const devHeaders = new Headers(request.headers);
    if (!devHeaders.has("x-user-id")) {
      const isTeacherPath = teacherRoutes.some((r) => pathname.startsWith(r));
      const isAdminPath = adminRoutes.some((r) => pathname.startsWith(r));
      devHeaders.set(
        "x-user-id",
        isAdminPath
          ? "00000000-0000-0000-0000-000000000003"
          : isTeacherPath
          ? "00000000-0000-0000-0000-000000000001"
          : "00000000-0000-0000-0000-000000000002"
      );
      devHeaders.set("x-user-role", isAdminPath ? "ADMIN" : isTeacherPath ? "TEACHER" : "STUDENT");
    }
    return NextResponse.next({
      request: { headers: devHeaders },
    });
  }

  if (!isProtected) {
  return NextResponse.next();
}

  // Get token from header or cookies
  const authHeader = request.headers.get("authorization");
  let token = "";

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else {
    // Check cookies (for page requests)
    const cookieToken = request.cookies.get("session")?.value;
    if (cookieToken) {
      token = cookieToken;
    }
  }

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Authentication required" },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verify token
  const payload = await verifyToken(token);
  if (!payload) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Invalid or expired token" },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check IP binding (RSD Section 3.2) — students only.
  // Teachers manage the system from varying networks; IP binding is an exam anti-cheat
  // measure and must not block teacher dashboard or API operations.
  const isTeacherPath = teacherRoutes.some((r) => pathname.startsWith(r));

  if (!isTeacherPath) {
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    if (payload.boundIp !== "unknown" && clientIp !== "unknown" && !ipSubnetMatch(payload.boundIp, clientIp)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            error: "ACCESS_DENIED",
            message: "Session mismatch detected. Your IP address does not match your active session.",
          },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/login?error=ip_mismatch", request.url));
    }
  }

  // Role-based access control
  const isStudentRoute = studentRoutes.some((route) => pathname.startsWith(route));
  const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

  const homeFor = (role: string) =>
    role === "ADMIN" ? "/admin" : role === "TEACHER" ? "/teacher" : "/student/exams";

  if (isAdminRoute && payload.role !== "ADMIN") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required" }, { status: 403 });
    }
    return NextResponse.redirect(new URL(homeFor(payload.role), request.url));
  }

  // Admins have full access to the teacher panel (exam management, monitors,
  // workspace administration) per the v9 access matrix
  if (isTeacherPath && payload.role !== "TEACHER" && payload.role !== "ADMIN") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Teacher access required" }, { status: 403 });
    }
    return NextResponse.redirect(new URL(homeFor(payload.role), request.url));
  }

  if (isStudentRoute && payload.role !== "STUDENT") {
    if (pathname.startsWith("/api/")) {
       return NextResponse.json({ error: "FORBIDDEN", message: "Student access required" }, { status: 403 });
    }
    return NextResponse.redirect(new URL(homeFor(payload.role), request.url));
  }

  // Pass user context to headers for API routes if needed
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", payload.userId);
  requestHeaders.set("x-user-role", payload.role);

  // Admin URLs for exam management/monitoring are served by the teacher route
  // tree (admins pass through with global scope) so the URL stays under /admin
  if (payload.role === "ADMIN") {
    let rewritePath: string | null = null;
    if (pathname === "/admin/exams") rewritePath = "/teacher";
    else if (pathname.startsWith("/admin/exams/")) {
      rewritePath = "/teacher/exams/" + pathname.slice("/admin/exams/".length);
    } else if (pathname === "/admin/sessions" || pathname.startsWith("/admin/sessions/")) {
      rewritePath = pathname.replace("/admin/sessions", "/teacher/sessions");
    }
    if (rewritePath) {
      const url = request.nextUrl.clone();
      url.pathname = rewritePath;
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - login (auth pages)
     */
    "/((?!_next/static|_next/image|favicon.ico|login|api/v1/auth).*)",
  ],
};
