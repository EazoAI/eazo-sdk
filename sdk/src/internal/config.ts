/**
 * Shared runtime configuration. Dependency-free so both bootstrap and
 * capability modules can read/write without circular imports.
 */

let appId: string | null = null;
let hostInjectedApiBase: string | null = null;

export const DEFAULT_PLATFORM_API_BASE = "https://eazo.ai";

function readEnvByNames(names: readonly string[]): string | null {
  if (typeof process === "undefined" || !process.env) return null;
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

const APP_ID_ENV_NAMES = [
  "EAZO_APP_ID",
  "NEXT_PUBLIC_EAZO_APP_ID",
  "EXPO_PUBLIC_EAZO_APP_ID",
  "VITE_EAZO_APP_ID",
  "PUBLIC_EAZO_APP_ID",
  "REACT_APP_EAZO_APP_ID",
] as const;

const API_BASE_ENV_NAMES = [
  "EAZO_PLATFORM_API_BASE",
  "EAZO_API_BASE",
  "NEXT_PUBLIC_EAZO_API_BASE",
  "NEXT_PUBLIC_EAZO_PLATFORM_API_BASE",
  "EXPO_PUBLIC_EAZO_PLATFORM_API_BASE",
  "VITE_EAZO_PLATFORM_API_BASE",
  "PUBLIC_EAZO_PLATFORM_API_BASE",
  "REACT_APP_EAZO_PLATFORM_API_BASE",
] as const;

/** Set by `<EazoProvider appId={...}>`. */
export function setAppId(id: string | null): void {
  appId = id;
}

/** Explicit value via setAppId, then env-name list, then null. */
export function getAppId(): string | null {
  if (appId) return appId;
  return readEnvByNames(APP_ID_ENV_NAMES);
}

/** Set from `hello.apiBase` during device-capability bootstrap. */
export function setHostApiBase(url: string | null): void {
  hostInjectedApiBase = url ? url.replace(/\/$/, "") : null;
}

export function getPlatformApiBase(override?: string): string {
  if (override) return override.replace(/\/$/, "");
  if (hostInjectedApiBase) return hostInjectedApiBase;
  const fromEnv = readEnvByNames(API_BASE_ENV_NAMES);
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return DEFAULT_PLATFORM_API_BASE;
}

export function readAppIdFromEnv(): string | null {
  return readEnvByNames(APP_ID_ENV_NAMES);
}

/** Env-only lookup; skips the host-injection cache used by getPlatformApiBase. */
export function readApiBaseFromEnv(): string | null {
  return readEnvByNames(API_BASE_ENV_NAMES);
}

export function __resetConfig(): void {
  appId = null;
  hostInjectedApiBase = null;
}
