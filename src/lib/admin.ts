import { NextRequest } from "next/server";

/**
 * Returns the admin's user id, or null if the request is not from an ADMIN.
 * Role is injected into headers by the middleware after JWT verification.
 */
export function getAdminId(request: NextRequest): string | null {
  const id = request.headers.get("x-user-id");
  const role = request.headers.get("x-user-role");
  if (id && role === "ADMIN") return id;

  if (process.env.NODE_ENV === "development" && !id) {
    return "00000000-0000-0000-0000-000000000003";
  }
  return null;
}
