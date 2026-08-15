import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "../reporting/prisma";

export type UserRole = "SUPER_ADMIN" | "PLANT_USER";

export type AppSession = {
  email?: string;
  name: string;
  plantCode?: string;
  role: UserRole;
  userId?: string;
  username: string;
};

export type PlantUserSummary = {
  accessId?: string;
  assignedAt?: string;
  email?: string;
  isActive: boolean;
  name?: string;
  plantCode: string;
  role?: UserRole;
  userId?: string;
};

const ADMIN_USERNAME = process.env.ROBOOPS_ADMIN_USERNAME || "ROBOOPS";
const ADMIN_PASSWORD_ENV = "ROBOOPS_ADMIN_PASSWORD";
const ADMIN_EMAIL = process.env.ROBOOPS_ADMIN_EMAIL || "roboops@robo.local";
const COOKIE_NAME = "roboops_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

type SessionPayload = {
  exp: number;
  role: UserRole;
  sub?: string;
  username: string;
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

export async function authenticateCredentials(identifier: string, password: string): Promise<AppSession | null> {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier || !password) return null;

  const configuredPassword = process.env[ADMIN_PASSWORD_ENV];
  const isBootstrapAdmin =
    configuredPassword &&
    [ADMIN_USERNAME.toLowerCase(), ADMIN_EMAIL.toLowerCase()].includes(normalizedIdentifier.toLowerCase()) &&
    secureEqual(password, configuredPassword);

  if (isBootstrapAdmin) {
    return ensureSuperAdminUser();
  }

  const prisma = getPrisma();
  if (!prisma) return null;

  const user = await prisma.appUser.findFirst({
    where: {
      isActive: true,
      OR: [
        { email: normalizedIdentifier.toLowerCase() },
        { username: normalizedIdentifier.toUpperCase() },
      ],
    },
    include: { plantAccesses: { orderBy: { assignedAt: "desc" }, where: { isActive: true }, take: 1 } },
  });
  if (!user || !verifyPassword(password, user.passwordHash)) return null;

  if (user.role === "PLANT_USER") {
    const access = user.plantAccesses[0];
    if (!access) return null;
    return {
      email: user.email,
      name: user.name,
      plantCode: access.plantCode,
      role: "PLANT_USER",
      userId: user.id,
      username: user.email,
    };
  }

  return {
    email: user.email,
    name: user.name,
    role: "SUPER_ADMIN",
    userId: user.id,
    username: user.username || user.email,
  };
}

export async function createAdminSession(session: AppSession | string = ADMIN_USERNAME) {
  const resolved = typeof session === "string"
    ? { name: session, role: "SUPER_ADMIN" as const, username: session }
    : session;
  const cookieStore = await cookies();
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  cookieStore.set(COOKIE_NAME, signPayload({
    exp: expires,
    role: resolved.role,
    sub: resolved.userId,
    username: resolved.username,
  }), {
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

export async function getAdminSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;

  const prisma = getPrisma();
  if (!prisma) {
    if (payload.role !== "SUPER_ADMIN") return null;
    return {
      name: payload.username,
      role: "SUPER_ADMIN",
      username: payload.username,
    };
  }

  if (payload.sub) {
    const user = await prisma.appUser.findUnique({
      where: { id: payload.sub },
      include: { plantAccesses: { orderBy: { assignedAt: "desc" }, where: { isActive: true }, take: 1 } },
    });
    if (!user?.isActive) return null;
    if (user.role === "PLANT_USER") {
      const access = user.plantAccesses[0];
      if (!access) return null;
      return {
        email: user.email,
        name: user.name,
        plantCode: access.plantCode,
        role: "PLANT_USER",
        userId: user.id,
        username: user.email,
      };
    }
    return {
      email: user.email,
      name: user.name,
      role: "SUPER_ADMIN",
      userId: user.id,
      username: user.username || user.email,
    };
  }

  if (payload.role === "SUPER_ADMIN" && payload.username.toUpperCase() === ADMIN_USERNAME.toUpperCase()) {
    return ensureSuperAdminUser();
  }

  return null;
}

export async function requireAdminSession(returnTo = "/operations"): Promise<AppSession> {
  const session = await getAdminSession();
  if (session) return session;
  redirect(`/login?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`);
}

export async function requireSuperAdminSession(): Promise<AppSession> {
  const session = await requireAdminSession();
  if (session.role === "SUPER_ADMIN") return session;
  throw new Error("Super admin access is required.");
}

export function canAccessPlant(session: AppSession, plantCode: string) {
  return session.role === "SUPER_ADMIN" || session.plantCode === plantCode;
}

export function enforcePlantAccess(session: AppSession, plantCode: string) {
  if (canAccessPlant(session, plantCode)) return;
  throw new Error(`Access denied for plant ${plantCode}.`);
}

export function allowedPlantCodes(session: AppSession) {
  return session.role === "PLANT_USER" && session.plantCode ? [session.plantCode] : undefined;
}

export async function listPlantUsers(): Promise<PlantUserSummary[]> {
  const prisma = getPrisma();
  if (!prisma) return [];

  const activeAccesses = await prisma.plantAccess.findMany({
    where: { isActive: true },
    include: { user: true },
    orderBy: { plantCode: "asc" },
  });

  return activeAccesses.map((access) => ({
    accessId: access.id,
    assignedAt: access.assignedAt.toISOString(),
    email: access.user.email,
    isActive: access.user.isActive && access.isActive,
    name: access.user.name,
    plantCode: access.plantCode,
    role: access.user.role as UserRole,
    userId: access.userId,
  }));
}

export async function assignPlantUser(input: {
  actor: AppSession;
  email: string;
  name: string;
  plantCode: string;
}) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database is required for plant user management.");
  if (input.actor.role !== "SUPER_ADMIN") throw new Error("Super admin access is required.");

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const plantCode = input.plantCode.trim().toUpperCase();
  if (!email || !name || !plantCode) throw new Error("Name, email and plant are required.");

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = hashPassword(temporaryPassword);

  return prisma.$transaction(async (tx) => {
    const user = await tx.appUser.upsert({
      where: { email },
      update: {
        isActive: true,
        name,
        passwordHash,
        role: "PLANT_USER",
        username: null,
      },
      create: {
        email,
        isActive: true,
        name,
        passwordHash,
        role: "PLANT_USER",
      },
    });

    await tx.plantAccess.updateMany({
      where: {
        isActive: true,
        OR: [
          { plantCode },
          { userId: user.id },
        ],
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedById: input.actor.userId,
      },
    });

    const access = await tx.plantAccess.create({
      data: {
        assignedById: input.actor.userId,
        plantCode,
        userId: user.id,
      },
    });

    await tx.accessAuditLog.create({
      data: {
        action: "PLANT_ACCESS_ASSIGNED",
        actorUserId: input.actor.userId,
        plantCode,
        summary: `${input.actor.username} assigned ${email} to ${plantCode}.`,
        targetUserId: user.id,
      },
    });

    return {
      access: {
        accessId: access.id,
        assignedAt: access.assignedAt.toISOString(),
        email: user.email,
        isActive: true,
        name: user.name,
        plantCode,
        role: "PLANT_USER" as const,
        userId: user.id,
      },
      temporaryPassword,
    };
  });
}

export async function revokePlantUser(input: {
  accessId: string;
  actor: AppSession;
}) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database is required for plant user management.");
  if (input.actor.role !== "SUPER_ADMIN") throw new Error("Super admin access is required.");

  return prisma.$transaction(async (tx) => {
    const access = await tx.plantAccess.findUnique({
      where: { id: input.accessId },
      include: { user: true },
    });
    if (!access) throw new Error("Plant access assignment was not found.");

    await tx.plantAccess.update({
      where: { id: access.id },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedById: input.actor.userId,
      },
    });
    await tx.appUser.update({
      where: { id: access.userId },
      data: { isActive: false },
    });
    await tx.accessAuditLog.create({
      data: {
        action: "PLANT_ACCESS_REVOKED",
        actorUserId: input.actor.userId,
        plantCode: access.plantCode,
        summary: `${input.actor.username} revoked ${access.user.email} from ${access.plantCode}.`,
        targetUserId: access.userId,
      },
    });

    return { plantCode: access.plantCode, userId: access.userId };
  });
}

