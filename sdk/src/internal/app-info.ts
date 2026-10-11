import { getPlatformApiBase } from "./config";

/**
 * Per-caller flags returned alongside `PublicAppInfo`. Always present
 * (`isOwner: false` for anonymous callers). Extend with more
 * viewer-specific bits as needed; mirrors `PublicAppViewerDto` on the
 * backend.
 */
export interface PublicAppViewer {
  /**
   * True when the request carried a valid JWT and the authenticated
   * user owns this app.
   */
  isOwner: boolean;
}

/**
 * App entity fields safe to expose publicly. Mirrors `PublicAppDataDto`
 * on the backend.
 */
export interface PublicAppData {
  id: string;
  name: string;
  shortTitle?: string;
  /** One-line tagline next to the app name. Sourced from CreatorApp.tagline. */
  tagline?: string;
  /** Long-form description. Sourced from App.description. */
  description?: string;
  /**
   * App logo — emoji glyph or image URL. Sourced from CreatorApp.icon.
   * Distinct from `coverUrl` (the large banner image).
   */
  icon?: string;
  /** Large cover / banner image URL. Sourced from App.coverUrl. */
  coverUrl?: string;
  category: string[];
  slug: string;
  region?: string;
  showType: string;
  url?: string;
  likeNum: number;
  uv: number;
  commentsCount: number;
  /**
   * True when the app author opted in to share anonymized usage data.
   * Gates whether `memory.reportAction` reports user actions to Gum.
   */
  sendAnonymousData?: boolean;
}

/**
 * Top-level response from `GET /api/apps-open/:appId`. Mirrors
 * `PublicAppInfoDto` on the backend. The entity (`app`) is separated
 * from request-level metadata (`viewer`) so the entity surface stays
 * clean as new per-caller flags get added (favorites, permissions, etc.).
 * The endpoint is anonymous-accessible; `viewer.isOwner` is `false` for
 * unauthenticated callers.
 */
export interface PublicAppInfo {
  app: PublicAppData;
  viewer: PublicAppViewer;
}

/**
 * Maximum time to wait on the platform before treating the fetch as
 * "no data" and returning null. Bounds the wait for explicit server/SSR
 * callers when portal-agent-server is slow or unreachable.
 */
const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Fetches the public profile for the configured app. Returns `null` on
 * any error (network, 404, timeout, malformed response, missing appId)
 * so callers can degrade gracefully when the platform is unreachable.
 *
 * Hits `GET <apiBase>/api/apps-open/:appId`. `apiBase` resolves from the
 * caller-supplied `options.apiBase` first (useful when the host already
 * has the value resolved from a server-only env var on the SSR side),
 * then falls back to the SDK's standard chain via `getPlatformApiBase()`.
 *
 * Wraps the request in a 2-second timeout by default. Callers that need
 * a different bound (or want to drive cancellation from their own
 * AbortController) can pass `options.signal`; it composes with the
 * default timeout via `AbortSignal.any`.
 *
 * The endpoint is anonymous — no identity is forwarded. `viewer.isOwner`
 * always returns `false`.
 */
export async function fetchPublicAppInfo(
  appId: string,
  options: { signal?: AbortSignal; apiBase?: string | null } = {},
): Promise<PublicAppInfo | null> {
  if (!appId) return null;
  const base = options.apiBase
    ? options.apiBase.replace(/\/$/, "")
    : getPlatformApiBase();
  const url = `${base}/api/apps-open/${encodeURIComponent(appId)}`;
  // Compose the caller signal with the timeout so either can abort:
  // - `AbortSignal.timeout` aborts the fetch after DEFAULT_TIMEOUT_MS
  // - the caller's own signal still works for explicit cancellation
  // `AbortSignal.any` is available in Node 20+, modern browsers, and
  // every runtime targeted by `@eazo/sdk` server / client.
  const timeoutSignal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    // Backend envelope: { code, message, data }. `code === 0` means ok.
    const json = (await res.json()) as {
      code?: number;
      data?: PublicAppInfo | null;
    };
    if (typeof json.code === "number" && json.code !== 0) return null;
    return json.data ?? null;
  } catch {
    return null;
  }
}

/** 5-minute TTL for the per-app `sendAnonymousData` consent flag. */
const SEND_ANONYMOUS_DATA_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedConsent {
  value: boolean;
  expiresAt: number;
}

const sendAnonymousDataCache = new Map<string, CachedConsent>();
const inFlightConsent = new Map<string, Promise<boolean>>();

/**
 * Resolves whether the app author opted in to share anonymized usage data
 * (`creator_apps.send_anonymous_data`). Gates `memory.reportAction`.
 *
 * Caches the resolved flag per `appId` for 5 minutes and de-duplicates
 * concurrent lookups so a burst of `reportAction` calls only hits
 * `GET /api/apps-open/:appId` once.
 *
 * Fails open: when `fetchPublicAppInfo` returns null (network error,
 * timeout, 404 for an unpublished app, malformed response) this resolves
 * `true` and does NOT cache, so a transient failure never permanently
 * silences reporting and a later call can re-check.
 */
export async function resolveSendAnonymousDataEnabled(
  appId: string,
): Promise<boolean> {
  if (!appId) return true;

  const cached = sendAnonymousDataCache.get(appId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const existing = inFlightConsent.get(appId);
  if (existing) return existing;

  const promise = (async (): Promise<boolean> => {
    const info = await fetchPublicAppInfo(appId);
    if (info === null) return true; // fail open — do not cache
    const value = info.app.sendAnonymousData === true;
    sendAnonymousDataCache.set(appId, {
      value,
      expiresAt: Date.now() + SEND_ANONYMOUS_DATA_CACHE_TTL_MS,
    });
    return value;
  })().finally(() => {
    inFlightConsent.delete(appId);
  });

  inFlightConsent.set(appId, promise);
  return promise;
}

/** Clears the consent cache. Test-only. */
export function __resetSendAnonymousDataCache(): void {
  sendAnonymousDataCache.clear();
  inFlightConsent.clear();
}
