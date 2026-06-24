import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "./lib/auth";

// Routes that require authentication
const protectedRoutes = ["/api/v1/student", "/api/v1/teacher", "/api/v1/settings", "/student", "/teacher"];

// Routes specific to teachers
const teacherRoutes = ["/api/v1/teacher", "/api/v1/settings", "/teacher"];

// Routes specific to students
const studentRoutes = ["/api/v1/student", "/student"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if route is protected
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  console.log(`[middleware] path=${pathname} NODE_ENV=${process.env.NODE_ENV}`);

  if (process.env.NODE_ENV === "development") {
    // Inject dev user headers so API routes have user context
    const devHeaders = new Headers(request.headers);
    if (!devHeaders.has("x-user-id")) {
      // Determine role from the path being accessed
      const isTeacherPath = teacherRoutes.some((r) => pathname.startsWith(r));
      devHeaders.set("x-user-id", isTeacherPath ? "00000000-0000-0000-0000-000000000001" : "00000000-0000-0000-0000-000000000002");
      devHeaders.set("x-user-role", isTeacherPath ? "TEACHER" : "STUDENT");
    }
    console.log(`[middleware] dev bypass: x-user-id=${devHeaders.get("x-user-id")}`);
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

    if (payload.boundIp !== "unknown" && clientIp !== "unknown" && payload.boundIp !== clientIp) {
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

  if (isTeacherPath && payload.role !== "TEACHER") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "FORBIDDEN", message: "Teacher access required" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/student/exams", request.url));
  }

  if (isStudentRoute && payload.role !== "STUDENT") {
    if (pathname.startsWith("/api/")) {
       return NextResponse.json({ error: "FORBIDDEN", message: "Student access required" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/teacher", request.url));
  }

  // Pass user context to headers for API routes if needed
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", payload.userId);
  requestHeaders.set("x-user-role", payload.role);

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
