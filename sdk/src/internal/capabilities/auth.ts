import { EazoAuthClient } from "../auth-primitive";
import type { SessionToken, SocialConnection } from "../auth-primitive";

import type { AuthScope, User } from "../../types";
import {
  AUTH_CHANGED_EVENT,
  AUTH_LOGIN_CANCELLED_EVENT,
  AUTH_REQUEST_LOGIN,
  AUTH_REQUEST_LOGOUT,
  AUTH_REQUEST_PROFILE,
  AUTH_SCOPES_CHANGED_EVENT,
  BridgeErrorObject,
  isCapabilitySupported,
} from "../bridge/protocol";
import { getBridge, waitForBootstrap } from "../bootstrap";
import { __resetConfig, getAppId } from "../config";
import { setAuth, setLoginUI, setProfileConsentUI, store } from "../store";

const SESSION_STORAGE_KEY = "eazo.session";
const JWT_STORAGE_KEY = "eazo.jwt";

const VALID_SCOPES: readonly AuthScope[] = ["profile", "email", "phone"];

function normalizeScopes(input: unknown): AuthScope[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<AuthScope>();
  for (const raw of input) {
    if (typeof raw === "string" && (VALID_SCOPES as readonly string[]).includes(raw)) {
      seen.add(raw as AuthScope);
    }
  }
  return [...seen];
}

type AuthListener = (user: User | null) => void;

let authClient: EazoAuthClient | null = null;
const listeners = new Set<AuthListener>();

function getAuthClient(): EazoAuthClient {
  if (authClient) return authClient;
  const appId = getAppId();
  if (!appId) {
    throw new Error(
      "@eazo/sdk: app id not configured. Mount <EazoProvider appId={...}> at the root of your app.",
    );
  }
  authClient = new EazoAuthClient({ appId });
  return authClient;
}

function readLocalSession(): SessionToken | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionToken) : null;
  } catch {
    return null;
  }
}

