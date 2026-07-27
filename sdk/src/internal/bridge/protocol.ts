import type { DeviceContext, User } from "../../types";

export const CHANNEL = "eazo-sdk" as const;
export const VERSION = 1 as const;

export const HELLO_TIMEOUT_MS = 1500;
export const REQUEST_TIMEOUT_MS = 10_000;

// Host-mediated method and event names used by capabilities.
export const AUTH_REQUEST_LOGIN = "auth.requestLogin";
export const AUTH_REQUEST_LOGOUT = "auth.requestLogout";
export const AUTH_CHANGED_EVENT = "auth.changed";
export const AUTH_LOGIN_CANCELLED_EVENT = "auth.loginCancelled";
export const DEVICE_CHANGED_EVENT = "device.changed";
export const SHARE_COMPOSE = "share.compose";
export const MEMORY_REPORT_ACTION = "memory.reportAction";
export const NOTIFICATIONS_SUBSCRIBE = "notifications.subscribe";
export const NOTIFICATIONS_UNSUBSCRIBE = "notifications.unsubscribe";
export const NOTIFICATIONS_IS_SUBSCRIBED = "notifications.isSubscribed";

export type ErrorCode =
  | "NOT_SUPPORTED"
  | "TIMEOUT"
  | "DENIED"
  | "INVALID_ARGS"
  | "INTERNAL";

export interface BridgeError {
  code: ErrorCode;
  message: string;
}

interface EnvelopeBase<T extends string> {
  ch: typeof CHANNEL;
  v: typeof VERSION;
  t: T;
}

export interface ReadyEnvelope extends EnvelopeBase<"ready"> {
  /**
   * Eazo app ID — used by the host to request an app-specific session token
   * without a separate backend lookup.
   * Optional — hosts can fall back to other identifiers if absent.
   */
  appId?: string;
}

export interface HelloEnvelope extends EnvelopeBase<"hello"> {
  session: {
    authenticated: boolean;
    user: User | null;
    token: string | null;
  };
  device: DeviceContext;
  capabilities: string[];
  /** Eazo platform URL the host targets. SDK-internal; not exposed to apps. */
  apiBase?: string;
}

export interface RequestEnvelope extends EnvelopeBase<"req"> {
  id: string;
  fn: string;
  args?: unknown;
}

export type ResponseEnvelope =
  | (EnvelopeBase<"res"> & { id: string; ok: true; data?: unknown })
  | (EnvelopeBase<"res"> & { id: string; ok: false; err: BridgeError });

export interface EventEnvelope extends EnvelopeBase<"evt"> {
  name: string;
  data?: unknown;
}

export type HostToAppEnvelope = HelloEnvelope | ResponseEnvelope | EventEnvelope;
export type AppToHostEnvelope = ReadyEnvelope | RequestEnvelope;

export function isEazoEnvelope(msg: unknown): msg is HostToAppEnvelope {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return m["ch"] === CHANNEL && m["v"] === VERSION && typeof m["t"] === "string";
}

export function isCapabilitySupported(capabilities: string[], fn: string): boolean {
  if (capabilities.includes(fn)) return true;
  const [namespace] = fn.split(".");
  return capabilities.includes(`${namespace}.*`);
}

/**
 * BridgeError thrown across capability call sites. The `code` field drives
 * whether the caller falls back to web-native behavior or surfaces the error.
 */
export class BridgeErrorObject extends Error implements BridgeError {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
  }
}