export async function changeOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
  session: AppSession;
}) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database is required for password changes.");
  if (!input.session.userId) throw new Error("Current session cannot change password.");
  if (input.newPassword.length < 8) throw new Error("New password must be at least 8 characters.");

  const user = await prisma.appUser.findUnique({ where: { id: input.session.userId } });
  if (!user?.isActive) throw new Error("User account is not active.");
  if (!verifyPassword(input.currentPassword, user.passwordHash)) throw new Error("Current password is incorrect.");

  await prisma.appUser.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(input.newPassword) },
  });
  await prisma.accessAuditLog.create({
    data: {
      action: "PASSWORD_CHANGED",
      actorUserId: user.id,
      summary: `${user.email} changed password.`,
      targetUserId: user.id,
    },
  });
}

async function ensureSuperAdminUser(): Promise<AppSession> {
  const prisma = getPrisma();
  if (!prisma) {
    return {
      email: ADMIN_EMAIL,
      name: "ROBOOPS",
      role: "SUPER_ADMIN",
      username: ADMIN_USERNAME,
    };
  }

  const configuredPassword = process.env[ADMIN_PASSWORD_ENV] || crypto.randomBytes(18).toString("base64url");
  const user = await prisma.appUser.upsert({
    where: { email: ADMIN_EMAIL.toLowerCase() },
    update: {
      isActive: true,
      name: "ROBOOPS",
      passwordHash: hashPassword(configuredPassword),
      role: "SUPER_ADMIN",
      username: ADMIN_USERNAME,
    },
    create: {
      email: ADMIN_EMAIL.toLowerCase(),
      isActive: true,
      name: "ROBOOPS",
      passwordHash: hashPassword(configuredPassword),
      role: "SUPER_ADMIN",
      username: ADMIN_USERNAME,
    },
  });

  return {
    email: user.email,
    name: user.name,
    role: "SUPER_ADMIN",
    userId: user.id,
    username: user.username || ADMIN_USERNAME,
  };
}

function generateTemporaryPassword() {
  return `Robo-${crypto.randomBytes(5).toString("base64url")}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, passwordHash: string) {
  const [method, salt, expected] = passwordHash.split("$");
  if (method !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("base64url");
  return secureEqual(actual, expected);
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
    if (payload.role !== "SUPER_ADMIN" && payload.role !== "PLANT_USER") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function sessionSecret() {
  return process.env.ROBOOPS_SESSION_SECRET || process.env[ADMIN_PASSWORD_ENV] || "local-dev-session-secret";
}

function safeRelativeReturnPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/operations";
  try {
    const url = new URL(value, "https://robo.rdcc.ai");
    if (url.origin !== "https://robo.rdcc.ai") return "/operations";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/operations";
  }
}

function secureEqual(left: string, right: string) {
  const leftHash = crypto.createHash("sha256").update(left).digest();
  const rightHash = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}