function writeLocalSession(session: SessionToken | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

function readLocalJwt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(JWT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocalJwt(jwt: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (jwt) {
      window.localStorage.setItem(JWT_STORAGE_KEY, jwt);
    } else {
      window.localStorage.removeItem(JWT_STORAGE_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

function notifyListeners(user: User | null): void {
  for (const l of listeners) l(user);
}

async function fetchWebUserProfile(
  session: SessionToken,
): Promise<{ user: User; grantedScopes: AuthScope[] }> {
  // Profile endpoint is always app-local — never prefix with the platform base.
  const res = await fetch("/api/user/profile", {
    headers: { "x-eazo-session": JSON.stringify(session) },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch user profile: ${res.status}`);
  }
  const payload = (await res.json()) as Record<string, unknown>;
  // Accept both `{ ok: true, user: {...} }` (template convention) and a raw user object.
  const userPayload =
    payload && typeof payload === "object" && "user" in payload && payload.user
      ? (payload.user as Record<string, unknown>)
      : payload;
  return {
    user: normalizeUser(userPayload),
    grantedScopes: normalizeScopes(userPayload.grantedScopes),
  };
}

function normalizeUser(raw: Record<string, unknown>): User {
  return {
    id: String(raw.userId ?? raw.id ?? ""),
    email: (raw.email as string) ?? null,
    name: (raw.nickname as string) ?? (raw.name as string) ?? null,
    avatarUrl: (raw.avatarUrl as string) ?? null,
  };
}

let webSessionCache: SessionToken | null = null;

function storeCurrentWebSession(): SessionToken | null {
  if (webSessionCache) return webSessionCache;
  webSessionCache = readLocalSession();
  return webSessionCache;
}

async function bootstrapWeb(): Promise<void> {
  const session = storeCurrentWebSession();
  if (!session) {
    setAuth({ user: null, loading: false, authenticated: false, grantedScopes: [] });
    notifyListeners(null);
    return;
  }
  // Rehydrate the login JWT so `auth.requestProfile` can re-exchange a scoped
  // token after a page reload without forcing the user to log in again.
  const cachedJwt = readLocalJwt();
  if (cachedJwt) getAuthClient().setCachedJwt(cachedJwt);
  try {
    const { user, grantedScopes } = await fetchWebUserProfile(session);
    setAuth({ user, loading: false, authenticated: true, grantedScopes });
    notifyListeners(user);
  } catch {
    webSessionCache = null;
    writeLocalSession(null);
    writeLocalJwt(null);
    getAuthClient().setCachedJwt(null);
    setAuth({ user: null, loading: false, authenticated: false, grantedScopes: [] });
    notifyListeners(null);
  }
}

async function bootstrapFromHost(): Promise<boolean> {
  const hello = await waitForBootstrap();
  if (!hello) return false;
  setAuth({
    user: hello.session.user,
    loading: false,
    authenticated: hello.session.authenticated,
    grantedScopes: normalizeScopes(
      (hello.session as { grantedScopes?: unknown }).grantedScopes,
    ),
  });
  notifyListeners(hello.session.user);

  const bridge = getBridge();
  bridge?.on(AUTH_CHANGED_EVENT, (payload) => {
    const data = payload as {
      authenticated: boolean;
      user: User | null;
      token?: string | null;
      grantedScopes?: unknown;
    };
    setAuth({
      user: data.user,
      authenticated: data.authenticated,
      loading: false,
      grantedScopes: normalizeScopes(data.grantedScopes),
    });
    notifyListeners(data.user);
    if (data.authenticated && data.user && pendingLogin) {
      resolvePendingLogin(data.user);
    }
  });
  // Host may push a scopes-only update (e.g. after a native consent sheet)
  // without re-emitting the whole auth state.
  bridge?.on(AUTH_SCOPES_CHANGED_EVENT, (payload) => {
    const data = payload as { user?: User | null; grantedScopes?: unknown };
    const patch: Parameters<typeof setAuth>[0] = {
      grantedScopes: normalizeScopes(data.grantedScopes),
    };
    if (data.user) patch.user = data.user;
    setAuth(patch);
    if (data.user) notifyListeners(data.user);
  });
  bridge?.on(AUTH_LOGIN_CANCELLED_EVENT, () => {
    rejectPendingLogin(new BridgeErrorObject("DENIED", "user cancelled login"));
  });
  return true;
}

let bootstrapPromise: Promise<void> | null = null;

function ensureBootstrap(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const fromHost = await bootstrapFromHost();
    if (!fromHost) await bootstrapWeb();
  })();
  return bootstrapPromise;
}

/** Internal: trigger the auth bootstrap without reading a getter. */
export function _bootstrapAuth(): Promise<void> {
  return ensureBootstrap();
}

/**
 * Internal: called by the login UI / bridge event handler when the user
 * dismisses the login flow. Rejects the pending login() promise, if any.
 */
export function _cancelPendingLogin(reason: string): void {
  rejectPendingLogin(new Error(reason));
  setLoginUI({ open: false, submitting: false, error: null });
}

export function __resetAuthCapability(): void {
  bootstrapPromise = null;
  webSessionCache = null;
  listeners.clear();
  authClient = null;
  __resetConfig();
  if (pendingLogin) {
    pendingLogin.reject(new Error("SDK reset"));
    pendingLogin = null;
  }
  if (pendingLoginTimer) {
    clearTimeout(pendingLoginTimer);
    pendingLoginTimer = null;
  }
  if (pendingConsent) {
    pendingConsent.reject(new Error("SDK reset"));
    pendingConsent = null;
  }
}

export interface LoginOptions {
  /** Milliseconds to wait for the user to complete the flow before rejecting. Default: 5 min. */
  timeoutMs?: number;
}

const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

type PendingLogin = {
  promise: Promise<User>;
  resolve: (user: User) => void;
  reject: (err: Error) => void;
};

let pendingLogin: PendingLogin | null = null;
let pendingLoginTimer: ReturnType<typeof setTimeout> | null = null;

type PendingConsent = {
  scopes: AuthScope[];
  resolve: (user: User) => void;
  reject: (err: Error) => void;
};

let pendingConsent: PendingConsent | null = null;

function resolvePendingLogin(user: User): void {
  if (!pendingLogin) return;
  pendingLogin.resolve(user);
  pendingLogin = null;
  if (pendingLoginTimer) {
    clearTimeout(pendingLoginTimer);
    pendingLoginTimer = null;
  }
  setLoginUI({ open: false, submitting: false, error: null, step: "providers" });
}

function rejectPendingLogin(err: Error): void {
  if (!pendingLogin) return;
  pendingLogin.reject(err);
  pendingLogin = null;
  if (pendingLoginTimer) {
    clearTimeout(pendingLoginTimer);
    pendingLoginTimer = null;
  }
}

function createPendingLogin(timeoutMs: number): PendingLogin {
  let resolveFn!: (user: User) => void;
  let rejectFn!: (err: Error) => void;
  const promise = new Promise<User>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  const entry: PendingLogin = { promise, resolve: resolveFn, reject: rejectFn };
  pendingLoginTimer = setTimeout(() => {
    rejectPendingLogin(new BridgeErrorObject("TIMEOUT", "Login timed out"));
  }, timeoutMs);
  return entry;
}

async function requestLoginViaBridge(): Promise<boolean> {
  const bridge = getBridge();
  if (!bridge || !bridge.getStatus().ready) return false;
  try {
    await bridge.request(AUTH_REQUEST_LOGIN);
    return true;
  } catch (err) {
    if (err instanceof BridgeErrorObject && (err.code === "NOT_SUPPORTED" || err.code === "TIMEOUT")) {
      return false;
    }
    throw err;
  }
}

export const auth = {
  get user(): User | null {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().auth.user;
  },

  get loading(): boolean {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().auth.loading;
  },

  get authenticated(): boolean {
    return store.getSnapshot().auth.authenticated;
  },

  onChange(listener: AuthListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async getToken(): Promise<string | null> {
    await ensureBootstrap();
    const bridge = getBridge();
    if (bridge?.getStatus().ready) {
      try {
        const result = await bridge.request<{ token: string | null }>("auth.getToken");
        return result.token;
      } catch (err) {
        if (err instanceof BridgeErrorObject && (err.code === "NOT_SUPPORTED" || err.code === "TIMEOUT")) {
          /* fall through to web fallback */
        } else {
          throw err;
        }
      }
    }
    const session = storeCurrentWebSession();
    return session ? JSON.stringify(session) : null;
  },

  /** Web-only helper for request.ts: returns the raw session JSON for x-eazo-session. */
  async getSessionHeader(): Promise<string | null> {
    const bridge = getBridge();
    if (bridge?.getStatus().ready) {
      try {
        const result = await bridge.request<{ session: SessionToken | null }>(
          "auth.getSession",
        );
        return result.session ? JSON.stringify(result.session) : null;
      } catch (err) {
        if (!(err instanceof BridgeErrorObject)) throw err;
        if (err.code !== "NOT_SUPPORTED" && err.code !== "TIMEOUT") throw err;
      }
    }
    const session = storeCurrentWebSession();
    return session ? JSON.stringify(session) : null;
  },

  async loginWithSocial(provider: string): Promise<void> {
    const session = await getAuthClient().loginWithSocial(provider);
    await completeWebLogin(session);
  },

  async loginWithEmailPassword(email: string, password: string): Promise<void> {
    const session = await getAuthClient().loginWithEmailPassword(email, password);
    await completeWebLogin(session);
  },

  async loginWithEmailCode(email: string, code: string): Promise<void> {
    const session = await getAuthClient().loginWithEmailCode(email, code);
    await completeWebLogin(session);
  },

  sendEmailCode(email: string): Promise<void> {
    return getAuthClient().sendEmailCode(email);
  },

  fetchSocialConnections(): Promise<SocialConnection[]> {
    return getAuthClient().fetchSocialConnections();
  },

  /**
   * Sign the user out.
   *
   * Web: clears the SDK's local session and notifies listeners.
   * Mobile: delegates to the host via `auth.requestLogout`. The host owns
   *   identity — this call may surface a "not supported" message and
   *   leave state unchanged, or trigger a real logout that arrives back
   *   through `auth.changed`. The SDK never clears local state on the
   *   mobile path; the host is the source of truth.
   */
  async logout(): Promise<void> {
    const hello = await waitForBootstrap();
    const bridge = getBridge();
    if (
      hello &&
      isCapabilitySupported(hello.capabilities, AUTH_REQUEST_LOGOUT) &&
      bridge?.getStatus().ready
    ) {
      try {
        await bridge.request(AUTH_REQUEST_LOGOUT);
        return;
      } catch (err) {
        if (
          !(err instanceof BridgeErrorObject) ||
          (err.code !== "NOT_SUPPORTED" && err.code !== "TIMEOUT")
        ) {
          throw err;
        }
        // capability advertised but RPC failed — fall through to local clear
      }
    }
    webSessionCache = null;
    writeLocalSession(null);
    writeLocalJwt(null);
    getAuthClient().setCachedJwt(null);
    setAuth({ user: null, loading: false, authenticated: false });
    notifyListeners(null);
  },

  /**
   * Opens the login flow if needed and resolves with the current User.
   *
   * - Already authenticated → resolves immediately with `auth.user`.
   * - Host supports `auth.requestLogin` → delegates to the native host UI
   *   and resolves when `auth.changed` reports `authenticated: true`.
   * - Otherwise → shows the SDK's web LoginUI and resolves after a successful `loginWith*`.
   *
   * Rejects if the user cancels, the host returns an error, or the configured
   * timeout elapses (default 5 minutes).
   */
  async login(options: LoginOptions = {}): Promise<User> {
    await ensureBootstrap();
    const current = store.getSnapshot().auth.user;
    if (current) return current;

    if (pendingLogin) return pendingLogin.promise;

    const entry = createPendingLogin(options.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS);
    pendingLogin = entry;

    try {
      const nativeStarted = await requestLoginViaBridge();
      if (!nativeStarted) {
        setLoginUI({ open: true, step: "providers", error: null, submitting: false });
      }
    } catch (err) {
      rejectPendingLogin(err instanceof Error ? err : new Error(String(err)));
    }

    return entry.promise;
  },

  /** Imperative open of the SDK-owned login UI (web path). */
  showLogin(): void {
    setLoginUI({ open: true, step: "providers", error: null, submitting: false });
  },

  /** Imperative close. Rejects any pending `login()` promise with "user cancelled". */
  hideLogin(): void {
    _cancelPendingLogin("user closed login UI");
  },

  /** Reactive boolean: is the SDK-owned login UI currently open? */
  get loginUIOpen(): boolean {
    return store.getSnapshot().loginUI.open;
  },

  /** Scopes the user has granted this app (reactive). `[]` until consent. */
  get grantedScopes(): AuthScope[] {
    return store.getSnapshot().auth.grantedScopes;
  },

  /**
   * WeChat-style profile consent. By default an app only knows the user's
   * anonymous `id`; reading `name` / `avatarUrl` (scope `profile`) or `email`
   * (scope `email`) requires explicit consent.
   *
   * Behavior:
   * - Already-granted scopes resolve immediately with the current user.
   * - Mobile host that supports `auth.requestProfile` → delegates to the
   *   native consent sheet; the host returns the scoped user and pushes
   *   `auth.scopesChanged`.
   * - Web → opens the SDK consent popup; on Allow, re-exchanges a scoped
   *   session token (`consent: true`), refreshes `/api/user/profile`, and
   *   updates auth state.
   *
   * Rejects with a `DENIED` BridgeError if the user dismisses the popup.
   */
  async requestProfile(scopes: AuthScope[]): Promise<User> {
    await ensureBootstrap();
    const requested = normalizeScopes(scopes);
    const current = store.getSnapshot().auth;

    if (!current.user) {
      throw new BridgeErrorObject(
        "DENIED",
        "User must be logged in before requesting profile scopes.",
      );
    }
    if (requested.length === 0) return current.user;

    // Everything already granted → no popup.
    const missing = requested.filter((s) => !current.grantedScopes.includes(s));
    if (missing.length === 0) return current.user;

    // Mobile host path — native consent sheet owns the UX.
    const hello = await waitForBootstrap();
    const bridge = getBridge();
    if (
      hello &&
      isCapabilitySupported(hello.capabilities, AUTH_REQUEST_PROFILE) &&
      bridge?.getStatus().ready
    ) {
      try {
        const result = await bridge.request<{
          user: User | null;
          grantedScopes?: unknown;
        }>(AUTH_REQUEST_PROFILE, { scopes: requested });
        const granted = normalizeScopes(result.grantedScopes);
        const user = result.user ?? current.user;
        setAuth({ user, grantedScopes: granted });
        notifyListeners(user);
        return user;
      } catch (err) {
        if (
          err instanceof BridgeErrorObject &&
          (err.code === "NOT_SUPPORTED" || err.code === "TIMEOUT")
        ) {
          // capability advertised but unavailable — fall through to web popup
        } else {
          throw err;
        }
      }
    }

    // Web path — SDK-owned consent popup.
    if (pendingConsent) {
      throw new BridgeErrorObject(
        "DENIED",
        "Another profile-consent request is already in progress.",
      );
    }
    return new Promise<User>((resolve, reject) => {
      pendingConsent = { scopes: requested, resolve, reject };
      setProfileConsentUI({
        open: true,
        scopes: requested,
        submitting: false,
        error: null,
      });
    });
  },
};

async function completeWebLogin(session: SessionToken): Promise<void> {
  webSessionCache = session;
  writeLocalSession(session);
  // Persist the login JWT so a later requestProfile re-exchange survives reload.
  writeLocalJwt(getAuthClient().getCachedJwt());
  const { user, grantedScopes } = await fetchWebUserProfile(session);
  setAuth({ user, loading: false, authenticated: true, grantedScopes });
  notifyListeners(user);
  if (pendingLogin) resolvePendingLogin(user);
}

/**
 * Internal: called by the ProfileConsentUI when the user clicks "Allow".
 * Re-exchanges a scoped session token (with `consent: true`), refreshes the
 * local profile, updates auth state, and resolves the pending requestProfile.
 */
export async function _approveProfileConsent(): Promise<void> {
  const entry = pendingConsent;
  if (!entry) return;
  setProfileConsentUI({ submitting: true, error: null });
  try {
    const current = store.getSnapshot().auth;
    const union = normalizeScopes([...current.grantedScopes, ...entry.scopes]);
    const session = await getAuthClient().reexchangeWithScopes(union, true);
    webSessionCache = session;
    writeLocalSession(session);
    const { user, grantedScopes } = await fetchWebUserProfile(session);
    setAuth({ user, loading: false, authenticated: true, grantedScopes });
    notifyListeners(user);
    pendingConsent = null;
    setProfileConsentUI({
      open: false,
      submitting: false,
      error: null,
      scopes: [],
    });
    entry.resolve(user);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to grant profile access.";
    setProfileConsentUI({ submitting: false, error: message });
  }
}

/**
 * Internal: called by the ProfileConsentUI when the user dismisses the popup
 * (clicks "Not now" or closes it). Rejects the pending requestProfile with DENIED.
 */
export function _denyProfileConsent(_reason?: string): void {
  const entry = pendingConsent;
  pendingConsent = null;
  setProfileConsentUI({ open: false, submitting: false, error: null, scopes: [] });
  if (entry) {
    entry.reject(new BridgeErrorObject("DENIED", "User declined profile access."));
  }
}
