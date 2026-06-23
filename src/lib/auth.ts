import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

const SALT_ROUNDS = 12;

// ── Password utilities ─────────────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Password complexity enforcement (RSD Section 2.2) ──────────────────────────
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;

export function validatePasswordComplexity(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (password.length < 8) errors.push("Minimum 8 characters required");
  if (password.length > 128) errors.push("Maximum 128 characters allowed");
  if (!/[a-z]/.test(password))
    errors.push("At least one lowercase letter required");
  if (!/[A-Z]/.test(password))
    errors.push("At least one uppercase letter required");
  if (!/\d/.test(password)) errors.push("At least one digit required");
  if (!/[@$!%*?&]/.test(password))
    errors.push("At least one special character (@$!%*?&) required");

  return {
    valid: PASSWORD_REGEX.test(password),
    errors,
  };
}

// ── JWT utilities ──────────────────────────────────────────────────────────────
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-change-me"
);

export interface TokenPayload {
  userId: string;
  username: string;
  role: "TEACHER" | "STUDENT";
  boundIp: string;
}

export async function generateToken(payload: TokenPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(JWT_SECRET);
}

export async function verifyToken(
  token: string
): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

// ── Temporary password generator ───────────────────────────────────────────────
export function generateTemporaryPassword(): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "@$!%*?&";
  const all = upper + lower + digits + special;

  let password = "";
  // Ensure at least one from each category
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill remaining 8 chars
  for (let i = 0; i < 8; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}
