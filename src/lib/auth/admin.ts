import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type AdminSession = {
  role: "ADMIN";
  username: string;
};

const ADMIN_USERNAME = process.env.ROBOOPS_ADMIN_USERNAME || "ROBOOPS_ADMIN";
const ADMIN_PASSWORD_ENV = "ROBOOPS_ADMIN_PASSWORD";
const COOKIE_NAME = "roboops_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

type SessionPayload = AdminSession & {
  exp: number;
};

export function adminUsername() {
  return ADMIN_USERNAME;
}

export function isAdminConfigured() {
  return Boolean(process.env[ADMIN_PASSWORD_ENV]);
}

export function adminPasswordVariableName() {
  return ADMIN_PASSWORD_ENV;
}

export function verifyAdminCredentials(username: string, password: string) {
  const configuredPassword = process.env[ADMIN_PASSWORD_ENV];
  if (!configuredPassword) return false;
  if (username.trim().toUpperCase() !== ADMIN_USERNAME.toUpperCase()) return false;
  return secureEqual(password, configuredPassword);
}

export async function createAdminSession(username = ADMIN_USERNAME) {
  const cookieStore = await cookies();
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  cookieStore.set(COOKIE_NAME, signPayload({ username, role: "ADMIN", exp: expires }), {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return {
    username: payload.username,
    role: payload.role,
  };
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (session) return session;
  redirect("/login");
}

function signPayload(payload: SessionPayload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", sessionSecret()).update(encoded).digest("base64url");
  if (!secureEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (payload.role !== "ADMIN") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function sessionSecret() {
  return process.env.ROBOOPS_SESSION_SECRET || process.env[ADMIN_PASSWORD_ENV] || "local-dev-session-secret";
}

function secureEqual(left: string, right: string) {
  const leftHash = crypto.createHash("sha256").update(left).digest();
  const rightHash = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}
