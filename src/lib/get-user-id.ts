/**
 * Extracts the authenticated user ID from the request.
 * In development, falls back to a default dev identity if no header is present.
 */
export function getUserId(
  request: { headers: { get(name: string): string | null } },
  fallbackRole: "teacher" | "student" = "student"
): string | null {
  const id = request.headers.get("x-user-id");
  if (id) return id;

  if (process.env.NODE_ENV === "development") {
    return fallbackRole === "teacher" ? "00000000-0000-0000-0000-000000000001" : "00000000-0000-0000-0000-000000000002";
  }

  return null;
}
