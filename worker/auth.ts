import { betterAuth } from 'better-auth';
import { AUTH_BASE_PATH, AUTH_HOSTS, CANONICAL_ORIGIN, CUSTOM_ORIGIN, authIsConfigured } from '../src/lib/access';
import { recordVisitForUserId } from './access-db';
import type { D1Database } from './d1';
import type { NotifyEnv } from './notify';

export type AuthEnv = NotifyEnv & {
  DB?: D1Database;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

export function authConfig(env: AuthEnv) {
  return authIsConfigured({
    database: Boolean(env.DB),
    secret: env.BETTER_AUTH_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
  });
}

type AuthHandler = {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (args: { headers: Headers }) => Promise<{
      user?: { email?: string | null; name?: string | null; image?: string | null };
      session?: { id?: string | null };
    } | null>;
  };
};

let cached: { db: D1Database; auth: AuthHandler } | null = null;

/**
 * Better Auth on D1 + Google. Returns null unless every secret is set, so a
 * missing client id cannot fall through to an open owner path.
 */
export function getAuth(env: AuthEnv) {
  if (!authConfig(env) || !env.DB) return null;
  if (cached && cached.db === env.DB) return cached.auth;
  const db = env.DB;
  const auth = betterAuth({
    appName: 'DJTube',
    database: db as never,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: {
      allowedHosts: [...AUTH_HOSTS],
      fallback: CANONICAL_ORIGIN,
      protocol: 'auto',
    },
    basePath: AUTH_BASE_PATH,
    trustedOrigins: [CANONICAL_ORIGIN, CUSTOM_ORIGIN, 'http://localhost:5173', 'http://localhost:8787'],
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
        prompt: 'select_account',
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      defaultCookieAttributes: { sameSite: 'lax' },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            try {
              await recordVisitForUserId(db, session.userId, session.id);
            } catch {
              // /api/me records the visit if this write did not land.
            }
          },
        },
      },
    },
    telemetry: { enabled: false },
  });
  cached = { db, auth };
  return auth;
}

export type SessionUser = {
  email: string;
  name: string | null;
  image: string | null;
  sessionId: string | null;
};

export async function readSession(request: Request, env: AuthEnv): Promise<SessionUser | null> {
  const auth = getAuth(env);
  if (!auth) return null;
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const user = session?.user;
    const email = user?.email;
    if (!user || !email) return null;
    return {
      email,
      name: user.name ?? null,
      image: user.image ?? null,
      sessionId: session?.session?.id ?? null,
    };
  } catch {
    return null;
  }
}
